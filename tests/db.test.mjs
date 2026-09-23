// Applies the Supabase migration to an in-memory Postgres (PGlite), with small
// stand-ins for Supabase's auth and storage schemas, then checks the security
// rules: who can write what, the 60-second limit, counters and privacy.
//
//   npm run test:db

import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, migrationsDir), "utf8"));

const db = new PGlite();

// Minimal stand-ins for what Supabase provides.
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
`);

for (const sql of migrations) await db.exec(sql);
console.log(`${migrations.length} migrations applied`);

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};

async function as(role, uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
async function fails(role, uid, sql, params) {
  try {
    const r = await as(role, uid, sql, params);
    return r.affectedRows === 0 ? "no rows" : false;
  } catch (e) {
    return e.message;
  }
}

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
await db.exec(`insert into auth.users (id, raw_user_meta_data) values ('${A}', '{"display_name":"Ada"}'), ('${B}', '{}')`);

const profiles = await db.query("select id, username, display_name from public.profiles order by id");
ok(profiles.rows.length === 2, "signup trigger creates profiles");
ok(profiles.rows[0].username === "builder_1111111111" && profiles.rows[0].display_name === "Ada", "placeholder username + display name");

// Profile edits
await as("authenticated", A, "update public.profiles set username = 'ada', roles = '{founder,hiring}' where id = $1", [A]);
ok((await db.query("select username from public.profiles where id = $1", [A])).rows[0].username === "ada", "owner can edit own profile");
ok(!!(await fails("authenticated", A, "update public.profiles set follower_count = 999 where id = $1", [A])), "cannot set follower_count directly");
ok(!!(await fails("authenticated", B, "update public.profiles set bio = 'x' where id = $1", [A])), "cannot edit someone else's profile");
ok(!!(await fails("authenticated", A, "update public.profiles set roles = '{astronaut}' where id = $1", [A])), "unknown role rejected");

// Apps
await db.exec("reset role");
const appInsert = `insert into public.apps (owner_id, slug, name, tagline, url, category) values ($1, 'noteflow', 'NoteFlow', 'Notes that flow', 'https://example.com', 'productivity') returning id`;
const inserted = await as("authenticated", A, appInsert, [A]);
const appId = inserted.rows[0].id;
ok(!!appId, "builder can add own app");
ok(!!(await fails("authenticated", B, appInsert.replace("noteflow", "other"), [A])), "cannot add app as someone else");
ok(!!(await fails("authenticated", A, `insert into public.apps (owner_id, slug, name, tagline, url, category, link_checked_at) values ($1, 'x2', 'X', 'Y', 'https://e.com', 'ai', now())`, [A])), "cannot self-mark link as checked");
ok(!!(await fails("authenticated", A, "update public.apps set url = 'https://evil.example' where id = $1", [appId])), "cannot change url after the check");
ok(!!(await fails("authenticated", A, "update public.apps set try_count = 1000 where id = $1", [appId])), "cannot inflate try_count");
ok(!!(await fails("authenticated", A, `insert into public.apps (owner_id, slug, name, tagline, url, category) values ($1, 'x3', 'X', 'Y', 'javascript:alert(1)', 'ai')`, [A])), "non-http url rejected");
await db.query("update public.apps set link_checked_at = now() where id = $1", [appId]); // service role

// Drops
const dropSql = `insert into public.drops (app_id, owner_id, video_path, duration_seconds) values ($1, $2, $3, $4) returning id`;
const drop = await as("authenticated", A, dropSql, [appId, A, `${A}/v.mp4`, 42.5]);
const dropId = drop.rows[0].id;
ok(!!dropId, "builder can post a Drop for own app");
ok(!!(await fails("authenticated", A, dropSql, [appId, A, `${A}/v2.mp4`, 61])), "Drop over 60 seconds rejected");
ok(!!(await fails("authenticated", A, dropSql, [appId, A, `${B}/v3.mp4`, 30])), "Drop video must be in own folder");
ok(!!(await fails("authenticated", B, dropSql, [appId, B, `${B}/v4.mp4`, 30])), "cannot post a Drop for someone else's app");

// Likes + counters
await as("authenticated", B, "insert into public.likes (user_id, drop_id) values ($1, $2)", [B, dropId]);
let counts = (await db.query("select d.like_count dl, a.like_count al from public.drops d join public.apps a on a.id = d.app_id where d.id = $1", [dropId])).rows[0];
ok(counts.dl === 1 && counts.al === 1, "like bumps drop and app counters");
ok(!!(await fails("authenticated", B, "insert into public.likes (user_id, drop_id) values ($1, $2)", [A, dropId])), "cannot like as someone else");
const seen = await as("authenticated", A, "select * from public.likes");
ok(seen.rows.length === 0, "likes by others are not readable");
await as("authenticated", B, "delete from public.likes where user_id = $1 and drop_id = $2", [B, dropId]);
counts = (await db.query("select like_count from public.drops where id = $1", [dropId])).rows[0];
ok(counts.like_count === 0, "unlike decrements counter");

// Comments
await as("authenticated", B, "insert into public.comments (drop_id, user_id, body) values ($1, $2, 'Nice!')", [dropId, B]);
ok((await db.query("select comment_count from public.drops where id = $1", [dropId])).rows[0].comment_count === 1, "comment bumps counter");
ok(!!(await fails("authenticated", B, "insert into public.comments (drop_id, user_id, body) values ($1, $2, '   ')", [dropId, B])), "blank comment rejected");
ok((await as("anon", null, "select body from public.comments")).rows.length === 1, "comments are public");

// Follows
await as("authenticated", B, "insert into public.follows (follower_id, following_id) values ($1, $2)", [B, A]);
const f = (await db.query("select id, follower_count, following_count from public.profiles order by id")).rows;
ok(f[0].follower_count === 1 && f[1].following_count === 1, "follow bumps both counters");
ok(!!(await fails("authenticated", A, "insert into public.follows (follower_id, following_id) values ($1, $1)", [A])), "cannot follow yourself");

// Try clicks
await as("anon", null, "insert into public.try_clicks (app_id) values ($1)", [appId]);
await as("authenticated", B, "insert into public.try_clicks (app_id, user_id) values ($1, $2)", [appId, B]);
ok(!!(await fails("authenticated", B, "insert into public.try_clicks (app_id, user_id) values ($1, $2)", [appId, B])), "signed-in try counted once per person");
ok((await db.query("select try_count from public.apps where id = $1", [appId])).rows[0].try_count === 2, "try_count counts tries");
ok((await as("anon", null, "select * from public.try_clicks")).rows.length === 0, "try clicks are not readable");
ok(!!(await fails("anon", null, "insert into public.try_clicks (app_id, user_id) values ($1, $2)", [appId, A])), "anon cannot record a try as a user");

// Storage
await as("authenticated", A, "insert into storage.objects (bucket_id, name) values ('drops', $1)", [`${A}/clip.mp4`]);
ok(!!(await fails("authenticated", A, "insert into storage.objects (bucket_id, name) values ('drops', $1)", [`${B}/clip.mp4`])), "cannot upload into someone else's folder");
ok(!!(await fails("anon", null, "insert into storage.objects (bucket_id, name) values ('drops', $1)", [`${A}/x.mp4`])), "signed-out upload rejected");

// Search column
const s = await db.query("select name from public.apps where search @@ websearch_to_tsquery('english', 'notes')");
ok(s.rows.length === 1, "full-text search finds the app");

// ---------------------------------------------------------------------------
// Phase 3: credits and feedback
// ---------------------------------------------------------------------------

const credits = async (id) => (await db.query("select credits from public.profiles where id = $1", [id])).rows[0].credits;
const C = "33333333-3333-3333-3333-333333333333";
const D = "44444444-4444-4444-4444-444444444444";
const E = "55555555-5555-5555-5555-555555555555";
await db.exec(`insert into auth.users (id) values ('${C}'), ('${D}'), ('${E}')`);

ok((await credits(A)) === 10 && (await credits(B)) === 10, "existing builders get 10 welcome credits");
ok((await credits(C)) === 10, "new sign-ups get 10 welcome credits");
ok(!!(await fails("authenticated", A, "insert into public.credit_events (user_id, delta, reason) values ($1, 100, 'welcome')", [A])), "cannot write credits directly");
ok(!!(await fails("authenticated", A, "update public.profiles set credits = 999 where id = $1", [A])), "cannot set own balance");
ok((await as("authenticated", B, "select * from public.credit_events")).rows.every((r) => r.user_id === B), "credit history is private");

const fbSql = `insert into public.feedback (app_id, user_id, would_use, rating, worked, confusing) values ($1, $2, $3, $4, $5, $6) returning earned`;
const good = "The onboarding was quick and clear.";

// B already tried the app in the Phase 1 tests. Not in the queue yet: no reward.
const fbB = await as("authenticated", B, fbSql, [appId, B, "yes", 5, good, ""]);
ok(fbB.rows[0].earned === 0, "feedback on an app not in the queue earns nothing");
ok((await credits(B)) === 10, "…and B's balance is unchanged");
ok(!!(await fails("authenticated", B, fbSql, [appId, B, "no", 1, good, ""])), "one feedback per person per app");
ok(!!(await fails("authenticated", C, fbSql, [appId, C, "yes", 4, good, ""])), "must try the app before giving feedback");
await as("authenticated", A, "insert into public.try_clicks (app_id, user_id) values ($1, $2)", [appId, A]);
ok(!!(await fails("authenticated", A, fbSql, [appId, A, "yes", 5, good, ""])), "cannot give feedback on your own app");
await as("authenticated", C, "insert into public.try_clicks (app_id, user_id) values ($1, $2)", [appId, C]);
ok(!!(await fails("authenticated", C, fbSql, [appId, C, "yes", 4, "too short", ""])), "feedback needs at least 10 characters on what worked");
ok(!!(await fails("authenticated", C, fbSql, [appId, C, "yes", 6, good, ""])), "rating must be 1–5");

// A buys 3 testers for 6 credits.
await as("authenticated", A, "select public.request_testers($1, 3)", [appId]);
ok((await credits(A)) === 4, "asking for 3 testers costs 6 credits");
let req = (await db.query("select slots_total, slots_filled from public.test_requests where app_id = $1", [appId])).rows[0];
ok(req.slots_total === 3 && req.slots_filled === 0, "app enters the test queue with 3 spots");
ok(!!(await fails("authenticated", A, "select public.request_testers($1, 10)", [appId])), "can't spend more credits than you have");
ok((await credits(A)) === 4, "…and a failed request costs nothing");
ok(!!(await fails("authenticated", B, "select public.request_testers($1, 1)", [appId])), "can't buy testers for someone else's app");
ok(!!(await fails("anon", null, "select public.request_testers($1, 1)", [appId])), "signed-out people can't call it");

const fbC = await as("authenticated", C, fbSql, [appId, C, "maybe", 3, good, "The pricing page was hard to find."]);
ok(fbC.rows[0].earned === 2, "feedback on a queued app earns 2 credits");
ok((await credits(C)) === 12, "…and lands in the tester's balance");
req = (await db.query("select slots_filled from public.test_requests where app_id = $1", [appId])).rows[0];
ok(req.slots_filled === 1, "…and fills one spot");

const stats = (await db.query("select feedback_count, would_use_yes_count, rating_sum from public.apps where id = $1", [appId])).rows[0];
ok(stats.feedback_count === 2 && stats.would_use_yes_count === 1 && stats.rating_sum === 8, "app totals update");
ok((await db.query("select feedback_given_count from public.profiles where id = $1", [C])).rows[0].feedback_given_count === 1, "tester's feedback count updates");

ok((await as("authenticated", A, "select * from public.feedback")).rows.length === 2, "builder sees all feedback on their app");
ok((await as("authenticated", B, "select * from public.feedback")).rows.length === 1, "tester sees only their own feedback");
ok((await as("authenticated", D, "select * from public.feedback")).rows.length === 0, "others can't read feedback");
ok((await as("anon", null, "select * from public.feedback")).rows.length === 0, "signed-out people can't read feedback");
ok(!!(await fails("authenticated", C, "update public.feedback set rating = 5 where user_id = $1", [C])), "feedback can't be edited");
ok(!!(await fails("authenticated", C, "delete from public.feedback where user_id = $1", [C])), "feedback can't be deleted");

// Helpful bonus.
const fbCId = (await db.query("select id from public.feedback where user_id = $1", [C])).rows[0].id;
ok(!!(await fails("authenticated", B, "select public.mark_feedback_helpful($1)", [fbCId])), "only the builder can mark feedback helpful");
await as("authenticated", A, "select public.mark_feedback_helpful($1)", [fbCId]);
ok((await credits(C)) === 13, "helpful feedback earns the tester +1");
ok(!!(await fails("authenticated", A, "select public.mark_feedback_helpful($1)", [fbCId])), "helpful only counts once");

// Cancel refunds the 2 unused spots.
const refunded = await as("authenticated", A, "select public.cancel_test_request($1) as n", [appId]);
ok(refunded.rows[0].n === 2 && (await credits(A)) === 8, "cancelling refunds unused spots (2 × 2 credits)");
req = (await db.query("select slots_total, slots_filled from public.test_requests where app_id = $1", [appId])).rows[0];
ok(req.slots_total === req.slots_filled, "cancelled request leaves the queue");

// Daily cap: a tester who already earned 10 times today earns nothing and doesn't use up a spot.
await as("authenticated", A, "select public.request_testers($1, 1)", [appId]);
await db.query(`insert into public.credit_events (user_id, delta, reason) select $1, 2, 'feedback_reward' from generate_series(1, 10)`, [E]);
await as("authenticated", E, "insert into public.try_clicks (app_id, user_id) values ($1, $2)", [appId, E]);
const fbE = await as("authenticated", E, fbSql, [appId, E, "yes", 4, good, ""]);
ok(fbE.rows[0].earned === 0, "daily cap: 11th paid feedback in 24h earns nothing");
req = (await db.query("select slots_total, slots_filled from public.test_requests where app_id = $1", [appId])).rows[0];
ok(req.slots_filled < req.slots_total, "…and the spot stays open for someone else");

let overdraft = false;
try {
  await db.query("insert into public.credit_events (user_id, delta, reason) values ($1, -1000, 'testers_requested')", [D]);
} catch {
  overdraft = true;
}
ok(overdraft, "balances can never go negative");

// Featured apps
ok(!!(await fails("authenticated", A, "update public.apps set featured_until = now() + interval '7 days' where id = $1", [appId])), "builders can't feature their own app");
await db.query("update public.apps set featured_until = now() + interval '7 days' where id = $1", [appId]);
ok((await as("anon", null, "select id from public.apps where featured_until > now()")).rows.length === 1, "featured apps are public");

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
