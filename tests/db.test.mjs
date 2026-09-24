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
    // An update/delete that matched nothing counts as blocked. A select that
    // returned a row (e.g. calling a function) succeeded.
    return r.affectedRows === 0 && r.rows.length === 0 ? "no rows" : false;
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

// ---------------------------------------------------------------------------
// Phase 3, part 2: passport, launches, boosts, updates, swaps
// ---------------------------------------------------------------------------

const rankOf = async (id) =>
  (await db.query("select public.tester_rank(feedback_given_count, feedback_helpful_count) r from public.profiles where id = $1", [id])).rows[0].r;
ok((await db.query("select public.tester_rank(4, 0) a, public.tester_rank(5, 0) b, public.tester_rank(15, 3) c, public.tester_rank(40, 10) d, public.tester_rank(100, 30) e, public.tester_rank(100, 29) f")).rows[0].f === "pro", "rank thresholds (100 given but 29 helpful is still Pro)");
const r = (await db.query("select public.tester_rank(4, 0) a, public.tester_rank(5, 0) b, public.tester_rank(15, 3) c, public.tester_rank(40, 10) d, public.tester_rank(100, 30) e")).rows[0];
ok(r.a === "new" && r.b === "scout" && r.c === "tester" && r.d === "pro" && r.e === "trusted", "ranks: new, scout, tester, pro, trusted");

// A "Tester"-rank user earns 3 per paid feedback.
const T = "66666666-6666-6666-6666-666666666666";
await db.exec(`insert into auth.users (id) values ('${T}')`);
await db.query("update public.profiles set feedback_given_count = 15, feedback_helpful_count = 3 where id = $1", [T]);
ok((await rankOf(T)) === "tester", "profile reaches Tester rank");
await as("authenticated", A, "select public.request_testers($1, 1)", [appId]);
await as("authenticated", T, "insert into public.try_clicks (app_id, user_id) values ($1, $2)", [appId, T]);
const before = await credits(T);
const fbT = await as("authenticated", T, fbSql, [appId, T, "yes", 5, good, ""]);
ok(fbT.rows[0].earned === 3 && (await credits(T)) === before + 3, "Tester rank earns 3 credits per paid feedback");

// Weekly streak: 3 earlier weeks with feedback, then a 4th this week → +5.
const S = "77777777-7777-7777-7777-777777777777";
await db.exec(`insert into auth.users (id) values ('${S}')`);
const makeApp = async (owner, slug) => {
  const res = await db.query(
    `insert into public.apps (owner_id, slug, name, tagline, url, category, link_checked_at) values ($1, $2, $2, 'x', 'https://example.com', 'games', now()) returning id`,
    [owner, slug],
  );
  return res.rows[0].id;
};
for (let wk = 1; wk <= 3; wk++) {
  const a = await makeApp(A, `streak-${wk}`);
  await db.query(
    `insert into public.feedback (app_id, user_id, would_use, rating, worked, created_at) values ($1, $2, 'yes', 4, $3, date_trunc('week', now()) - make_interval(weeks => $4) + interval '1 day')`,
    [a, S, good, wk],
  );
}
const s0 = await credits(S);
const a4 = await makeApp(A, "streak-4");
await as("authenticated", S, "insert into public.try_clicks (app_id, user_id) values ($1, $2)", [a4, S]);
await as("authenticated", S, fbSql, [a4, S, "yes", 4, good, ""]);
ok((await credits(S)) === s0 + 5, "4-week streak earns a +5 bonus");
const a5 = await makeApp(A, "streak-5");
await as("authenticated", S, "insert into public.try_clicks (app_id, user_id) values ($1, $2)", [a5, S]);
await as("authenticated", S, fbSql, [a5, S, "yes", 4, good, ""]);
ok((await credits(S)) === s0 + 5, "second feedback in the same week doesn't repeat the bonus");

const passport = (await as("anon", null, "select public.tester_passport($1) p", [S])).rows[0].p;
ok(passport.streak === 4 && passport.categories.games === 5 && passport.categories.productivity === undefined, `passport shows stamps per category and the streak (${JSON.stringify(passport)})`);
const top = (await as("anon", null, "select * from public.top_testers(5)")).rows;
ok(top.length > 0 && top.every((t) => !("worked" in t)), "top testers board is public and shows counts only");

// Launch days
ok(!!(await fails("authenticated", A, "select public.schedule_launch($1, now() + interval '10 minutes')", [appId])), "launch must be at least an hour away");
ok(!!(await fails("authenticated", A, "select public.schedule_launch($1, now() + interval '40 days')", [appId])), "launch must be within 30 days");
ok(!!(await fails("authenticated", B, "select public.schedule_launch($1, now() + interval '2 days')", [appId])), "can't schedule someone else's launch");
await as("authenticated", A, "select public.schedule_launch($1, now() + interval '2 days')", [appId]);
ok((await db.query("select launch_at > now() ok from public.apps where id = $1", [appId])).rows[0].ok, "builder schedules a launch day");
ok(!!(await fails("authenticated", A, "update public.apps set launch_at = now() where id = $1", [appId])), "can't set launch_at directly");
await as("authenticated", A, "select public.cancel_launch($1)", [appId]);
ok((await db.query("select launch_at from public.apps where id = $1", [appId])).rows[0].launch_at === null, "upcoming launch can be cancelled");
await db.query("update public.apps set launch_at = now() - interval '2 hours' where id = $1", [appId]);
ok(!!(await fails("authenticated", A, "select public.schedule_launch($1, now() + interval '2 days')", [appId])), "one launch day per app");

// Boosts
await db.query("insert into public.credit_events (user_id, delta, reason) values ($1, 30, 'welcome')", [A]);
const cA = await credits(A);
await as("authenticated", A, "select public.boost_app($1, 2)", [appId]);
ok((await credits(A)) === cA - 20, "boosting 2 days costs 20 credits");
const b1 = (await db.query("select boosted_until from public.apps where id = $1", [appId])).rows[0].boosted_until;
await as("authenticated", A, "select public.boost_app($1, 1)", [appId]);
const b2 = (await db.query("select boosted_until from public.apps where id = $1", [appId])).rows[0].boosted_until;
ok(Math.round((b2 - b1) / 3600000) === 24, "boosting again extends by a day");
ok(!!(await fails("authenticated", A, "select public.boost_app($1, 7)", [appId])), "can't boost without enough credits");
ok(!!(await fails("authenticated", B, "select public.boost_app($1, 1)", [appId])), "can't boost someone else's app");
ok(!!(await fails("authenticated", A, "update public.apps set boosted_until = now() + interval '1 year' where id = $1", [appId])), "can't set boosted_until directly");

// Updates
await as("authenticated", A, "insert into public.updates (user_id, app_id, body) values ($1, $2, 'Shipped dark mode today')", [A, appId]);
ok((await as("anon", null, "select body from public.updates")).rows.length === 1, "updates are public");
ok(!!(await fails("authenticated", B, "insert into public.updates (user_id, app_id, body) values ($1, $2, 'hijack')", [B, appId])), "can't post updates on someone else's app");
ok(!!(await fails("authenticated", B, "insert into public.updates (user_id, body) values ($1, '   ')", [B])), "empty update rejected");
ok(!!(await fails("authenticated", B, "delete from public.updates")), "can't delete other people's updates");

// Swaps and co-launches
const appB = await makeApp(B, "b-app");
const appC = await makeApp(C, "c-app");
const swapId = (await as("authenticated", B, "select public.propose_swap($1, $2, 'swap') id", [appB, appId])).rows[0].id;
ok(!!swapId, "builder proposes a swap");
ok(!!(await fails("authenticated", B, "select public.propose_swap($1, $2, 'swap')", [appB, appId])), "no duplicate open swap for the same pair");
ok(!!(await fails("authenticated", A, "select public.propose_swap($1, $2, 'swap')", [appId, appB])), "…in either direction");
ok(!!(await fails("authenticated", A, "select public.propose_swap($1, $2, 'swap')", [appId, (await makeApp(A, "a-two"))])), "can't swap with your own app");
ok((await as("authenticated", D, "select * from public.swaps")).rows.length === 0, "pending swaps are private to the two builders");
ok(!!(await fails("authenticated", B, "select public.respond_swap($1, true)", [swapId])), "only the receiving builder can accept");
await as("authenticated", A, "select public.respond_swap($1, true)", [swapId]);
ok((await as("anon", null, "select status from public.swaps where id = $1", [swapId])).rows[0]?.status === "accepted", "accepted swaps are public");

const coId = (await as("authenticated", B, "select public.propose_swap($1, $2, 'colaunch', now() + interval '3 days') id", [appB, appC])).rows[0].id;
await as("authenticated", C, "select public.respond_swap($1, true)", [coId]);
const launches = (await db.query("select launch_at from public.apps where id in ($1, $2)", [appB, appC])).rows;
ok(launches.length === 2 && +launches[0].launch_at === +launches[1].launch_at, "accepting a co-launch gives both apps the same launch day");
ok(!!(await fails("authenticated", B, "select public.propose_swap($1, $2, 'colaunch', now() + interval '3 days')", [appB, appId])), "can't co-launch with an app that already launched");

await as("authenticated", A, "select public.end_swap($1)", [swapId]);
ok((await db.query("select status from public.swaps where id = $1", [swapId])).rows[0].status === "ended", "either side can end a swap");
ok(!!(await fails("authenticated", D, "select public.end_swap($1)", [coId])), "outsiders can't end a swap");

// Swap partner limit (3)
const partners = [];
for (let i = 0; i < 3; i++) {
  const owner = [C, D, E][i];
  const other = await makeApp(owner, `partner-${i}`);
  const id = (await as("authenticated", owner, "select public.propose_swap($1, $2, 'swap') id", [other, appB])).rows[0].id;
  await as("authenticated", B, "select public.respond_swap($1, true)", [id]);
  partners.push(other);
}
const extra = await makeApp(T, "partner-extra");
ok(!!(await fails("authenticated", T, "select public.propose_swap($1, $2, 'swap')", [extra, appB])), "an app can have at most 3 swap partners");

// ---------------------------------------------------------------------------
// Phase 2: connections, messages, Q&A, notifications, suggestions
// ---------------------------------------------------------------------------

const notes = async (id) =>
  (await db.query("select kind, actor_id from public.notifications where user_id = $1 order by id", [id])).rows;

// Notifications from earlier actions (follows, likes, feedback, swaps) exist.
const aNotes = await notes(A);
ok(aNotes.some((n) => n.kind === "follow" && n.actor_id === B), "A was notified when B followed");
ok(aNotes.some((n) => n.kind === "feedback"), "A was notified about feedback");
ok(aNotes.every((n) => n.actor_id !== A), "nobody is notified about their own actions");
ok((await as("authenticated", B, "select * from public.notifications")).rows.every((n) => n.user_id === B), "notifications are private");
ok(!!(await fails("authenticated", A, "insert into public.notifications (user_id, kind) values ($1, 'follow')", [B])), "can't create notifications directly");

// Likes don't pile up: like, unlike, like again → one unread notification.
const likeCount = async () => (await db.query("select count(*)::int n from public.notifications where user_id = $1 and kind = 'like'", [A])).rows[0].n;
const l0 = await likeCount();
await as("authenticated", C, "insert into public.likes (user_id, drop_id) values ($1, $2)", [C, dropId]);
await as("authenticated", C, "delete from public.likes where user_id = $1 and drop_id = $2", [C, dropId]);
await as("authenticated", C, "insert into public.likes (user_id, drop_id) values ($1, $2)", [C, dropId]);
ok((await likeCount()) === l0 + 1, "repeat likes don't repeat the notification");
await as("authenticated", A, "select public.mark_notifications_read()");
ok((await db.query("select count(*)::int n from public.notifications where user_id = $1 and read_at is null", [A])).rows[0].n === 0, "mark all read");

// Connections
ok(!!(await fails("authenticated", B, "insert into public.connections (requester_id, addressee_id, reason) values ($1, $2, 'fan')", [B, A])), "can't insert connections directly");
ok(!!(await fails("authenticated", B, "select public.request_connection($1, 'party')", [A])), "a reason is required");
ok(!!(await fails("authenticated", B, "select public.request_connection($1, 'fan')", [B])), "can't connect with yourself");
const r1 = (await as("authenticated", B, "select public.request_connection($1, 'hire', 'Love NoteFlow. Open to contract work?') r", [A])).rows[0].r;
ok(r1 === "requested", "B asks A to connect (reason: hire, with a note)");
ok((await notes(A)).some((n) => n.kind === "connection_request" && n.actor_id === B), "A is notified of the request");
ok(!!(await fails("authenticated", B, "select public.request_connection($1, 'fan')", [A])), "no duplicate request");
ok(!!(await fails("authenticated", B, "insert into public.messages (sender_id, recipient_id, body) values ($1, $2, 'hi')", [B, A])), "can't message before the request is accepted");
ok((await as("authenticated", D, "select * from public.connections")).rows.length === 0, "connections are private to the two people");
const connId = (await db.query("select id from public.connections where requester_id = $1 and addressee_id = $2", [B, A])).rows[0].id;
ok(!!(await fails("authenticated", B, "select public.respond_connection($1, true)", [connId])), "requester can't accept their own request");
await as("authenticated", A, "select public.respond_connection($1, true)", [connId]);
const cc = (await db.query("select connection_count from public.profiles where id in ($1, $2) order by id", [A, B])).rows;
ok(cc.every((r) => r.connection_count === 1), "accepting bumps both connection counts");
ok((await notes(B)).some((n) => n.kind === "connection_accepted" && n.actor_id === A), "B is notified when A accepts");
ok((await as("authenticated", B, "select public.request_connection($1, 'fan') r", [A]).catch((e) => ({ rows: [{ r: e.message }] }))).rows[0].r.includes("already connected"), "can't request twice once connected");

// Connecting back to someone who asked you accepts it.
await as("authenticated", C, "select public.request_connection($1, 'collaborate')", [D]);
const r2 = (await as("authenticated", D, "select public.request_connection($1, 'fan') r", [C])).rows[0].r;
ok(r2 === "accepted", "connecting back to a pending request accepts it");

// Messages
await as("authenticated", B, "insert into public.messages (sender_id, recipient_id, body) values ($1, $2, 'Hey! Loved your launch.')", [B, A]);
await as("authenticated", A, "insert into public.messages (sender_id, recipient_id, body) values ($1, $2, 'Thanks! Want to team up?')", [A, B]);
ok((await as("authenticated", A, "select * from public.messages")).rows.length === 2, "connected people can message");
ok((await as("authenticated", D, "select * from public.messages")).rows.length === 0, "messages are private");
ok(!!(await fails("authenticated", B, "insert into public.messages (sender_id, recipient_id, body) values ($1, $2, 'spoof')", [A, B])), "can't send as someone else");
ok(!!(await fails("authenticated", B, "insert into public.messages (sender_id, recipient_id, body) values ($1, $2, 'hi')", [B, E])), "can't message people you aren't connected to");
ok(!!(await fails("authenticated", B, "update public.messages set body = 'edited'")), "messages can't be edited");
await as("authenticated", A, "select public.mark_thread_read($1)", [B]);
ok((await db.query("select read_at from public.messages where recipient_id = $1", [A])).rows.every((m) => m.read_at), "opening a thread marks it read");

// Removing the connection stops messaging.
await as("authenticated", A, "select public.remove_connection($1)", [connId]);
ok(!!(await fails("authenticated", B, "insert into public.messages (sender_id, recipient_id, body) values ($1, $2, 'still there?')", [B, A])), "no messaging after a connection is removed");
ok((await db.query("select connection_count from public.profiles where id = $1", [A])).rows[0].connection_count === 0, "removing drops the count");

// Declined requests can't be re-sent for 30 days.
await as("authenticated", E, "select public.request_connection($1, 'invest')", [A]);
const eReq = (await db.query("select id from public.connections where requester_id = $1", [E])).rows[0].id;
await as("authenticated", A, "select public.respond_connection($1, false)", [eReq]);
ok(!!(await fails("authenticated", E, "select public.request_connection($1, 'invest')", [A])), "can't ask again right after a decline");

// Q&A
const qid = (await as("authenticated", C, "insert into public.questions (app_id, user_id, body) values ($1, $2, 'Does it work offline?') returning id", [appId, C])).rows[0].id;
ok(!!qid, "anyone signed in can ask on an app");
ok((await notes(A)).some((n) => n.kind === "question" && n.actor_id === C), "builder is notified of the question");
ok(!!(await fails("authenticated", C, "insert into public.questions (app_id, user_id, body) values ($1, $2, 'hm')", [appId, C])), "questions need at least 5 characters");
ok(!!(await fails("authenticated", C, "insert into public.questions (app_id, user_id, body, vote_count) values ($1, $2, 'Can I fake votes?', 99)", [appId, C])), "can't set vote counts");

const ans1 = (await as("authenticated", A, "insert into public.answers (question_id, user_id, body) values ($1, $2, 'Yes, fully offline since v2.') returning id", [qid, A])).rows[0].id;
const ans2 = (await as("authenticated", D, "insert into public.answers (question_id, user_id, body) values ($1, $2, 'I use it on flights, works great.') returning id", [qid, D])).rows[0].id;
ok((await db.query("select answer_count from public.questions where id = $1", [qid])).rows[0].answer_count === 2, "answer count updates");
ok((await notes(C)).some((n) => n.kind === "answer"), "asker is notified of answers");

const rep = async (id) => (await db.query("select reputation from public.profiles where id = $1", [id])).rows[0].reputation;
const repD = await rep(D);
await as("authenticated", C, "insert into public.answer_votes (user_id, answer_id) values ($1, $2)", [C, ans2]);
await as("authenticated", B, "insert into public.answer_votes (user_id, answer_id) values ($1, $2)", [B, ans2]);
ok((await rep(D)) === repD + 2, "each upvote on an answer is +1 reputation");
ok(!!(await fails("authenticated", D, "insert into public.answer_votes (user_id, answer_id) values ($1, $2)", [D, ans2])), "can't upvote your own answer");
ok(!!(await fails("authenticated", C, "insert into public.answer_votes (user_id, answer_id) values ($1, $2)", [C, ans2])), "one vote per person");
await as("authenticated", B, "delete from public.answer_votes where user_id = $1 and answer_id = $2", [B, ans2]);
ok((await rep(D)) === repD + 1, "taking a vote back takes the point back");
await as("authenticated", B, "insert into public.question_votes (user_id, question_id) values ($1, $2)", [B, qid]);
ok((await db.query("select vote_count from public.questions where id = $1", [qid])).rows[0].vote_count === 1, "questions can be upvoted too");

ok(!!(await fails("authenticated", B, "select public.mark_best_answer($1, $2)", [qid, ans2])), "only the asker or builder picks the best answer");
await as("authenticated", C, "select public.mark_best_answer($1, $2)", [qid, ans2]);
ok((await rep(D)) === repD + 1 + 5, "best answer is +5 reputation");
ok((await notes(D)).some((n) => n.kind === "best_answer"), "author is notified of the best answer");
const repA = await rep(A);
await as("authenticated", A, "select public.mark_best_answer($1, $2)", [qid, ans1]);
ok((await rep(D)) === repD + 1 && (await rep(A)) === repA + 5, "changing the best answer moves the 5 points");
ok(!!(await fails("authenticated", C, "select public.mark_best_answer($1, $2)", [qid, "00000000-0000-0000-0000-000000000000"])), "best answer must be on the question");
await as("authenticated", A, "delete from public.answers where id = $1", [ans1]);
const qAfter = (await db.query("select best_answer_id, answer_count from public.questions where id = $1", [qid])).rows[0];
ok(qAfter.best_answer_id === null && qAfter.answer_count === 1 && (await rep(A)) === repA, "deleting the best answer clears it and its points");

// Suggestions: E likes nothing yet; give E skills and a liked app to match on.
await db.query("update public.profiles set skills = '{Next.js,Figma}' where id in ($1, $2)", [E, T]);
const sug = (await as("authenticated", E, "select * from public.suggest_builders(10)")).rows;
ok(sug.length > 0 && sug.every((s) => s.id !== E), "suggests builders, never yourself");
ok(sug.some((s) => s.id === T && s.shared_skills.includes("Next.js")), "matches on shared skills");
await as("authenticated", E, "insert into public.follows (follower_id, following_id) values ($1, $2)", [E, T]);
ok(!(await as("authenticated", E, "select * from public.suggest_builders(10)")).rows.some((s) => s.id === T), "people you follow aren't suggested");
ok((await as("anon", null, "select * from public.suggest_builders(10)").catch(() => ({ rows: [] }))).rows.length === 0, "no suggestions when signed out");

// ---------------------------------------------------------------------------
// Phase 4: jobs, payments, backers, sponsorships, challenges, Pro
// ---------------------------------------------------------------------------

const H = "88888888-8888-8888-8888-888888888888"; // hiring builder / host
const J = "99999999-9999-9999-9999-999999999999"; // job seeker / sponsor
const F = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"; // fan
const N = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"; // brand-new account
await db.exec(`insert into auth.users (id) values ('${H}'), ('${J}'), ('${F}'), ('${N}')`);
await db.query("update public.profiles set created_at = now() - interval '3 days' where id in ($1, $2, $3)", [H, J, F]);

// Jobs board
const jobSql = "insert into public.jobs (user_id, kind, title, body, pay) values ($1, $2, $3, 'Build our onboarding', '$60/hr') returning id";
const job = (await as("authenticated", H, jobSql, [H, "hiring", "Frontend engineer (React)"])).rows[0].id;
ok(!!job, "anyone signed in can post a job");
ok(!!(await fails("authenticated", H, jobSql, [H, "hiring", "Hi"])), "job titles need 5+ characters");
ok(!!(await fails("authenticated", H, jobSql, [J, "hiring", "Posting as someone else"])), "can't post as someone else");
ok(!!(await fails("authenticated", H, "insert into public.jobs (user_id, kind, title, application_count) values ($1, 'gig', 'Fake counts here', 50)", [H])), "can't set application counts");
for (let i = 0; i < 4; i++) await as("authenticated", H, jobSql, [H, "gig", `Gig number ${i + 1}`]);
ok(!!(await fails("authenticated", H, jobSql, [H, "gig", "One too many gigs"])), "up to 5 open posts per person");
const looking = (await as("authenticated", J, jobSql, [J, "looking", "Designer looking for work"])).rows[0].id;
ok((await as("anon", null, "select id from public.jobs")).rows.length === 6, "open posts are public");

const applySql = "insert into public.job_applications (job_id, user_id, note) values ($1, $2, $3) returning id";
const application = (await as("authenticated", J, applySql, [job, J, "I built the NoteFlow editor."])).rows[0].id;
ok(!!application, "people can apply to a job");
ok((await db.query("select application_count from public.jobs where id = $1", [job])).rows[0].application_count === 1, "application count updates");
ok((await notes(H)).some((n) => n.kind === "job_application" && n.actor_id === J), "poster is notified of applications");
ok(!!(await fails("authenticated", J, applySql, [job, J, "Applying twice"])), "one application per job");
ok(!!(await fails("authenticated", H, applySql, [job, H, "My own job"])), "can't apply to your own post");
ok(!!(await fails("authenticated", H, applySql, [looking, H, "Hire me?"])), "can't apply to a looking-for-work post");
ok((await as("authenticated", F, "select id from public.job_applications")).rows.length === 0, "applications are private to applicant and poster");
ok((await as("authenticated", H, "select id from public.job_applications")).rows.length === 1, "poster sees applications");
ok(!!(await fails("authenticated", F, "select public.respond_application($1, true)", [application])), "only the poster can shortlist");
await as("authenticated", H, "select public.respond_application($1, true)", [application]);
ok((await as("authenticated", J, "select public.are_connected($1, $2) as c", [H, J])).rows[0].c, "shortlisting connects you so you can message");
ok((await notes(J)).some((n) => n.kind === "application_shortlisted"), "applicant is told they were shortlisted");
ok(!(await notes(J)).some((n) => n.kind === "connection_request"), "no stray connect request from shortlisting");
ok((await db.query("select connection_count from public.profiles where id = $1", [H])).rows[0].connection_count === 1, "shortlisting counts the connection");
await as("authenticated", H, "update public.jobs set status = 'closed' where id = $1", [job]);
ok(!!(await fails("authenticated", F, applySql, [job, F, "Too late?"])), "closed posts take no applications");
ok((await as("anon", null, "select id from public.jobs where id = $1", [job])).rows.length === 0, "closed posts leave the board");

// Payments: tips
const hostApp = await makeApp(H, "study-timer");
const sponsorApp = await makeApp(J, "noteflow-pro");
const unlistedApp = (await db.query("insert into public.apps (owner_id, slug, name, tagline, url, category) values ($1, 'unchecked', 'U', 'x', 'https://e.com', 'ai') returning id", [H])).rows[0].id;
const prep = (uid, kind, ref, amount, note = "", pub = true) =>
  as("authenticated", uid, "select public.prepare_payment($1, $2, $3, $4, $5) as id", [kind, ref, amount, note, pub]);
ok(!!(await fails("authenticated", F, "insert into public.payments (user_id, kind, amount_cents) values ($1, 'pro', 600)", [F])), "can't write payments directly");
ok(!!(await fails("anon", null, "select public.prepare_payment('pro')")), "must be signed in to pay");
ok(!!(await fails("authenticated", H, "select public.prepare_payment('tip', $1, 500)", [hostApp])), "can't tip your own app");
ok(!!(await fails("authenticated", F, "select public.prepare_payment('tip', $1, 50)", [hostApp])), "tips start at $1");
ok(!!(await fails("authenticated", F, "select public.prepare_payment('tip', $1, 60000)", [hostApp])), "tips top out at $500");
ok(!!(await fails("authenticated", F, "select public.prepare_payment('tip', $1, 500)", [unlistedApp])), "only live apps take tips");
const tip = (await prep(F, "tip", hostApp, 1000, "Love the timer!")).rows[0].id;
const tipRow = (await db.query("select amount_cents, fee_cents, status from public.payments where id = $1", [tip])).rows[0];
ok(tipRow.amount_cents === 1000 && tipRow.fee_cents === 50 && tipRow.status === "pending", "a tip starts pending with a 5% fee");
ok(!!(await fails("authenticated", F, "select public.complete_payment($1, 'cs_1', 1000, 'pi_1')", [tip])), "people can't complete their own payment");
ok(!!(await fails("service_role", null, "select public.complete_payment($1, 'cs_1', 999, 'pi_1')", [tip])), "the paid amount must match");
await as("service_role", null, "select public.complete_payment($1, 'cs_1', 1000, 'pi_1')", [tip]);
await as("service_role", null, "select public.complete_payment($1, 'cs_1', 1000, 'pi_1')", [tip]);
ok((await db.query("select count(*)::int as n from public.backings where app_id = $1", [hostApp])).rows[0].n === 1, "completing twice only records one backing");
ok((await db.query("select backer_count from public.apps where id = $1", [hostApp])).rows[0].backer_count === 1, "backer count updates");
const bal = async (uid) => (await as("authenticated", uid, "select public.my_earnings_balance() as b")).rows[0].b;
ok((await bal(H)) === 950, "builder earns the tip minus 5%");
ok((await notes(H)).some((n) => n.kind === "backed" && n.actor_id === F), "builder is told who backed them");
const wall = await as("anon", null, "select * from public.backings where app_id = $1", [hostApp]).catch((e) => e.message);
ok(typeof wall === "string", "the backers wall can't read amounts");
ok((await as("anon", null, "select user_id, note from public.backings where app_id = $1", [hostApp])).rows[0]?.note === "Love the timer!", "names and notes are public");
const quiet = (await prep(F, "tip", hostApp, 500, "", false)).rows[0].id;
await as("service_role", null, "select public.complete_payment($1, 'cs_2', 500, 'pi_2')", [quiet]);
ok((await as("anon", null, "select id from public.backings where app_id = $1", [hostApp])).rows.length === 1, "private backings stay off the wall");
ok((await db.query("select backer_count from public.apps where id = $1", [hostApp])).rows[0].backer_count === 1, "a second tip from the same fan isn't a new backer");
ok((await notes(H)).some((n) => n.kind === "backed" && n.actor_id === null), "private tips notify without a name");
ok((await as("authenticated", J, "select id from public.payments")).rows.length === 0, "payments are private");
ok(!!(await fails("authenticated", H, "select public.earnings_balance($1)", [H])), "can't look up other people's balances");

// Payouts
ok(!!(await fails("authenticated", H, "select * from public.start_payout($1)", [H])), "people can't start payouts directly");
ok(!!(await fails("service_role", null, "select * from public.start_payout($1)", [H])), "payouts need a connected account");
await db.query("insert into public.payout_accounts (user_id, stripe_account_id, payouts_enabled) values ($1, 'acct_h', true)", [H]);
ok((await db.query("select payouts_enabled from public.profiles where id = $1", [H])).rows[0].payouts_enabled, "payouts_enabled is mirrored on the profile");
const po = (await as("service_role", null, "select * from public.start_payout($1)", [H])).rows[0];
ok(po.amount_cents === 1425 && po.stripe_account_id === "acct_h", "cash out takes the whole balance");
ok((await bal(H)) === 0, "balance is zero while a payout is on its way");
ok(!!(await fails("service_role", null, "select * from public.start_payout($1)", [H])), "one payout at a time");
await as("service_role", null, "select public.finish_payout($1, null)", [po.payout_id]);
ok((await bal(H)) === 1425, "a failed transfer puts the money back");
const po2 = (await as("service_role", null, "select * from public.start_payout($1)", [H])).rows[0];
await as("service_role", null, "select public.finish_payout($1, 'tr_1')", [po2.payout_id]);
ok((await bal(H)) === 0 && (await db.query("select status from public.payouts where id = $1", [po2.payout_id])).rows[0].status === "paid", "a successful transfer is recorded");
ok(!!(await fails("service_role", null, "select * from public.start_payout($1)", [H])), "cash out needs at least $5");

// Pro
const proPay = (await prep(J, "pro", null, 1)).rows[0].id;
ok((await db.query("select amount_cents from public.payments where id = $1", [proPay])).rows[0].amount_cents === 600, "Pro is always $6, whatever the browser sends");
await as("service_role", null, "select public.complete_payment($1, 'cs_3', 600, 'pi_3')", [proPay]);
ok((await as("anon", null, "select public.is_pro($1) as p", [J])).rows[0].p, "paying makes you Pro for 30 days");
await db.query("update public.profiles set credits = 20 where id = $1", [J]);
await as("authenticated", J, "select public.boost_app($1, 2)", [sponsorApp]);
ok((await db.query("select credits from public.profiles where id = $1", [J])).rows[0].credits === 10, "Pro boosts cost 5 credits a day");
ok((await as("authenticated", J, "select count(*)::int as n from public.app_stats($1)", [sponsorApp])).rows[0].n === 30, "Pro sees 30 days of stats");
ok(!!(await fails("authenticated", H, "select * from public.app_stats($1)", [hostApp])), "stats are part of Pro");
ok(!!(await fails("authenticated", J, "select * from public.app_stats($1)", [hostApp])), "stats are only for your own apps");
await as("authenticated", J, "update public.profiles set pinned_app_id = $1 where id = $2", [sponsorApp, J]);
ok(!!(await fails("authenticated", J, "update public.profiles set pinned_app_id = $1 where id = $2", [hostApp, J])), "you can only pin your own app");
ok(!!(await fails("authenticated", J, "update public.profiles set pro_until = now() + interval '1 year' where id = $1", [J])), "can't give yourself Pro");

// Sponsorships (Boost Exchange, paid)
const offer = (price, budget, from = sponsorApp, to = hostApp, uid = J) =>
  as("authenticated", uid, "select public.offer_sponsorship($1, $2, $3, $4, 'Your users would love NoteFlow') as id", [from, to, price, budget]);
ok(!!(await fails("authenticated", J, "select public.offer_sponsorship($1, $2, 50, 5000)", [hostApp, sponsorApp])), "you sponsor with your own app");
ok(!!(await fails("authenticated", J, "select public.offer_sponsorship($1, $2, 50, 5000)", [sponsorApp, sponsorApp])), "can't sponsor yourself");
ok(!!(await fails("authenticated", J, "select public.offer_sponsorship($1, $2, 5, 5000)", [sponsorApp, hostApp])), "at least 10¢ a try");
ok(!!(await fails("authenticated", J, "select public.offer_sponsorship($1, $2, 500, 2000)", [sponsorApp, hostApp])), "budget must cover 10 tries");
ok(!!(await fails("authenticated", J, "select public.offer_sponsorship($1, $2, 50, 5000)", [sponsorApp, unlistedApp])), "only live apps can be sponsored");
const deal = (await offer(200, 2000)).rows[0].id;
ok((await notes(H)).some((n) => n.kind === "sponsor_offer"), "host is told about the offer");
ok(!!(await fails("authenticated", J, "select public.offer_sponsorship($1, $2, 100, 2000)", [sponsorApp, hostApp])), "one open deal per pair");
ok(!!(await fails("authenticated", J, "insert into public.sponsorships (sponsor_user, host_user, price_cents, budget_cents) values ($1, $2, 10, 1000)", [J, H])), "can't write sponsorships directly");
ok((await as("authenticated", F, "select id from public.sponsorships")).rows.length === 0, "deal terms are private to both sides");
ok(!!(await fails("authenticated", J, "select public.prepare_payment('sponsorship', $1)", [deal])), "can't pay before the host accepts");
ok(!!(await fails("authenticated", J, "select public.respond_sponsorship($1, true)", [deal])), "only the host accepts");
await as("authenticated", H, "select public.respond_sponsorship($1, true)", [deal]);
ok((await notes(J)).some((n) => n.kind === "sponsor_accepted"), "sponsor is told it was accepted");
const other = await makeApp(F, "fan-app");
const second = (await offer(100, 1000, other, hostApp, F)).rows[0].id;
ok(!!(await fails("authenticated", H, "select public.respond_sponsorship($1, true)", [second])), "a host has one sponsor at a time");
ok(!!(await fails("authenticated", H, "delete from public.apps where id = $1", [hostApp])), "an app with a running deal can't be deleted");
const fund = (await prep(J, "sponsorship", deal, 1)).rows[0].id;
ok((await db.query("select amount_cents from public.payments where id = $1", [fund])).rows[0].amount_cents === 2000, "the sponsor pays the whole budget up front");
ok((await as("anon", null, "select * from public.active_sponsors($1)", [[hostApp]])).rows.length === 0, "no sponsor card until it's paid");
await as("service_role", null, "select public.complete_payment($1, 'cs_4', 2000, 'pi_4')", [fund]);
const card = (await as("anon", null, "select * from public.active_sponsors($1)", [[hostApp]])).rows;
ok(card.length === 1 && card[0].sponsor_slug === "noteflow-pro", "paid deals show a public Sponsored-by card");
ok((await notes(H)).some((n) => n.kind === "sponsor_started"), "host is told the sponsorship started");

const tryIt = async (uid, app = sponsorApp) => (await as("authenticated", uid, "select public.record_sponsored_try($1, $2) as ok", [deal, app])).rows[0].ok;
const hBefore = await bal(H);
ok((await tryIt(F, hostApp)) === false, "a try only counts when it lands on the sponsor's app");
ok((await tryIt(F)) === true, "a real person's try counts");
ok((await tryIt(F)) === false, "one try per person per deal");
ok((await tryIt(H)) === false && (await tryIt(J)) === false, "the two builders' own tries don't count");
ok((await tryIt(N)) === false, "brand-new accounts don't count");
ok((await as("anon", null, "select public.record_sponsored_try($1, $2) as ok", [deal, sponsorApp]).catch(() => ({ rows: [{ ok: false }] }))).rows[0].ok === false, "signed-out tries don't count");
ok((await bal(H)) === hBefore + 176, "host earns the try price minus 12%");
const dealRow = async () => (await db.query("select status, spent_cents, tries from public.sponsorships where id = $1", [deal])).rows[0];
ok((await dealRow()).spent_cents === 200 && (await dealRow()).tries === 1, "the sponsor sees honest spend and tries");

// Fill the rest of the budget with established accounts: 2000 / 200 = 10 tries.
const extras = [];
for (let i = 0; i < 10; i++) extras.push(`c${i}000000-cccc-cccc-cccc-cccccccccccc`);
await db.exec(`insert into auth.users (id) values ${extras.map((id) => `('${id}')`).join(", ")}`);
await db.query("update public.profiles set created_at = now() - interval '3 days' where id = any($1)", [extras]);
for (const id of extras) await tryIt(id);
const done = await dealRow();
ok(done.status === "completed" && done.spent_cents === 2000 && done.tries === 10, "the deal completes when the budget is used up, never overspending");
ok((await as("anon", null, "select * from public.active_sponsors($1)", [[hostApp]])).rows.length === 0, "the card goes away when it's done");

// Ending early refunds what's left.
const deal2 = (await offer(100, 1000)).rows[0].id;
await as("authenticated", H, "select public.respond_sponsorship($1, true)", [deal2]);
const fund2 = (await prep(J, "sponsorship", deal2, 1)).rows[0].id;
await as("service_role", null, "select public.complete_payment($1, 'cs_5', 1000, 'pi_5')", [fund2]);
await as("authenticated", F, "select public.record_sponsored_try($1, $2)", [deal2, sponsorApp]);
ok(!!(await fails("authenticated", F, "select public.end_sponsorship($1)", [deal2])), "outsiders can't end a deal");
const refundFor = (await as("authenticated", H, "select public.end_sponsorship($1) as p", [deal2])).rows[0].p;
ok(refundFor === fund2, "ending returns the payment to refund");
ok((await db.query("select refund_cents from public.payments where id = $1", [fund2])).rows[0].refund_cents === 900, "unspent budget is marked for refund");
ok((await notes(J)).some((n) => n.kind === "sponsor_ended"), "the other side is told the deal ended");
ok(!!(await fails("authenticated", J, "select public.mark_refunded($1)", [fund2])), "people can't mark refunds");
await as("service_role", null, "select public.mark_refunded($1)", [fund2]);
ok(!!(await db.query("select refunded_at from public.payments where id = $1", [fund2])).rows[0].refunded_at, "the server records the refund");

// Money that arrives for a deal called off meanwhile goes straight back.
const deal3 = (await offer(100, 1000)).rows[0].id;
await as("authenticated", H, "select public.respond_sponsorship($1, true)", [deal3]);
const fund3 = (await prep(J, "sponsorship", deal3, 1)).rows[0].id;
await as("authenticated", H, "select public.end_sponsorship($1)", [deal3]);
await as("service_role", null, "select public.complete_payment($1, 'cs_6', 1000, 'pi_6')", [fund3]);
ok((await db.query("select refund_cents from public.payments where id = $1", [fund3])).rows[0].refund_cents === 1000, "a late payment for an ended deal is refunded in full");

// Challenges
await db.query(
  "insert into public.challenges (slug, title, sponsor_name, prize, stack, starts_at, ends_at) values ('best-supabase', 'Best app built with Supabase', 'Supabase', '$1,000 + credits', 'Supabase', now() - interval '1 day', now() + interval '6 days')",
);
const ch = (await db.query("select id from public.challenges where slug = 'best-supabase'")).rows[0].id;
ok(!!(await fails("authenticated", H, "insert into public.challenges (slug, title, sponsor_name, prize, ends_at) values ('mine', 'My own challenge', 'Me', 'Glory', now() + interval '1 day')")), "only the team creates challenges");
const enter = (uid, app) => as("authenticated", uid, "insert into public.challenge_entries (challenge_id, app_id, user_id) values ($1, $2, $3) returning id", [ch, app, uid]);
ok(!!(await fails("authenticated", H, "insert into public.challenge_entries (challenge_id, app_id, user_id) values ($1, $2, $3)", [ch, hostApp, H])), "entries must use the sponsor's stack");
await db.query("update public.apps set tech_stack = '{Next.js,supabase}' where id in ($1, $2)", [hostApp, sponsorApp]);
const entryH = (await enter(H, hostApp)).rows[0].id;
const entryJ = (await enter(J, sponsorApp)).rows[0].id;
ok(!!entryH && !!entryJ, "builders enter their own live apps (stack match ignores case)");
ok(!!(await fails("authenticated", H, "insert into public.challenge_entries (challenge_id, app_id, user_id) values ($1, $2, $3)", [ch, sponsorApp, H])), "can't enter someone else's app");
ok((await db.query("select entry_count from public.challenges where id = $1", [ch])).rows[0].entry_count === 2, "entry count updates");
const vote = (uid, entry) => as("authenticated", uid, "insert into public.challenge_votes (challenge_id, user_id, entry_id) values ($1, $2, $3)", [ch, uid, entry]);
await vote(F, entryH);
ok((await db.query("select vote_count from public.challenge_entries where id = $1", [entryH])).rows[0].vote_count === 1, "votes count");
ok(!!(await fails("authenticated", F, "insert into public.challenge_votes (challenge_id, user_id, entry_id) values ($1, $2, $3)", [ch, F, entryJ])), "one vote per person per challenge");
ok(!!(await fails("authenticated", H, "insert into public.challenge_votes (challenge_id, user_id, entry_id) values ($1, $2, $3)", [ch, H, entryH])), "can't vote for your own entry");
ok(!!(await fails("authenticated", N, "insert into public.challenge_votes (challenge_id, user_id, entry_id) values ($1, $2, $3)", [ch, N, entryH])), "brand-new accounts can't vote");
await as("authenticated", F, "delete from public.challenge_votes where challenge_id = $1 and user_id = $2", [ch, F]);
await vote(F, entryJ);
ok((await db.query("select vote_count from public.challenge_entries where id = $1", [entryH])).rows[0].vote_count === 0, "changing your vote moves it");
await db.query("update public.challenges set ends_at = now() - interval '1 minute', starts_at = now() - interval '7 days' where id = $1", [ch]);
ok(!!(await fails("authenticated", H, "insert into public.challenge_votes (challenge_id, user_id, entry_id) values ($1, $2, $3)", [ch, H, entryJ])), "voting closes when the challenge ends");

// ---------------------------------------------------------------------------
// Phase 5: try sources, analytics, brands
// ---------------------------------------------------------------------------

// Try sources
await as("anon", null, "insert into public.try_clicks (app_id, source) values ($1, 'embed')", [hostApp]);
await as("anon", null, "insert into public.try_clicks (app_id) values ($1)", [hostApp]);
const srcRows = (await db.query("select source from public.try_clicks where app_id = $1 and user_id is null order by id", [hostApp])).rows;
ok(srcRows.at(-2).source === "embed" && srcRows.at(-1).source === "direct", "tries record where they came from (default direct)");
ok(!!(await fails("anon", null, "insert into public.try_clicks (app_id, source) values ($1, 'made-up')", [hostApp])), "unknown sources are rejected");
await as("anon", null, "insert into public.try_clicks (app_id, source) values ($1, 'app')", [hostApp]);
ok(true, "the mobile app records its own source");

// Analytics: H owns hostApp and isn't Pro; J is Pro and owns sponsorApp.
const daily7 = (await as("authenticated", H, "select * from public.app_daily($1, 7)", [hostApp])).rows;
ok(daily7.length === 7, "7 days of daily numbers for everyone");
ok(daily7.at(-1).tries >= 2, `today's tries are counted (${daily7.at(-1).tries})`);
const srcs = (await as("authenticated", H, "select * from public.app_sources($1, 7)", [hostApp])).rows;
ok(srcs.some((r) => r.source === "embed" && r.tries >= 1), "sources are broken down");
ok(!!(await fails("authenticated", H, "select * from public.app_daily($1, 30)", [hostApp])), "30 days is part of Pro");
ok(!!(await fails("authenticated", J, "select * from public.app_daily($1, 7)", [hostApp])), "only the owner sees an app's stats");
ok(!!(await fails("anon", null, "select * from public.app_sources($1, 7)", [hostApp])), "signed-out people see no stats");
ok(!!(await fails("authenticated", J, "select * from public.app_daily($1, 12)", [sponsorApp])), "only 7, 30 or 90 days");
const daily90 = (await as("authenticated", J, "select * from public.app_daily($1, 90)", [sponsorApp])).rows;
ok(daily90.length === 90, "Pro sees 90 days");
ok(daily90.reduce((n, r) => n + r.sponsored, 0) === 11, `sponsored tries show up for the sponsor (${daily90.reduce((n, r) => n + r.sponsored, 0)})`);

// Brands
const brandSql = "insert into public.brands (owner_id, slug, name, tagline, url) values ($1, $2, 'Acme', 'Tools for builders', 'https://acme.example') returning id";
const brand = (await as("authenticated", F, brandSql, [F, "acme"])).rows[0].id;
ok(!!brand, "anyone can list a brand");
ok(!!(await fails("authenticated", F, "insert into public.brands (owner_id, slug, name, tagline, url, verified_at) values ($1, 'acme2', 'A', 'B', 'https://a.example', now())", [F])), "can't verify your own brand");
ok(!!(await fails("authenticated", F, "update public.brands set link_checked_at = now() where id = $1", [brand])), "can't mark your own link checked");
ok(!!(await fails("authenticated", F, brandSql.replace("https://acme.example", "http://acme.example"), [F, "acme-http"])), "brand links must be https");
ok((await as("anon", null, "select id from public.brands")).rows.length === 0, "brands stay hidden until the link check");
await as("authenticated", F, brandSql, [F, "acme-two"]);
await as("authenticated", F, brandSql, [F, "acme-three"]);
ok(!!(await fails("authenticated", F, brandSql, [F, "acme-four"])), "up to 3 brands per person");
await db.query("update public.brands set link_checked_at = now() where id = $1", [brand]); // server
ok((await as("anon", null, "select id from public.brands")).rows.length === 1, "checked brands are public");

const brandOffer = (price, budget, b = brand) =>
  as("authenticated", F, "select public.offer_brand_sponsorship($1, $2, $3, $4, 'Builders love Acme') as id", [b, hostApp, price, budget]);
ok(!!(await fails("authenticated", F, "select public.offer_brand_sponsorship($1, $2, 100, 2000)", [brand, hostApp])), "unverified brands can't sponsor");
await db.query("update public.brands set verified_at = now() where id = $1", [brand]); // Method V team
ok(!!(await fails("authenticated", J, "select public.offer_brand_sponsorship($1, $2, 100, 2000)", [brand, hostApp])), "only the brand's owner offers for it");
ok(!!(await fails("authenticated", F, "select public.offer_brand_sponsorship($1, $2, 5, 2000)", [brand, hostApp])), "same price rules as app deals");
const bDeal = (await brandOffer(100, 2000)).rows[0].id;
ok(!!bDeal, "a verified brand can make an offer");
ok(!!(await fails("authenticated", F, "select public.offer_brand_sponsorship($1, $2, 100, 2000)", [brand, hostApp])), "one open brand deal per app");
await as("authenticated", H, "select public.respond_sponsorship($1, true)", [bDeal]);
const bFund = (await prep(F, "sponsorship", bDeal, 1)).rows[0].id;
await as("service_role", null, "select public.complete_payment($1, 'cs_b1', 2000, 'pi_b1')", [bFund]);
const bCard = (await as("anon", null, "select * from public.active_sponsors($1)", [[hostApp]])).rows;
ok(bCard.length === 1 && bCard[0].sponsor_kind === "brand" && bCard[0].sponsor_slug === "acme", "brand deals show a Sponsored card");
ok((await as("anon", null, "select * from public.brand_sponsoring($1)", [brand])).rows.some((r) => r.app_id === hostApp), "a brand's page lists who it sponsors");
const bTry = async (uid, target) => (await as("authenticated", uid, "select public.record_sponsored_try($1, $2) as ok", [bDeal, target])).rows[0].ok;
ok((await bTry(extras[0], sponsorApp)) === false, "a brand try only counts when it lands on the brand");
ok((await bTry(extras[0], brand)) === true, "a real try on the brand counts");
ok((await bTry(F, brand)) === false, "the brand owner's own tries don't count");
ok((await db.query("select tries, spent_cents from public.sponsorships where id = $1", [bDeal])).rows[0].spent_cents === 100, "the brand pays per try");
ok(!!(await fails("authenticated", F, "delete from public.brands where id = $1", [brand])), "a brand with a running deal can't be deleted");
ok(!!(await fails("anon", null, "insert into public.sponsorships (sponsor_brand, sponsor_user, host_user, price_cents, budget_cents) values ($1, $2, $3, 10, 1000)", [brand, F, H])), "can't write brand deals directly");

// --- Profile photos ---
{
  const setPhoto = "update public.profiles set avatar_path = $1 where id = $2";
  await as("authenticated", A, setPhoto, [`${A}/avatar-1727000000000.jpg`, A]);
  ok((await db.query("select avatar_path from public.profiles where id = $1", [A])).rows[0].avatar_path === `${A}/avatar-1727000000000.jpg`, "you can set your own photo");
  ok(!!(await fails("authenticated", A, setPhoto, [`${B}/avatar-1.jpg`, A])), "your photo must be in your own folder");
  ok(!!(await fails("authenticated", A, setPhoto, [`${A}/../x.jpg`, A])), "photo paths are only avatar-<time>.jpg");
  const before = (await db.query("select avatar_path from public.profiles where id = $1", [B])).rows[0].avatar_path;
  await as("authenticated", A, setPhoto, [`${B}/avatar-2.jpg`, B]);
  ok((await db.query("select avatar_path from public.profiles where id = $1", [B])).rows[0].avatar_path === before, "you can't change someone else's photo");
  await as("authenticated", A, setPhoto, [null, A]);
  ok((await db.query("select avatar_path from public.profiles where id = $1", [A])).rows[0].avatar_path === null, "you can remove your photo");
}

// --- Social handles ---
{
  const setSocial = (col) => `update public.profiles set ${col} = $1 where id = $2`;
  await as("authenticated", A, "update public.profiles set instagram_handle = 'june.designs', tiktok_handle = 'june_d', youtube_handle = 'june-designs', threads_handle = 'june.d' where id = $1", [A]);
  const row = (await db.query("select instagram_handle, tiktok_handle, youtube_handle, threads_handle from public.profiles where id = $1", [A])).rows[0];
  ok(row.instagram_handle === "june.designs" && row.youtube_handle === "june-designs", "you can add Instagram, TikTok, YouTube and Threads");
  ok(!!(await fails("authenticated", A, setSocial("instagram_handle"), ["https://instagram.com/x", A])), "handles are handles, not links");
  ok(!!(await fails("authenticated", A, setSocial("tiktok_handle"), ["a", A])), "TikTok handles are at least 2 characters");
}

// --- Questions feed: polls and replies ---
{
  const ask = "insert into public.questions (app_id, user_id, body, poll_options) values ($1, $2, $3, $4) returning id, poll_counts";
  const poll = (await as("authenticated", A, ask, [appId, A, "Which logo should I ship?", ["Blue V", "Mint V", "Both"]])).rows[0];
  ok(JSON.stringify(poll.poll_counts) === "[0,0,0]", "a poll starts at zero for each choice");
  ok(!!(await fails("authenticated", A, ask, [appId, A, "Only one choice?", ["Yes"]])), "polls need 2 to 4 choices");
  ok(!!(await fails("authenticated", A, ask, [appId, A, "Five choices?", ["a", "b", "c", "d", "e"]])), "…not 5");
  ok(!!(await fails("authenticated", A, ask, [appId, A, "Blank choice?", ["ok", "  "]])), "choices can't be blank");
  ok(!!(await fails("authenticated", A, "insert into public.questions (app_id, user_id, body, poll_options, poll_counts) values ($1, $2, 'Rigged poll?', $3, $4)", [appId, A, ["a", "b"], [99, 0]])), "can't set poll totals");

  const vote = async (uid, choice) => (await as("authenticated", uid, "select public.vote_poll($1, $2) as c", [poll.id, choice])).rows[0].c;
  await vote(B, 1);
  await vote(C, 1);
  ok(JSON.stringify(await vote(D, 0)) === "[1,2,0]", "one tap votes and the totals add up");
  ok(JSON.stringify(await vote(B, 2)) === "[1,1,1]", "changing your vote moves it");
  ok(JSON.stringify(await vote(B, null)) === "[1,1,0]", "you can take your vote back");
  ok(!!(await fails("authenticated", C, "select public.vote_poll($1, 7)", [poll.id])), "only real choices");
  ok(!!(await fails("authenticated", C, "select public.vote_poll($1, 0)", [qid])), "no voting on questions without a poll");
  ok(!!(await fails("authenticated", C, "insert into public.poll_votes (question_id, user_id, choice) values ($1, $2, 0)", [poll.id, C])), "can't write votes directly");
  ok((await as("authenticated", B, "select * from public.poll_votes where question_id = $1", [poll.id])).rows.length === 0, "you only see your own votes (B took theirs back)");
  ok((await as("authenticated", C, "select * from public.poll_votes where question_id = $1", [poll.id])).rows.length === 1, "…and C sees just their own");

  const reply = "insert into public.answers (question_id, user_id, body, parent_id) values ($1, $2, $3, $4) returning id, parent_id";
  const top = (await as("authenticated", B, reply, [poll.id, B, "Mint, it pops.", null])).rows[0].id;
  const r1 = (await as("authenticated", C, reply, [poll.id, C, "Agree with mint.", top])).rows[0];
  ok(r1.parent_id === top, "you can reply to an answer");
  const r2 = (await as("authenticated", D, reply, [poll.id, D, "Replying to a reply.", r1.id])).rows[0];
  ok(r2.parent_id === top, "replies stay one level deep");
  ok(!!(await fails("authenticated", D, reply, [qid, D, "Wrong thread.", top])), "a reply must be on the same question");
  ok(!!(await fails("authenticated", A, "select public.mark_best_answer($1, $2)", [poll.id, r1.id])), "best answer is an answer, not a reply");
  await as("authenticated", A, "select public.mark_best_answer($1, $2)", [poll.id, top]);
  ok((await db.query("select best_answer_id from public.questions where id = $1", [poll.id])).rows[0].best_answer_id === top, "the asker picks a best answer");
  const notes = async (uid, kind, actor) =>
    (await db.query("select count(*)::int n from public.notifications where user_id = $1 and kind = $2 and actor_id = $3", [uid, kind, actor])).rows[0].n;
  ok((await notes(B, "reply", C)) === 1, "replying notifies the answer's author as a reply");
  ok((await notes(C, "reply", D)) === 1 && (await notes(B, "reply", D)) === 0, "a reply to a reply notifies the person replied to, not the top answer's author");
  ok(!!(await fails("authenticated", A, ask, [appId, A, "Null choice?", ["ok", null]])), "poll choices can't be null");
  ok(!!(await fails("authenticated", A, "insert into public.questions (app_id, user_id, body, poll_options) values ($1, $2, 'Nested poll?', '{{a,b},{c,d}}')", [appId, A])), "poll choices can't be nested");

  // Deleting an answer keeps other people's replies (and their reputation).
  const own = (await as("authenticated", B, reply, [poll.id, B, "Second thought: CSS vars.", null])).rows[0].id;
  const kept = (await as("authenticated", C, reply, [poll.id, C, "Good call.", own])).rows[0].id;
  await as("authenticated", D, "insert into public.answer_votes (user_id, answer_id) values ($1, $2)", [D, kept]);
  const repBefore = (await db.query("select reputation from public.profiles where id = $1", [C])).rows[0].reputation;
  await as("authenticated", B, "delete from public.answers where id = $1", [own]);
  const after = (await db.query("select parent_id from public.answers where id = $1", [kept])).rows[0];
  ok(after && after.parent_id === null, "deleting an answer keeps the replies under it (they become answers)");
  ok((await db.query("select reputation from public.profiles where id = $1", [C])).rows[0].reputation === repBefore, "…and their authors keep their reputation");
}

// --- Top builders of the month ---
{
  const before = (await as("anon", null, "select * from public.top_builders(10)")).rows.find((r) => r.user_id === A);
  await as("authenticated", A, "insert into public.try_clicks (app_id, user_id) values ($1, $2) on conflict do nothing", [appId, A]);
  for (let i = 0; i < 5; i++) await as("anon", null, "insert into public.try_clicks (app_id) values ($1)", [appId]);
  const rows = (await as("anon", null, "select * from public.top_builders(10)")).rows;
  const a = rows.find((r) => r.user_id === A);
  ok(Boolean(a) && Number(a.tries) >= 2 && Number(a.likes) >= 1, `builders rank by other people's tries and likes this month (${a?.tries} tries, ${a?.likes} likes)`);
  ok(Number(a.tries) === Number(before.tries), "your own tries and signed-out tries don't count (no padding the board)");
  ok(rows.every((r, i) => i === 0 || Number(rows[i - 1].tries) + 2 * Number(rows[i - 1].likes) >= Number(r.tries) + 2 * Number(r.likes)), "sorted by tries + 2 × likes");
}

// The newest migrations can be run again without errors (people paste them twice).
{
  const again = readdirSync(migrationsDir).filter((f) => f >= "20261001000000").sort();
  let clean = true;
  for (const f of again) {
    try {
      await db.exec(readFileSync(new URL(f, migrationsDir), "utf8"));
    } catch (e) {
      clean = false;
      console.log(`  ${f}: ${e.message}`);
    }
  }
  ok(clean && again.length === 4, `the newest migrations are safe to run twice (${again.join(", ")})`);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
