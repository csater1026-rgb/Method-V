-- Method V: security hardening from a full review.
--
--   1. V Coin balances are private. Profiles stay public, but the credits
--      column can only be read by its owner, through my_credits().
--   2. Spam limits: posting, commenting, messaging, following and the like
--      slow down past a generous per-person rate.
--   3. Browser notifications can only point at the real push services
--      (Google, Mozilla, Apple, Microsoft), never anywhere else.
--   4. Supabase grants TRUNCATE on every table by default. The API can't use
--      it, but take it away anyway.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Private V Coin balances
-- ---------------------------------------------------------------------------

-- Every profile column except credits. A column added later has to be added
-- here too, or it simply can't be read (which fails safe).
revoke select on public.profiles from anon, authenticated;
grant select (
  id, username, display_name, bio, roles, skills, website_url, x_handle, github_handle, linkedin_url,
  follower_count, following_count, created_at, feedback_given_count, feedback_helpful_count,
  connection_count, reputation, pro_until, pinned_app_id, payouts_enabled, avatar_path,
  instagram_handle, tiktok_handle, youtube_handle, threads_handle, cover_path
) on public.profiles to anon, authenticated;

-- Your own balance (0 when signed out).
create or replace function public.my_credits()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select credits from public.profiles where id = auth.uid()), 0)
$$;
revoke execute on function public.my_credits() from public, anon;
grant execute on function public.my_credits() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Spam limits
-- ---------------------------------------------------------------------------

-- Before each insert: how many rows has this person added to this table in
-- the window? Arguments: the column holding the person, the most allowed,
-- and the window in seconds. Only counts requests made as a signed-in
-- person; Method V's own server and the SQL Editor aren't limited.
create or replace function public.rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid := auth.uid();
  author uuid;
  recent integer;
begin
  if who is null then
    return new;
  end if;
  author := (to_jsonb(new) ->> tg_argv[0])::uuid;
  if author is distinct from who then
    return new;
  end if;
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - make_interval(secs => $2)',
    tg_table_schema, tg_table_name, tg_argv[0])
    into recent using who, tg_argv[2]::integer;
  if recent >= tg_argv[1]::integer then
    raise exception 'You''re doing that too fast. Take a short break and try again.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.rate_limit() from public, anon, authenticated;

-- table, person column, most allowed, window (seconds)
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('comments', 'user_id', 30, 600),
      ('messages', 'sender_id', 60, 600),
      ('questions', 'user_id', 10, 3600),
      ('answers', 'user_id', 30, 600),
      ('apps', 'owner_id', 10, 86400),
      ('drops', 'owner_id', 20, 86400),
      ('updates', 'user_id', 20, 3600),
      ('follows', 'follower_id', 100, 3600),
      ('likes', 'user_id', 300, 3600),
      ('connections', 'requester_id', 30, 3600),
      ('brands', 'owner_id', 10, 86400),
      ('jobs', 'user_id', 10, 86400)
    ) as t(tbl, col, most, secs)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('drop trigger if exists %I on public.%I', r.tbl || '_rate_limit', r.tbl);
      execute format(
        'create trigger %I before insert on public.%I for each row execute function public.rate_limit(%L, %L, %L)',
        r.tbl || '_rate_limit', r.tbl, r.col, r.most, r.secs
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Browser notifications only go to the real push services
-- ---------------------------------------------------------------------------

-- The server sends each notification to the address the browser gave. Keep
-- that to Google (Chrome, Edge on Android, Brave, Opera), Mozilla (Firefox),
-- Apple (Safari) and Microsoft (Edge), so it can't be aimed anywhere else.
create or replace function public.is_push_service(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_endpoint, '') ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
    and char_length(p_endpoint) <= 1000
$$;

delete from public.web_push_subscriptions where not public.is_push_service(endpoint);

alter table public.web_push_subscriptions drop constraint if exists web_push_subscriptions_endpoint_check;
alter table public.web_push_subscriptions add constraint web_push_subscriptions_endpoint_check
  check (public.is_push_service(endpoint));

create or replace function public.register_web_push(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if not public.is_push_service(p_endpoint) then
    raise exception 'This browser''s notification service isn''t supported.' using errcode = 'P0001';
  end if;
  insert into public.web_push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. No TRUNCATE for the public roles
-- ---------------------------------------------------------------------------

revoke truncate on all tables in schema public from anon, authenticated;
