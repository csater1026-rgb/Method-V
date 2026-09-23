// Applies the Supabase migration to an in-memory Postgres (PGlite), with small
// stand-ins for Supabase's auth and storage schemas, then checks the security
// rules: who can write what, the 60-second limit, counters and privacy.
//
//   npm run test:db

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260923000000_phase1.sql", import.meta.url),
  "utf8",
);

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

await db.exec(migration);
console.log("migration applied");

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
const APP = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
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

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
