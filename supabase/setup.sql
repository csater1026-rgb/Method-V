-- Method V: the whole database in one go, for a NEW Supabase project.
-- Paste all of this into Supabase → SQL Editor → New query, and press Run.
-- Generated from supabase/migrations/ by `npm run db:bundle`; don't edit by hand.
-- Already set up? Run only the migration files you haven't run yet instead.

-- ===========================================================================
-- 20260923000000_phase1.sql
-- ===========================================================================

-- Method V, Phase 1 ("Show it"): profiles, apps, Drops, likes, comments,
-- follows and "Try it" clicks.
--
-- Counters (likes, comments, tries, followers) live on the rows themselves and
-- are kept up to date by triggers, so the feed never has to count rows and the
-- raw click/like tables never need to be publicly readable.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default ''
    check (char_length(display_name) <= 60),
  bio text not null default ''
    check (char_length(bio) <= 280),
  roles text[] not null default '{}'
    check (roles <@ array['founder', 'employee', 'looking_for_work', 'hiring', 'open_to_collab', 'freelancer']),
  skills text[] not null default '{}'
    check (cardinality(skills) <= 20),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  x_handle text check (x_handle is null or x_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  github_handle text check (github_handle is null or github_handle ~ '^[A-Za-z0-9-]{1,39}$'),
  linkedin_url text check (linkedin_url is null or linkedin_url ~* '^https://([a-z]+\.)?linkedin\.com/'),
  follower_count integer not null default 0,
  following_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are public"
  on public.profiles for select
  using (true);

create policy "People edit their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Supabase grants every table to anon/authenticated by default. Narrow writes
-- to the columns people are allowed to set; counters are trigger-only.
revoke insert, update on public.profiles from anon, authenticated;
grant update (username, display_name, bio, roles, skills, website_url, x_handle, github_handle, linkedin_url)
  on public.profiles to authenticated;

-- Every new account gets a profile with a placeholder username the builder
-- can change in settings.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'builder_' || substr(replace(new.id::text, '-', ''), 1, 10),
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Apps
-- ---------------------------------------------------------------------------

create table public.apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null
    check (char_length(name) between 1 and 60),
  tagline text not null
    check (char_length(tagline) between 1 and 120),
  description text not null default ''
    check (char_length(description) <= 2000),
  url text not null
    check (url ~* '^https?://' and char_length(url) <= 500),
  category text not null
    check (category in ('ai', 'productivity', 'dev-tools', 'design', 'games', 'finance', 'education', 'social', 'health', 'other')),
  tech_stack text[] not null default '{}'
    check (cardinality(tech_stack) <= 12),
  pricing text not null default 'free'
    check (pricing in ('free', 'freemium', 'paid')),
  stage text not null default 'launched'
    check (stage in ('idea', 'beta', 'launched')),
  link_checked_at timestamptz,
  try_count integer not null default 0,
  like_count integer not null default 0,
  search tsvector generated always as (
    to_tsvector('english', name || ' ' || tagline || ' ' || description)
  ) stored,
  created_at timestamptz not null default now()
);

create index apps_owner_idx on public.apps (owner_id);
create index apps_category_idx on public.apps (category, created_at desc);
create index apps_search_idx on public.apps using gin (search);
create index apps_stack_idx on public.apps using gin (tech_stack);

alter table public.apps enable row level security;

create policy "Apps are public"
  on public.apps for select
  using (true);

create policy "Builders add their own apps"
  on public.apps for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Builders edit their own apps"
  on public.apps for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Builders delete their own apps"
  on public.apps for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- link_checked_at is only set by the server (service role) after the link
-- check passes, and apps without it stay out of the feed and directory.
revoke insert, update on public.apps from anon, authenticated;
grant insert (owner_id, slug, name, tagline, description, url, category, tech_stack, pricing, stage)
  on public.apps to authenticated;
grant update (name, tagline, description, category, tech_stack, pricing, stage)
  on public.apps to authenticated;

-- ---------------------------------------------------------------------------
-- Drops (60-second demo videos)
-- ---------------------------------------------------------------------------

create table public.drops (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- Paths inside the "drops" storage bucket, always under "<owner_id>/".
  video_path text not null,
  poster_path text,
  duration_seconds numeric(5, 2) not null
    check (duration_seconds > 0 and duration_seconds <= 60),
  caption text not null default ''
    check (char_length(caption) <= 300),
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  check (split_part(video_path, '/', 1) = owner_id::text),
  check (poster_path is null or split_part(poster_path, '/', 1) = owner_id::text)
);

create index drops_created_idx on public.drops (created_at desc);
create index drops_app_idx on public.drops (app_id, created_at desc);
create index drops_owner_idx on public.drops (owner_id);

alter table public.drops enable row level security;

create policy "Drops are public"
  on public.drops for select
  using (true);

create policy "Builders post Drops for their own apps"
  on public.drops for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.apps
      where apps.id = app_id and apps.owner_id = (select auth.uid())
    )
  );

create policy "Builders edit their own Drops"
  on public.drops for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Builders delete their own Drops"
  on public.drops for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

revoke insert, update on public.drops from anon, authenticated;
grant insert (app_id, owner_id, video_path, poster_path, duration_seconds, caption)
  on public.drops to authenticated;
grant update (caption) on public.drops to authenticated;

-- ---------------------------------------------------------------------------
-- Likes
-- ---------------------------------------------------------------------------

create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  drop_id uuid not null references public.drops (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, drop_id)
);

create index likes_drop_idx on public.likes (drop_id);

alter table public.likes enable row level security;

-- People can see their own likes (to show a filled heart); totals come from
-- the counters on drops and apps.
create policy "People see their own likes"
  on public.likes for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "People like as themselves"
  on public.likes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "People unlike their own likes"
  on public.likes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update on public.likes from anon, authenticated;
grant insert (user_id, drop_id) on public.likes to authenticated;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null
    check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index comments_drop_idx on public.comments (drop_id, created_at);

alter table public.comments enable row level security;

create policy "Comments are public"
  on public.comments for select
  using (true);

create policy "People comment as themselves"
  on public.comments for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "People delete their own comments"
  on public.comments for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update on public.comments from anon, authenticated;
grant insert (drop_id, user_id, body) on public.comments to authenticated;

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

create policy "Follows are public"
  on public.follows for select
  using (true);

create policy "People follow as themselves"
  on public.follows for insert
  to authenticated
  with check ((select auth.uid()) = follower_id);

create policy "People unfollow as themselves"
  on public.follows for delete
  to authenticated
  using ((select auth.uid()) = follower_id);

revoke insert, update on public.follows from anon, authenticated;
grant insert (follower_id, following_id) on public.follows to authenticated;

-- ---------------------------------------------------------------------------
-- "Try it" clicks
-- ---------------------------------------------------------------------------

-- Written by the /try/<app> route on the server. Not readable by anyone
-- through the API; the public number is apps.try_count, which counts each
-- signed-in person once per app, plus signed-out clicks.
create table public.try_clicks (
  id bigint generated always as identity primary key,
  app_id uuid not null references public.apps (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index try_clicks_once_per_person on public.try_clicks (app_id, user_id)
  where user_id is not null;

alter table public.try_clicks enable row level security;

create policy "Anyone can record a try as themselves or anonymously"
  on public.try_clicks for insert
  to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

revoke insert, update, delete on public.try_clicks from anon, authenticated;
grant insert (app_id, user_id) on public.try_clicks to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Counter triggers
-- ---------------------------------------------------------------------------

create function public.bump_like_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  target uuid := case when tg_op = 'INSERT' then new.drop_id else old.drop_id end;
begin
  update public.drops set like_count = greatest(like_count + delta, 0) where id = target;
  update public.apps set like_count = greatest(like_count + delta, 0)
    where id = (select app_id from public.drops where id = target);
  return null;
end;
$$;

create trigger likes_count
  after insert or delete on public.likes
  for each row execute function public.bump_like_counts();

create function public.bump_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.drops set comment_count = comment_count + 1 where id = new.drop_id;
  else
    update public.drops set comment_count = greatest(comment_count - 1, 0) where id = old.drop_id;
  end if;
  return null;
end;
$$;

create trigger comments_count
  after insert or delete on public.comments
  for each row execute function public.bump_comment_count();

create function public.bump_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set follower_count = follower_count + 1 where id = new.following_id;
  else
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.following_id;
  end if;
  return null;
end;
$$;

create trigger follows_count
  after insert or delete on public.follows
  for each row execute function public.bump_follow_counts();

create function public.bump_try_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.apps set try_count = try_count + 1 where id = new.app_id;
  return null;
end;
$$;

create trigger try_clicks_count
  after insert on public.try_clicks
  for each row execute function public.bump_try_count();

-- ---------------------------------------------------------------------------
-- Storage: the "drops" bucket holds videos and their poster images
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'drops',
  'drops',
  true,
  104857600, -- 100 MB
  array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg']
);

-- Files are readable through the bucket's public URL. Each builder can only
-- write inside their own folder: drops/<user id>/...
create policy "Builders upload into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'drops'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Needed for cleaning up (removing a file also reads it). Everyone else reads
-- through the public URL.
create policy "Builders see their own files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'drops'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Builders delete their own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'drops'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ===========================================================================
-- 20260924000000_phase3_credits_feedback.sql
-- ===========================================================================

-- Method V, Phase 3 ("Grow"), part 1: try-to-earn credits and structured
-- feedback.
--
-- How the economy works:
--   * Everyone gets 10 welcome credits.
--   * A builder spends 2 credits per tester to put their app in the
--     "Test & earn" queue.
--   * Someone who has opened the app with "Try it" and leaves feedback on a
--     queued app fills one of those spots and earns the 2 credits.
--   * The builder can mark feedback helpful: +1 credit for the tester.
--   * Earning is capped at 10 paid feedbacks per person per 24 hours.
--
-- Balances are only ever changed by rows in credit_events, which only these
-- server-side functions and triggers can write.

-- ---------------------------------------------------------------------------
-- New counters on existing tables (trigger-only: not in any column grant)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column credits integer not null default 0 check (credits >= 0),
  add column feedback_given_count integer not null default 0,
  add column feedback_helpful_count integer not null default 0;

alter table public.apps
  add column feedback_count integer not null default 0,
  add column would_use_yes_count integer not null default 0,
  add column rating_sum integer not null default 0;

-- ---------------------------------------------------------------------------
-- Credit ledger
-- ---------------------------------------------------------------------------

create table public.credit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null
    check (reason in ('welcome', 'feedback_reward', 'feedback_helpful', 'testers_requested', 'testers_refunded')),
  app_id uuid references public.apps (id) on delete set null,
  created_at timestamptz not null default now()
);

create index credit_events_user_idx on public.credit_events (user_id, created_at desc);

alter table public.credit_events enable row level security;

create policy "People see their own credit history"
  on public.credit_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.credit_events from anon, authenticated;

create function public.apply_credit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The check constraint on profiles.credits stops balances going negative.
  update public.profiles set credits = credits + new.delta where id = new.user_id;
  return null;
end;
$$;

create trigger credit_events_apply
  after insert on public.credit_events
  for each row execute function public.apply_credit_event();

-- Welcome credits for every new profile, and for everyone already here.
create function public.grant_welcome_credits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.credit_events (user_id, delta, reason) values (new.id, 10, 'welcome');
  return null;
end;
$$;

create trigger profiles_welcome_credits
  after insert on public.profiles
  for each row execute function public.grant_welcome_credits();

insert into public.credit_events (user_id, delta, reason)
select id, 10, 'welcome' from public.profiles;

-- ---------------------------------------------------------------------------
-- Tester requests (the "Test & earn" queue)
-- ---------------------------------------------------------------------------

create table public.test_requests (
  app_id uuid primary key references public.apps (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  slots_total integer not null check (slots_total >= 0),
  slots_filled integer not null default 0 check (slots_filled >= 0 and slots_filled <= slots_total),
  opened_at timestamptz not null default now()
);

create index test_requests_open_idx on public.test_requests (opened_at) where slots_filled < slots_total;

alter table public.test_requests enable row level security;

create policy "The test queue is public"
  on public.test_requests for select
  using (true);

revoke insert, update, delete on public.test_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Try clicks: people can now see their own, so the app knows they've tried it
-- ---------------------------------------------------------------------------

create policy "People see their own tries"
  on public.try_clicks for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  would_use text not null check (would_use in ('yes', 'maybe', 'no')),
  rating smallint not null check (rating between 1 and 5),
  worked text not null check (char_length(btrim(worked)) between 10 and 1000),
  confusing text not null default '' check (char_length(confusing) <= 1000),
  earned integer not null default 0,
  helpful_at timestamptz,
  created_at timestamptz not null default now(),
  unique (app_id, user_id)
);

create index feedback_app_idx on public.feedback (app_id, created_at desc);

alter table public.feedback enable row level security;

-- Feedback is private between the tester and the builder. The public sees the
-- totals on apps (feedback_count, would_use_yes_count, rating_sum).
create policy "Testers and builders see feedback"
  on public.feedback for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.apps where apps.id = app_id and apps.owner_id = (select auth.uid()))
  );

create policy "People who tried an app can give feedback"
  on public.feedback for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and not exists (select 1 from public.apps where apps.id = app_id and apps.owner_id = (select auth.uid()))
    and exists (
      select 1 from public.try_clicks
      where try_clicks.app_id = feedback.app_id and try_clicks.user_id = (select auth.uid())
    )
  );

-- No edits or deletes, so feedback can't be recycled for more credits.
revoke insert, update, delete on public.feedback from anon, authenticated;
grant insert (app_id, user_id, would_use, rating, worked, confusing) on public.feedback to authenticated;

-- Before insert: claim a paid spot if the app is in the queue and the tester
-- is under the daily cap. The update is atomic, so two testers can't both
-- take the last spot.
create function public.claim_feedback_reward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  earned_today integer;
begin
  new.earned := 0;
  select count(*) into earned_today
    from public.credit_events
    where user_id = new.user_id and reason = 'feedback_reward' and created_at > now() - interval '24 hours';
  if earned_today < 10 then
    update public.test_requests
      set slots_filled = slots_filled + 1
      where app_id = new.app_id and slots_filled < slots_total;
    if found then
      new.earned := 2;
    end if;
  end if;
  return new;
end;
$$;

create trigger feedback_claim_reward
  before insert on public.feedback
  for each row execute function public.claim_feedback_reward();

create function public.record_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.earned > 0 then
    insert into public.credit_events (user_id, delta, reason, app_id)
    values (new.user_id, new.earned, 'feedback_reward', new.app_id);
  end if;
  update public.apps
    set feedback_count = feedback_count + 1,
        would_use_yes_count = would_use_yes_count + (case when new.would_use = 'yes' then 1 else 0 end),
        rating_sum = rating_sum + new.rating
    where id = new.app_id;
  update public.profiles set feedback_given_count = feedback_given_count + 1 where id = new.user_id;
  return null;
end;
$$;

create trigger feedback_record
  after insert on public.feedback
  for each row execute function public.record_feedback();

-- ---------------------------------------------------------------------------
-- Actions builders take (called with supabase.rpc)
-- ---------------------------------------------------------------------------

create function public.request_testers(p_app_id uuid, p_testers integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cost integer;
  balance integer;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if p_testers is null or p_testers < 1 or p_testers > 50 then
    raise exception 'Ask for between 1 and 50 testers.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.apps
    where id = p_app_id and owner_id = uid and link_checked_at is not null
  ) then
    raise exception 'You can only ask for testers on your own live apps.' using errcode = 'P0001';
  end if;

  cost := p_testers * 2;
  select credits into balance from public.profiles where id = uid for update;
  if balance < cost then
    raise exception 'That costs % credits and you have %.', cost, balance using errcode = 'P0001';
  end if;

  insert into public.credit_events (user_id, delta, reason, app_id)
  values (uid, -cost, 'testers_requested', p_app_id);

  insert into public.test_requests (app_id, owner_id, slots_total)
  values (p_app_id, uid, p_testers)
  on conflict (app_id) do update
    set slots_total = public.test_requests.slots_total + excluded.slots_total,
        -- Re-opening a finished request puts the app back at the end of the queue.
        opened_at = case
          when public.test_requests.slots_filled >= public.test_requests.slots_total then now()
          else public.test_requests.opened_at
        end;
end;
$$;

create function public.cancel_test_request(p_app_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  remaining integer;
begin
  select slots_total - slots_filled into remaining
    from public.test_requests
    where app_id = p_app_id and owner_id = uid
    for update;
  if remaining is null then
    raise exception 'No tester request to cancel.' using errcode = 'P0001';
  end if;
  if remaining > 0 then
    update public.test_requests set slots_total = slots_filled where app_id = p_app_id;
    insert into public.credit_events (user_id, delta, reason, app_id)
    values (uid, remaining * 2, 'testers_refunded', p_app_id);
  end if;
  return coalesce(remaining, 0);
end;
$$;

create function public.mark_feedback_helpful(p_feedback_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tester uuid;
  app uuid;
begin
  update public.feedback f
    set helpful_at = now()
    from public.apps a
    where f.id = p_feedback_id and a.id = f.app_id and a.owner_id = uid and f.helpful_at is null
    returning f.user_id, f.app_id into tester, app;
  if tester is null then
    raise exception 'You can mark feedback on your own apps once.' using errcode = 'P0001';
  end if;
  insert into public.credit_events (user_id, delta, reason, app_id) values (tester, 1, 'feedback_helpful', app);
  update public.profiles set feedback_helpful_count = feedback_helpful_count + 1 where id = tester;
end;
$$;

revoke execute on function public.request_testers(uuid, integer) from public, anon;
revoke execute on function public.cancel_test_request(uuid) from public, anon;
revoke execute on function public.mark_feedback_helpful(uuid) from public, anon;
grant execute on function public.request_testers(uuid, integer) to authenticated;
grant execute on function public.cancel_test_request(uuid) to authenticated;
grant execute on function public.mark_feedback_helpful(uuid) to authenticated;

-- ===========================================================================
-- 20260925000000_featured.sql
-- ===========================================================================

-- Featured apps on the home feed.
--
-- An app is featured while featured_until is in the future. For now it's set
-- by hand (Supabase table editor or SQL); launch days and boosts will set it
-- later. People can't set it on their own apps: the column isn't in any
-- grant to anon/authenticated.
--
--   update public.apps set featured_until = now() + interval '7 days' where slug = 'my-app';

alter table public.apps add column featured_until timestamptz;

create index apps_featured_idx on public.apps (featured_until desc) where featured_until is not null;

-- ===========================================================================
-- 20260926000000_phase3_grow.sql
-- ===========================================================================

-- Method V, Phase 3 ("Grow"), part 2:
--   * Tester Passport: ranks with perks, weekly streak bonus, per-category
--     stamps and a monthly top-testers board
--   * Launch days: a scheduled 24-hour spotlight (free, once per app)
--   * Boosts: spend credits to be featured for a few days
--   * Build-in-public updates
--   * Swaps and co-launches: the free half of the Boost Exchange
--
-- As before, anything that moves credits or placement is done by
-- security-definer functions; people can't write those columns directly.

-- ---------------------------------------------------------------------------
-- Credit reasons
-- ---------------------------------------------------------------------------

alter table public.credit_events drop constraint credit_events_reason_check;
alter table public.credit_events add constraint credit_events_reason_check
  check (reason in (
    'welcome', 'feedback_reward', 'feedback_helpful', 'testers_requested', 'testers_refunded',
    'streak_bonus', 'boost'
  ));

-- ---------------------------------------------------------------------------
-- Tester Passport
-- ---------------------------------------------------------------------------

-- Ranks come from feedback given and feedback builders marked helpful.
-- Must match TESTER_RANKS in src/lib/constants.ts.
create function public.tester_rank(given integer, helpful integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when given >= 100 and helpful >= 30 then 'trusted'
    when given >= 40 and helpful >= 10 then 'pro'
    when given >= 15 and helpful >= 3 then 'tester'
    when given >= 5 then 'scout'
    else 'new'
  end
$$;

-- Perks: Tester and up earn 3 credits per paid feedback instead of 2; Pro and
-- Trusted can earn from 20 feedbacks a day instead of 10.
create or replace function public.claim_feedback_reward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  earned_today integer;
  tester_level text;
  daily_cap integer;
  reward integer;
begin
  new.earned := 0;
  select public.tester_rank(feedback_given_count, feedback_helpful_count) into tester_level
    from public.profiles where id = new.user_id;
  daily_cap := case when tester_level in ('pro', 'trusted') then 20 else 10 end;
  reward := case when tester_level in ('tester', 'pro', 'trusted') then 3 else 2 end;

  select count(*) into earned_today
    from public.credit_events
    where user_id = new.user_id and reason = 'feedback_reward' and created_at > now() - interval '24 hours';
  if earned_today < daily_cap then
    update public.test_requests
      set slots_filled = slots_filled + 1
      where app_id = new.app_id and slots_filled < slots_total;
    if found then
      new.earned := reward;
    end if;
  end if;
  return new;
end;
$$;

-- After insert: rewards, totals, and a +5 bonus every 4 weeks in a row with
-- at least one feedback (checked on the first feedback of each week).
create or replace function public.record_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_start timestamptz := date_trunc('week', new.created_at);
  w timestamptz;
  streak integer := 0;
begin
  if new.earned > 0 then
    insert into public.credit_events (user_id, delta, reason, app_id)
    values (new.user_id, new.earned, 'feedback_reward', new.app_id);
  end if;
  update public.apps
    set feedback_count = feedback_count + 1,
        would_use_yes_count = would_use_yes_count + (case when new.would_use = 'yes' then 1 else 0 end),
        rating_sum = rating_sum + new.rating
    where id = new.app_id;
  update public.profiles set feedback_given_count = feedback_given_count + 1 where id = new.user_id;

  if not exists (
    select 1 from public.feedback
    where user_id = new.user_id and id <> new.id
      and created_at >= week_start and created_at < week_start + interval '7 days'
  ) then
    w := week_start;
    loop
      exit when not exists (
        select 1 from public.feedback
        where user_id = new.user_id and created_at >= w and created_at < w + interval '7 days'
      );
      streak := streak + 1;
      w := w - interval '7 days';
    end loop;
    if streak >= 4 and streak % 4 = 0 then
      insert into public.credit_events (user_id, delta, reason) values (new.user_id, 5, 'streak_bonus');
    end if;
  end if;
  return null;
end;
$$;

-- Public passport for any profile: stamps per category and the current weekly
-- streak. Only counts leave the function; the feedback itself stays private.
create function public.tester_passport(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cats jsonb;
  w timestamptz := date_trunc('week', now());
  streak integer := 0;
begin
  select coalesce(jsonb_object_agg(category, n), '{}'::jsonb) into cats
  from (
    select a.category, count(*) as n
    from public.feedback f join public.apps a on a.id = f.app_id
    where f.user_id = p_user
    group by a.category
  ) s;

  -- A streak is still alive if the last feedback was last week.
  if not exists (select 1 from public.feedback where user_id = p_user and created_at >= w) then
    w := w - interval '7 days';
  end if;
  loop
    exit when not exists (
      select 1 from public.feedback where user_id = p_user and created_at >= w and created_at < w + interval '7 days'
    );
    streak := streak + 1;
    w := w - interval '7 days';
  end loop;

  return jsonb_build_object('categories', cats, 'streak', streak);
end;
$$;

-- Top testers this calendar month: helpful marks first, then feedback count.
create function public.top_testers(p_limit integer default 10)
returns table (user_id uuid, username text, display_name text, feedback_count bigint, helpful_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, count(*), count(f.helpful_at)
  from public.feedback f
  join public.profiles p on p.id = f.user_id
  where f.created_at >= date_trunc('month', now())
  group by p.id, p.username, p.display_name
  order by count(f.helpful_at) desc, count(*) desc, p.username
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

-- ---------------------------------------------------------------------------
-- Launch days and boosts
-- ---------------------------------------------------------------------------

-- launch_at: the launch day starts here and lasts 24 hours.
-- boosted_until: featured as "Boosted" until then.
alter table public.apps
  add column launch_at timestamptz,
  add column boosted_until timestamptz;

create index apps_launch_idx on public.apps (launch_at) where launch_at is not null;
create index apps_boost_idx on public.apps (boosted_until) where boosted_until is not null;

create function public.check_launch_window(p_at timestamptz)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_at is null or p_at < now() + interval '1 hour' or p_at > now() + interval '30 days' then
    raise exception 'Pick a launch time between 1 hour and 30 days from now.' using errcode = 'P0001';
  end if;
end;
$$;

create function public.schedule_launch(p_app_id uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  current_launch timestamptz;
begin
  select launch_at into current_launch
    from public.apps
    where id = p_app_id and owner_id = uid and link_checked_at is not null
    for update;
  if not found then
    raise exception 'You can only schedule launches for your own live apps.' using errcode = 'P0001';
  end if;
  if current_launch is not null and current_launch <= now() then
    raise exception 'This app has already had its launch day.' using errcode = 'P0001';
  end if;
  perform public.check_launch_window(p_at);
  update public.apps set launch_at = p_at where id = p_app_id;
end;
$$;

create function public.cancel_launch(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.apps set launch_at = null
    where id = p_app_id and owner_id = auth.uid() and launch_at > now();
  if not found then
    raise exception 'There''s no upcoming launch to cancel.' using errcode = 'P0001';
  end if;
end;
$$;

-- 10 credits per day, 1–7 days at a time. Boosting again extends it.
create function public.boost_app(p_app_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cost integer;
  balance integer;
begin
  if p_days is null or p_days < 1 or p_days > 7 then
    raise exception 'Boost for 1 to 7 days.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.apps where id = p_app_id and owner_id = uid and link_checked_at is not null
  ) then
    raise exception 'You can only boost your own live apps.' using errcode = 'P0001';
  end if;
  cost := p_days * 10;
  select credits into balance from public.profiles where id = uid for update;
  if balance < cost then
    raise exception 'That costs % credits and you have %.', cost, balance using errcode = 'P0001';
  end if;
  insert into public.credit_events (user_id, delta, reason, app_id) values (uid, -cost, 'boost', p_app_id);
  update public.apps
    set boosted_until = greatest(coalesce(boosted_until, now()), now()) + make_interval(days => p_days)
    where id = p_app_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Build-in-public updates
-- ---------------------------------------------------------------------------

create table public.updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  app_id uuid references public.apps (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index updates_recent_idx on public.updates (created_at desc);
create index updates_user_idx on public.updates (user_id, created_at desc);
create index updates_app_idx on public.updates (app_id, created_at desc);

alter table public.updates enable row level security;

create policy "Updates are public"
  on public.updates for select
  using (true);

create policy "Builders post their own updates"
  on public.updates for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      app_id is null
      or exists (select 1 from public.apps where apps.id = app_id and apps.owner_id = (select auth.uid()))
    )
  );

create policy "Builders delete their own updates"
  on public.updates for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update on public.updates from anon, authenticated;
grant insert (user_id, app_id, body) on public.updates to authenticated;

-- ---------------------------------------------------------------------------
-- Swaps and co-launches (free Boost Exchange)
-- ---------------------------------------------------------------------------

-- kind 'swap': both apps show each other in a "Friends of" slot (max 3 each).
-- kind 'colaunch': both apps get the same launch day.
create table public.swaps (
  id uuid primary key default gen_random_uuid(),
  from_app uuid not null references public.apps (id) on delete cascade,
  to_app uuid not null references public.apps (id) on delete cascade,
  kind text not null check (kind in ('swap', 'colaunch')),
  launch_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'ended')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_app <> to_app),
  check ((kind = 'colaunch') = (launch_at is not null))
);

-- One open swap (and one open co-launch) per pair of apps, either direction.
create unique index swaps_one_open_per_pair
  on public.swaps (least(from_app, to_app), greatest(from_app, to_app), kind)
  where status in ('pending', 'accepted');
create index swaps_to_idx on public.swaps (to_app, status);
create index swaps_from_idx on public.swaps (from_app, status);

alter table public.swaps enable row level security;

create policy "Accepted swaps are public; builders see their own"
  on public.swaps for select
  using (
    status = 'accepted'
    or exists (
      select 1 from public.apps
      where apps.id in (from_app, to_app) and apps.owner_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.swaps from anon, authenticated;

create function public.accepted_swap_count(p_app_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.swaps
  where kind = 'swap' and status = 'accepted' and p_app_id in (from_app, to_app)
$$;

create function public.propose_swap(p_from uuid, p_to uuid, p_kind text, p_launch_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  to_owner uuid;
  new_id uuid;
begin
  if p_kind not in ('swap', 'colaunch') then
    raise exception 'Unknown kind of swap.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.apps where id = p_from and owner_id = uid and link_checked_at is not null
  ) then
    raise exception 'Pick one of your own live apps.' using errcode = 'P0001';
  end if;
  select owner_id into to_owner from public.apps where id = p_to and link_checked_at is not null;
  if to_owner is null then
    raise exception 'That app isn''t available.' using errcode = 'P0001';
  end if;
  if to_owner = uid then
    raise exception 'Swaps are between different builders.' using errcode = 'P0001';
  end if;

  if p_kind = 'swap' then
    if public.accepted_swap_count(p_from) >= 3 or public.accepted_swap_count(p_to) >= 3 then
      raise exception 'Each app can have up to 3 swap partners.' using errcode = 'P0001';
    end if;
    p_launch_at := null;
  else
    perform public.check_launch_window(p_launch_at);
    if exists (
      select 1 from public.apps where id in (p_from, p_to) and launch_at is not null and launch_at <= now()
    ) then
      raise exception 'One of these apps has already had its launch day.' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.swaps (from_app, to_app, kind, launch_at)
    values (p_from, p_to, p_kind, p_launch_at)
    returning id into new_id;
  exception when unique_violation then
    raise exception 'These apps already have an open request of that kind.' using errcode = 'P0001';
  end;
  return new_id;
end;
$$;

create function public.respond_swap(p_swap_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.swaps;
begin
  select sw.* into s
    from public.swaps sw join public.apps a on a.id = sw.to_app
    where sw.id = p_swap_id and a.owner_id = auth.uid() and sw.status = 'pending'
    for update of sw;
  if not found then
    raise exception 'No pending request to answer.' using errcode = 'P0001';
  end if;

  if not p_accept then
    update public.swaps set status = 'declined', responded_at = now() where id = s.id;
    return;
  end if;

  if s.kind = 'swap' then
    if public.accepted_swap_count(s.from_app) >= 3 or public.accepted_swap_count(s.to_app) >= 3 then
      raise exception 'One of these apps already has 3 swap partners.' using errcode = 'P0001';
    end if;
  else
    perform public.check_launch_window(s.launch_at);
    if exists (
      select 1 from public.apps
      where id in (s.from_app, s.to_app) and launch_at is not null and launch_at <= now()
    ) then
      raise exception 'One of these apps has already had its launch day.' using errcode = 'P0001';
    end if;
    update public.apps set launch_at = s.launch_at where id in (s.from_app, s.to_app);
  end if;
  update public.swaps set status = 'accepted', responded_at = now() where id = s.id;
end;
$$;

-- Either side can withdraw a pending request or end an accepted swap.
-- Ending a co-launch leaves both launch dates as they are.
create function public.end_swap(p_swap_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.swaps sw
    set status = 'ended', responded_at = now()
    where sw.id = p_swap_id
      and sw.status in ('pending', 'accepted')
      and exists (
        select 1 from public.apps a where a.id in (sw.from_app, sw.to_app) and a.owner_id = auth.uid()
      );
  if not found then
    raise exception 'Nothing to end.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------------------------

revoke execute on function public.tester_passport(uuid) from public;
revoke execute on function public.top_testers(integer) from public;
grant execute on function public.tester_passport(uuid) to anon, authenticated;
grant execute on function public.top_testers(integer) to anon, authenticated;

revoke execute on function public.schedule_launch(uuid, timestamptz) from public, anon;
revoke execute on function public.cancel_launch(uuid) from public, anon;
revoke execute on function public.boost_app(uuid, integer) from public, anon;
revoke execute on function public.propose_swap(uuid, uuid, text, timestamptz) from public, anon;
revoke execute on function public.respond_swap(uuid, boolean) from public, anon;
revoke execute on function public.end_swap(uuid) from public, anon;
grant execute on function public.schedule_launch(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_launch(uuid) to authenticated;
grant execute on function public.boost_app(uuid, integer) to authenticated;
grant execute on function public.propose_swap(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.respond_swap(uuid, boolean) to authenticated;
grant execute on function public.end_swap(uuid) to authenticated;

-- ===========================================================================
-- 20260927000000_phase2_connect.sql
-- ===========================================================================

-- Method V, Phase 2 ("Connect"):
--   * Connections with a reason (collaborate, hire, feedback, invest, fan)
--   * Messages between connected builders
--   * Q&A on each app: questions, answers, votes, best answer, reputation
--   * Notifications, created by triggers
--   * "Builders like you" suggestions
--
-- Writes that change someone else's data (accepting, best answers, counters,
-- notifications) go through security-definer functions and triggers.

-- ---------------------------------------------------------------------------
-- Profile counters
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column connection_count integer not null default 0,
  add column reputation integer not null default 0;

-- ---------------------------------------------------------------------------
-- Notifications (defined first; the triggers below write to it)
-- ---------------------------------------------------------------------------

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'follow', 'like', 'comment', 'feedback', 'helpful',
    'connection_request', 'connection_accepted',
    'question', 'answer', 'best_answer',
    'swap_request', 'swap_accepted'
  )),
  actor_id uuid references public.profiles (id) on delete cascade,
  app_id uuid references public.apps (id) on delete cascade,
  ref_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "People see their own notifications"
  on public.notifications for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.notifications from anon, authenticated;

-- Skips notifying people about their own actions, and doesn't repeat an
-- unread notification for the same thing (e.g. like, unlike, like again).
create function public.notify(p_user uuid, p_kind text, p_actor uuid, p_app uuid default null, p_ref uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  if exists (
    select 1 from public.notifications
    where user_id = p_user and kind = p_kind and actor_id is not distinct from p_actor
      and app_id is not distinct from p_app and ref_id is not distinct from p_ref and read_at is null
  ) then
    return;
  end if;
  insert into public.notifications (user_id, kind, actor_id, app_id, ref_id)
  values (p_user, p_kind, p_actor, p_app, p_ref);
end;
$$;

revoke execute on function public.notify(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;

create function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

-- Notifications for things built in earlier phases.
create function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(new.following_id, 'follow', new.follower_id);
  return null;
end;
$$;
create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_on_follow();

create function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d public.drops;
begin
  select * into d from public.drops where id = new.drop_id;
  perform public.notify(d.owner_id, 'like', new.user_id, d.app_id, d.id);
  return null;
end;
$$;
create trigger likes_notify after insert on public.likes
  for each row execute function public.notify_on_like();

create function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d public.drops;
begin
  select * into d from public.drops where id = new.drop_id;
  perform public.notify(d.owner_id, 'comment', new.user_id, d.app_id, new.id);
  return null;
end;
$$;
create trigger comments_notify after insert on public.comments
  for each row execute function public.notify_on_comment();

create function public.notify_on_feedback()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.apps where id = new.app_id;
  if tg_op = 'INSERT' then
    perform public.notify(owner, 'feedback', new.user_id, new.app_id, new.id);
  elsif old.helpful_at is null and new.helpful_at is not null then
    perform public.notify(new.user_id, 'helpful', owner, new.app_id, new.id);
  end if;
  return null;
end;
$$;
create trigger feedback_notify after insert or update of helpful_at on public.feedback
  for each row execute function public.notify_on_feedback();

create function public.notify_on_swap()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  from_owner uuid;
  to_owner uuid;
begin
  select owner_id into from_owner from public.apps where id = new.from_app;
  select owner_id into to_owner from public.apps where id = new.to_app;
  if tg_op = 'INSERT' then
    perform public.notify(to_owner, 'swap_request', from_owner, new.to_app, new.id);
  elsif old.status = 'pending' and new.status = 'accepted' then
    perform public.notify(from_owner, 'swap_accepted', to_owner, new.from_app, new.id);
  end if;
  return null;
end;
$$;
create trigger swaps_notify after insert or update of status on public.swaps
  for each row execute function public.notify_on_swap();

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('collaborate', 'hire', 'feedback', 'invest', 'fan')),
  note text not null default '' check (char_length(note) <= 280),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One connection (or request) per pair of people, either direction.
create unique index connections_one_per_pair
  on public.connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index connections_addressee_idx on public.connections (addressee_id, status);
create index connections_requester_idx on public.connections (requester_id, status);

alter table public.connections enable row level security;

create policy "People see their own connections"
  on public.connections for select
  to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

revoke insert, update, delete on public.connections from anon, authenticated;

create function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(a, b)
      and greatest(requester_id, addressee_id) = greatest(a, b)
  )
$$;

create function public.request_connection(p_to uuid, p_reason text, p_note text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing public.connections;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if p_to is null or p_to = uid or not exists (select 1 from public.profiles where id = p_to) then
    raise exception 'You can''t connect with that person.' using errcode = 'P0001';
  end if;
  if p_reason not in ('collaborate', 'hire', 'feedback', 'invest', 'fan') then
    raise exception 'Pick a reason to connect.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_note, '')) > 280 then
    raise exception 'Keep the note under 280 characters.' using errcode = 'P0001';
  end if;

  select * into existing from public.connections
    where least(requester_id, addressee_id) = least(uid, p_to)
      and greatest(requester_id, addressee_id) = greatest(uid, p_to)
    for update;

  if found then
    if existing.status = 'accepted' then
      raise exception 'You''re already connected.' using errcode = 'P0001';
    end if;
    if existing.status = 'pending' and existing.requester_id = p_to then
      -- They already asked you: connecting back accepts it.
      update public.connections set status = 'accepted', responded_at = now() where id = existing.id;
      return 'accepted';
    end if;
    if existing.status = 'pending' then
      raise exception 'Your request is waiting for an answer.' using errcode = 'P0001';
    end if;
    if existing.responded_at > now() - interval '30 days' then
      raise exception 'You can ask again 30 days after a request is declined.' using errcode = 'P0001';
    end if;
    delete from public.connections where id = existing.id;
  end if;

  if (
    select count(*) from public.connections where requester_id = uid and created_at > now() - interval '24 hours'
  ) >= 30 then
    raise exception 'That''s a lot of requests today. Try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.connections (requester_id, addressee_id, reason, note)
  values (uid, p_to, p_reason, btrim(coalesce(p_note, '')));
  return 'requested';
end;
$$;

create function public.respond_connection(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.connections
    set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
    where id = p_id and addressee_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'No pending request to answer.' using errcode = 'P0001';
  end if;
end;
$$;

-- Withdraw a request or remove a connection (either person).
create function public.remove_connection(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.connections
    where id = p_id and auth.uid() in (requester_id, addressee_id) and status in ('pending', 'accepted');
  if not found then
    raise exception 'Nothing to remove.' using errcode = 'P0001';
  end if;
end;
$$;

create function public.track_connections()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.addressee_id, 'connection_request', new.requester_id, null, new.id);
  elsif tg_op = 'UPDATE' and old.status <> 'accepted' and new.status = 'accepted' then
    update public.profiles set connection_count = connection_count + 1 where id in (new.requester_id, new.addressee_id);
    perform public.notify(new.requester_id, 'connection_accepted', new.addressee_id, null, new.id);
  elsif tg_op = 'DELETE' and old.status = 'accepted' then
    update public.profiles set connection_count = greatest(connection_count - 1, 0)
      where id in (old.requester_id, old.addressee_id);
  end if;
  return null;
end;
$$;
create trigger connections_track after insert or update of status or delete on public.connections
  for each row execute function public.track_connections();

-- ---------------------------------------------------------------------------
-- Messages (only between connected people)
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create index messages_recipient_idx on public.messages (recipient_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index messages_unread_idx on public.messages (recipient_id) where read_at is null;

alter table public.messages enable row level security;

create policy "People see their own messages"
  on public.messages for select
  to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

create policy "Connected people can message each other"
  on public.messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and public.are_connected(sender_id, recipient_id)
  );

revoke insert, update, delete on public.messages from anon, authenticated;
grant insert (sender_id, recipient_id, body) on public.messages to authenticated;

create function public.mark_thread_read(p_other uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages set read_at = now()
  where recipient_id = auth.uid() and sender_id = p_other and read_at is null
$$;

-- ---------------------------------------------------------------------------
-- Q&A
-- ---------------------------------------------------------------------------

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 5 and 500),
  answer_count integer not null default 0,
  vote_count integer not null default 0,
  best_answer_id uuid,
  created_at timestamptz not null default now()
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  vote_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.questions
  add constraint questions_best_answer_fkey foreign key (best_answer_id) references public.answers (id) on delete set null;

create index questions_app_idx on public.questions (app_id, created_at desc);
create index answers_question_idx on public.answers (question_id, created_at);

create table public.question_votes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  primary key (user_id, question_id)
);

create table public.answer_votes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer_id uuid not null references public.answers (id) on delete cascade,
  primary key (user_id, answer_id)
);

alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.question_votes enable row level security;
alter table public.answer_votes enable row level security;

create policy "Questions are public" on public.questions for select using (true);
create policy "Answers are public" on public.answers for select using (true);

create policy "People ask as themselves" on public.questions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "People delete their own questions" on public.questions for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "People answer as themselves" on public.answers for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "People delete their own answers" on public.answers for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "People see their own question votes" on public.question_votes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "People vote on others' questions" on public.question_votes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not exists (select 1 from public.questions q where q.id = question_id and q.user_id = (select auth.uid()))
  );
create policy "People take back their question votes" on public.question_votes for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "People see their own answer votes" on public.answer_votes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "People vote on others' answers" on public.answer_votes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not exists (select 1 from public.answers a where a.id = answer_id and a.user_id = (select auth.uid()))
  );
create policy "People take back their answer votes" on public.answer_votes for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update on public.questions, public.answers, public.question_votes, public.answer_votes
  from anon, authenticated;
grant insert (app_id, user_id, body) on public.questions to authenticated;
grant insert (question_id, user_id, body) on public.answers to authenticated;
grant insert (user_id, question_id) on public.question_votes to authenticated;
grant insert (user_id, answer_id) on public.answer_votes to authenticated;

-- Counters, reputation and notifications.
create function public.track_questions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.apps where id = new.app_id;
  perform public.notify(owner, 'question', new.user_id, new.app_id, new.id);
  return null;
end;
$$;
create trigger questions_track after insert on public.questions
  for each row execute function public.track_questions();

create function public.track_answers()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  q public.questions;
begin
  if tg_op = 'INSERT' then
    update public.questions set answer_count = answer_count + 1 where id = new.question_id returning * into q;
    perform public.notify(q.user_id, 'answer', new.user_id, q.app_id, q.id);
  else
    update public.questions set answer_count = greatest(answer_count - 1, 0) where id = old.question_id;
  end if;
  return null;
end;
$$;
create trigger answers_track after insert or delete on public.answers
  for each row execute function public.track_answers();

-- A deleted answer takes its reputation with it: its upvotes, and +5 if it was
-- the best answer. Runs before the delete, while best_answer_id still points here.
create function public.answer_reputation_on_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lost integer := old.vote_count;
begin
  if exists (select 1 from public.questions where id = old.question_id and best_answer_id = old.id) then
    lost := lost + 5;
  end if;
  update public.profiles set reputation = greatest(reputation - lost, 0) where id = old.user_id;
  return old;
end;
$$;
create trigger answers_reputation before delete on public.answers
  for each row execute function public.answer_reputation_on_delete();

create function public.track_question_votes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.questions set vote_count = vote_count + 1 where id = new.question_id;
  else
    update public.questions set vote_count = greatest(vote_count - 1, 0) where id = old.question_id;
  end if;
  return null;
end;
$$;
create trigger question_votes_track after insert or delete on public.question_votes
  for each row execute function public.track_question_votes();

-- Each upvote on an answer is +1 reputation for whoever wrote it.
create function public.track_answer_votes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
begin
  if tg_op = 'INSERT' then
    update public.answers set vote_count = vote_count + 1 where id = new.answer_id returning user_id into author;
    update public.profiles set reputation = reputation + 1 where id = author;
  else
    update public.answers set vote_count = greatest(vote_count - 1, 0) where id = old.answer_id returning user_id into author;
    update public.profiles set reputation = greatest(reputation - 1, 0) where id = author;
  end if;
  return null;
end;
$$;
create trigger answer_votes_track after insert or delete on public.answer_votes
  for each row execute function public.track_answer_votes();

-- The asker or the app's builder picks the best answer: +5 reputation to its
-- author. Picking a different one moves the points.
create function public.mark_best_answer(p_question uuid, p_answer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  q public.questions;
  new_author uuid;
  old_author uuid;
begin
  select qq.* into q
    from public.questions qq join public.apps a on a.id = qq.app_id
    where qq.id = p_question and uid in (qq.user_id, a.owner_id)
    for update of qq;
  if not found then
    raise exception 'Only the person who asked or the app''s builder can pick the best answer.' using errcode = 'P0001';
  end if;
  select user_id into new_author from public.answers where id = p_answer and question_id = p_question;
  if new_author is null then
    raise exception 'That answer isn''t on this question.' using errcode = 'P0001';
  end if;
  if q.best_answer_id = p_answer then
    return;
  end if;
  if q.best_answer_id is not null then
    select user_id into old_author from public.answers where id = q.best_answer_id;
    update public.profiles set reputation = greatest(reputation - 5, 0) where id = old_author;
  end if;
  update public.questions set best_answer_id = p_answer where id = p_question;
  update public.profiles set reputation = reputation + 5 where id = new_author;
  perform public.notify(new_author, 'best_answer', uid, q.app_id, q.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Builders like you
-- ---------------------------------------------------------------------------

-- Scores other builders by shared app categories (from what you build, like
-- and test) and shared skills. Leaves out people you already follow.
create function public.suggest_builders(p_limit integer default 6)
returns table (id uuid, username text, display_name text, roles text[], shared_categories text[], shared_skills text[], score integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as uid
  ),
  my_categories as (
    select a.category from public.apps a, me where a.owner_id = me.uid
    union
    select a.category from public.likes l join public.drops d on d.id = l.drop_id join public.apps a on a.id = d.app_id, me
      where l.user_id = me.uid
    union
    select a.category from public.feedback f join public.apps a on a.id = f.app_id, me where f.user_id = me.uid
  ),
  my_skills as (
    select distinct lower(s) as skill from public.profiles p, me, unnest(p.skills) s where p.id = me.uid
  ),
  scored as (
    select
      p.id, p.username, p.display_name, p.roles,
      array(
        select distinct a.category from public.apps a
        where a.owner_id = p.id and a.link_checked_at is not null and a.category in (select category from my_categories)
      ) as shared_categories,
      array(select distinct s from unnest(p.skills) s where lower(s) in (select skill from my_skills)) as shared_skills
    from public.profiles p, me
    where me.uid is not null
      and p.id <> me.uid
      and not exists (select 1 from public.follows f where f.follower_id = me.uid and f.following_id = p.id)
  )
  select id, username, display_name, roles, shared_categories, shared_skills,
         (2 * cardinality(shared_categories) + cardinality(shared_skills))::integer as score
  from scored
  where cardinality(shared_categories) + cardinality(shared_skills) > 0
  order by score desc, username
  limit least(greatest(coalesce(p_limit, 6), 1), 20)
$$;

-- ---------------------------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------------------------

revoke execute on function public.mark_notifications_read() from public, anon;
revoke execute on function public.are_connected(uuid, uuid) from public, anon;
revoke execute on function public.request_connection(uuid, text, text) from public, anon;
revoke execute on function public.respond_connection(uuid, boolean) from public, anon;
revoke execute on function public.remove_connection(uuid) from public, anon;
revoke execute on function public.mark_thread_read(uuid) from public, anon;
revoke execute on function public.mark_best_answer(uuid, uuid) from public, anon;
revoke execute on function public.suggest_builders(integer) from public, anon;

grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.are_connected(uuid, uuid) to authenticated;
grant execute on function public.request_connection(uuid, text, text) to authenticated;
grant execute on function public.respond_connection(uuid, boolean) to authenticated;
grant execute on function public.remove_connection(uuid) to authenticated;
grant execute on function public.mark_thread_read(uuid) to authenticated;
grant execute on function public.mark_best_answer(uuid, uuid) to authenticated;
grant execute on function public.suggest_builders(integer) to authenticated;

-- ===========================================================================
-- 20260928000000_phase4_earn.sql
-- ===========================================================================

-- Method V, Phase 4 ("Earn"):
--   * Jobs board: hiring posts, gigs and "looking for work" posts, with
--     applications that open a conversation when shortlisted
--   * Backers: fans tip an app; the builder's share lands in their earnings
--   * Boost Exchange, paid: one app sponsors another and pays per real try
--   * Challenges: stack sponsors fund prizes; builders enter, people vote
--   * Pro profiles: a 30-day pass with analytics, a pinned app and cheaper boosts
--   * Earnings and payouts through Stripe Connect
--
-- Money moves only through the server. It creates a pending payment with
-- prepare_payment() (as the signed-in person, so the rules below apply), sends
-- them to Stripe Checkout, and Stripe's signed webhook calls complete_payment()
-- with the secret key. Nobody can write payments, earnings, payouts, backings
-- or sponsorship totals from the browser. Amounts are whole cents.
--
-- Must match EARN in src/lib/constants.ts.

-- ---------------------------------------------------------------------------
-- Profiles and apps
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column pro_until timestamptz,
  add column pinned_app_id uuid references public.apps (id) on delete set null,
  -- Mirrors payout_accounts.payouts_enabled so pages can show it.
  add column payouts_enabled boolean not null default false;

grant update (pinned_app_id) on public.profiles to authenticated;

alter table public.apps
  add column backer_count integer not null default 0;

create function public.is_pro(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select pro_until > now() from public.profiles where id = p_user), false)
$$;

-- You can only pin one of your own apps.
create function public.check_pinned_app()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pinned_app_id is not null and not exists (
    select 1 from public.apps where id = new.pinned_app_id and owner_id = new.id
  ) then
    raise exception 'You can only pin your own app.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger profiles_check_pin before update of pinned_app_id on public.profiles
  for each row execute function public.check_pinned_app();

-- Pro boosts cost half: 5 credits a day instead of 10.
create or replace function public.boost_app(p_app_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cost integer;
  balance integer;
begin
  if p_days is null or p_days < 1 or p_days > 7 then
    raise exception 'Boost for 1 to 7 days.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.apps where id = p_app_id and owner_id = uid and link_checked_at is not null
  ) then
    raise exception 'You can only boost your own live apps.' using errcode = 'P0001';
  end if;
  cost := p_days * (case when public.is_pro(uid) then 5 else 10 end);
  select credits into balance from public.profiles where id = uid for update;
  if balance < cost then
    raise exception 'That costs % credits and you have %.', cost, balance using errcode = 'P0001';
  end if;
  insert into public.credit_events (user_id, delta, reason, app_id) values (uid, -cost, 'boost', p_app_id);
  update public.apps
    set boosted_until = greatest(coalesce(boosted_until, now()), now()) + make_interval(days => p_days)
    where id = p_app_id;
end;
$$;

-- New accounts can't vote or count as a sponsored try until they're a day
-- old, so a builder can't farm tries or votes with throwaway accounts.
create function public.account_is_established(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select created_at < now() - interval '1 day' from public.profiles where id = p_user), false)
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'follow', 'like', 'comment', 'feedback', 'helpful',
    'connection_request', 'connection_accepted',
    'question', 'answer', 'best_answer',
    'swap_request', 'swap_accepted',
    'backed', 'sponsor_offer', 'sponsor_accepted', 'sponsor_started', 'sponsor_ended',
    'job_application', 'application_shortlisted'
  ));

-- ---------------------------------------------------------------------------
-- Jobs board
-- ---------------------------------------------------------------------------

-- kind: 'hiring' (a job), 'gig' (a paid one-off) or 'looking' (someone
-- looking for work). People apply to hiring posts and gigs; for "looking"
-- posts you Connect instead.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  app_id uuid references public.apps (id) on delete set null,
  kind text not null check (kind in ('hiring', 'gig', 'looking')),
  title text not null check (char_length(btrim(title)) between 5 and 80),
  body text not null default '' check (char_length(body) <= 2000),
  pay text not null default '' check (char_length(pay) <= 60),
  location text not null default '' check (char_length(location) <= 60),
  remote boolean not null default true,
  skills text[] not null default '{}' check (cardinality(skills) <= 8),
  status text not null default 'open' check (status in ('open', 'closed')),
  application_count integer not null default 0,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);

create index jobs_open_idx on public.jobs (created_at desc) where status = 'open';
create index jobs_user_idx on public.jobs (user_id, created_at desc);
create index jobs_skills_idx on public.jobs using gin (skills);

alter table public.jobs enable row level security;

create policy "Open posts are public; people see their own"
  on public.jobs for select
  using ((status = 'open' and expires_at > now()) or (select auth.uid()) = user_id);

create policy "People post as themselves"
  on public.jobs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "People edit their own posts"
  on public.jobs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "People delete their own posts"
  on public.jobs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update on public.jobs from anon, authenticated;
grant insert (user_id, app_id, kind, title, body, pay, location, remote, skills) on public.jobs to authenticated;
grant update (title, body, pay, location, remote, skills, status) on public.jobs to authenticated;

-- Up to 5 open posts per person, and a linked app must be your own.
create function public.check_job()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.app_id is not null and not exists (
    select 1 from public.apps where id = new.app_id and owner_id = new.user_id
  ) then
    raise exception 'You can only link your own app.' using errcode = 'P0001';
  end if;
  if new.status = 'open' and (tg_op = 'INSERT' or old.status <> 'open') and (
    select count(*) from public.jobs
    where user_id = new.user_id and status = 'open' and expires_at > now() and id <> new.id
  ) >= 5 then
    raise exception 'You can have up to 5 open posts. Close one first.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger jobs_check before insert or update on public.jobs
  for each row execute function public.check_job();

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  app_id uuid references public.apps (id) on delete set null,
  note text not null check (char_length(btrim(note)) between 1 and 500),
  status text not null default 'new' check (status in ('new', 'shortlisted', 'passed')),
  created_at timestamptz not null default now(),
  unique (job_id, user_id)
);

create index job_applications_job_idx on public.job_applications (job_id, created_at desc);

alter table public.job_applications enable row level security;

create policy "Applicants and the poster see applications"
  on public.job_applications for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.jobs j where j.id = job_id and j.user_id = (select auth.uid()))
  );

create policy "People apply as themselves"
  on public.job_applications for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Applicants withdraw their own"
  on public.job_applications for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update on public.job_applications from anon, authenticated;
grant insert (job_id, user_id, app_id, note) on public.job_applications to authenticated;

create function public.check_application()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = new.job_id;
  if j.id is null or j.status <> 'open' or j.expires_at <= now() then
    raise exception 'That post is closed.' using errcode = 'P0001';
  end if;
  if j.kind = 'looking' then
    raise exception 'Connect with them instead.' using errcode = 'P0001';
  end if;
  if j.user_id = new.user_id then
    raise exception 'That''s your own post.' using errcode = 'P0001';
  end if;
  if new.app_id is not null and not exists (
    select 1 from public.apps where id = new.app_id and owner_id = new.user_id
  ) then
    raise exception 'You can only attach your own app.' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.job_applications where user_id = new.user_id and created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception 'That''s a lot of applications today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  new.note := btrim(new.note);
  return new;
end;
$$;
create trigger job_applications_check before insert on public.job_applications
  for each row execute function public.check_application();

create function public.bump_application_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.jobs set application_count = application_count + 1 where id = new.job_id;
    perform public.notify((select user_id from public.jobs where id = new.job_id), 'job_application', new.user_id, null, new.job_id);
  else
    update public.jobs set application_count = greatest(application_count - 1, 0) where id = old.job_id;
  end if;
  return null;
end;
$$;
create trigger job_applications_count after insert or delete on public.job_applications
  for each row execute function public.bump_application_count();

-- The poster shortlists (which connects you both, so you can message) or
-- passes on an application.
create function public.respond_application(p_id uuid, p_shortlist boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  a public.job_applications;
  existing public.connections;
  conn_id uuid;
begin
  select ja.* into a from public.job_applications ja join public.jobs j on j.id = ja.job_id
    where ja.id = p_id and j.user_id = uid
    for update of ja;
  if a.id is null then
    raise exception 'Application not found.' using errcode = 'P0001';
  end if;
  if not p_shortlist then
    update public.job_applications set status = 'passed' where id = a.id;
    return;
  end if;
  update public.job_applications set status = 'shortlisted' where id = a.id;

  select * into existing from public.connections
    where least(requester_id, addressee_id) = least(uid, a.user_id)
      and greatest(requester_id, addressee_id) = greatest(uid, a.user_id)
    for update;
  if existing.id is null then
    -- Inserted already accepted: the connections trigger only counts a
    -- request being accepted, and would send a "wants to connect" notice.
    insert into public.connections (requester_id, addressee_id, reason, status, responded_at)
    values (uid, a.user_id, 'hire', 'accepted', now())
    returning id into conn_id;
    update public.profiles set connection_count = connection_count + 1 where id in (uid, a.user_id);
    delete from public.notifications where kind = 'connection_request' and ref_id = conn_id;
  elsif existing.status <> 'accepted' then
    update public.connections set status = 'accepted', responded_at = now() where id = existing.id;
  end if;
  perform public.notify(a.user_id, 'application_shortlisted', uid, null, a.job_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

-- Stripe Connect accounts. Written only by the server with the secret key.
create table public.payout_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id text not null unique,
  payouts_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.payout_accounts enable row level security;

create policy "People see their own payout account"
  on public.payout_accounts for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.payout_accounts from anon, authenticated;

create function public.mirror_payouts_enabled()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set payouts_enabled = new.payouts_enabled where id = new.user_id;
  return null;
end;
$$;
create trigger payout_accounts_mirror after insert or update of payouts_enabled on public.payout_accounts
  for each row execute function public.mirror_payouts_enabled();

-- kind 'tip': ref_id is the app. 'sponsorship': ref_id is the sponsorship.
-- 'pro': no ref. refund_cents is set when money has to go back (unspent
-- sponsorship budget); the server refunds it through Stripe and sets
-- refunded_at.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('tip', 'sponsorship', 'pro')),
  ref_id uuid,
  amount_cents integer not null check (amount_cents > 0),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  note text not null default '' check (char_length(note) <= 140),
  is_public boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  stripe_session_id text unique,
  stripe_payment_intent text,
  refund_cents integer not null default 0 check (refund_cents >= 0),
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_refund_idx on public.payments (user_id) where refund_cents > 0 and refunded_at is null;

alter table public.payments enable row level security;

create policy "People see their own payments"
  on public.payments for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.payments from anon, authenticated;

-- A builder's money: tips and sponsored tries in, payouts out. The balance
-- is the sum, never negative.
create table public.earnings (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta_cents integer not null check (delta_cents <> 0),
  kind text not null check (kind in ('tip', 'sponsored_try', 'payout', 'payout_failed')),
  app_id uuid references public.apps (id) on delete set null,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index earnings_user_idx on public.earnings (user_id, created_at desc);

alter table public.earnings enable row level security;

create policy "People see their own earnings"
  on public.earnings for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.earnings from anon, authenticated;

create function public.earnings_balance(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(delta_cents), 0)::integer from public.earnings where user_id = p_user
$$;

create function public.my_earnings_balance()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.earnings_balance(auth.uid())
$$;

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  stripe_transfer_id text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index payouts_one_pending on public.payouts (user_id) where status = 'pending';

alter table public.payouts enable row level security;

create policy "People see their own payouts"
  on public.payouts for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.payouts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backers
-- ---------------------------------------------------------------------------

create table public.backings (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  payment_id uuid not null unique references public.payments (id) on delete cascade,
  amount_cents integer not null,
  note text not null default '',
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index backings_app_idx on public.backings (app_id, created_at desc);

alter table public.backings enable row level security;

-- The backers wall shows names and notes, never amounts: the amount column
-- isn't granted to the browser at all.
create policy "Public backings are public; backers see their own"
  on public.backings for select
  using (is_public or (select auth.uid()) = user_id);

revoke all on public.backings from anon, authenticated;
grant select (id, app_id, user_id, note, is_public, created_at) on public.backings to anon, authenticated;

create function public.bump_backer_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Counts people, not payments: a second tip from the same fan isn't a new backer.
  if not exists (select 1 from public.backings where app_id = new.app_id and user_id = new.user_id and id <> new.id) then
    update public.apps set backer_count = backer_count + 1 where id = new.app_id;
  end if;
  return null;
end;
$$;
create trigger backings_count after insert on public.backings
  for each row execute function public.bump_backer_count();

-- ---------------------------------------------------------------------------
-- Boost Exchange, paid: sponsorships that pay per try
-- ---------------------------------------------------------------------------

-- offered -> accepted (host said yes) -> active (sponsor paid the budget)
-- -> completed (budget used up) or ended (either side stopped it; unspent
-- budget is refunded). Or offered -> declined.
create table public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  sponsor_app uuid references public.apps (id) on delete set null,
  host_app uuid references public.apps (id) on delete set null,
  sponsor_user uuid not null references public.profiles (id) on delete cascade,
  host_user uuid not null references public.profiles (id) on delete cascade,
  price_cents integer not null check (price_cents between 10 and 500),
  budget_cents integer not null check (budget_cents between 1000 and 100000),
  spent_cents integer not null default 0 check (spent_cents >= 0),
  tries integer not null default 0,
  message text not null default '' check (char_length(message) <= 280),
  status text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'active', 'completed', 'ended')),
  payment_id uuid references public.payments (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  check (spent_cents <= budget_cents),
  check (budget_cents >= price_cents * 10)
);

create unique index sponsorships_one_open_per_pair
  on public.sponsorships (sponsor_app, host_app)
  where status in ('offered', 'accepted', 'active');
-- A host shows one sponsor at a time, so sponsored slots stay rare.
create unique index sponsorships_one_per_host
  on public.sponsorships (host_app)
  where status in ('accepted', 'active');
create index sponsorships_sponsor_idx on public.sponsorships (sponsor_user, created_at desc);
create index sponsorships_host_idx on public.sponsorships (host_user, created_at desc);

alter table public.sponsorships enable row level security;

-- Deal terms and stats are between the two builders. The public only sees
-- "Sponsored by" through active_sponsors().
create policy "Both sides see their sponsorships"
  on public.sponsorships for select
  to authenticated
  using ((select auth.uid()) in (sponsor_user, host_user));

revoke insert, update, delete on public.sponsorships from anon, authenticated;

-- One sponsored try per person per deal, from established accounts that
-- don't own either app.
create table public.sponsored_tries (
  sponsorship_id uuid not null references public.sponsorships (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sponsorship_id, user_id)
);

alter table public.sponsored_tries enable row level security;
revoke all on public.sponsored_tries from anon, authenticated;

-- An app with a deal still running can't be deleted (money is attached).
create function public.protect_sponsored_app()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.sponsorships
    where old.id in (sponsor_app, host_app) and status in ('accepted', 'active')
  ) then
    raise exception 'End this app''s sponsorship before deleting it.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
create trigger apps_protect_sponsored before delete on public.apps
  for each row execute function public.protect_sponsored_app();

create function public.offer_sponsorship(
  p_sponsor_app uuid, p_host_app uuid, p_price integer, p_budget integer, p_message text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  host public.apps;
  new_id uuid;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.apps where id = p_sponsor_app and owner_id = uid and link_checked_at is not null
  ) then
    raise exception 'Sponsor with one of your own live apps.' using errcode = 'P0001';
  end if;
  select * into host from public.apps where id = p_host_app and link_checked_at is not null;
  if host.id is null then
    raise exception 'That app can''t be sponsored.' using errcode = 'P0001';
  end if;
  if host.owner_id = uid then
    raise exception 'You can''t sponsor your own app.' using errcode = 'P0001';
  end if;
  if p_price is null or p_price < 10 or p_price > 500 then
    raise exception 'Pay between $0.10 and $5 per try.' using errcode = 'P0001';
  end if;
  if p_budget is null or p_budget < 1000 or p_budget > 100000 then
    raise exception 'Set a budget between $10 and $1,000.' using errcode = 'P0001';
  end if;
  if p_budget < p_price * 10 then
    raise exception 'The budget should cover at least 10 tries.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_message, '')) > 280 then
    raise exception 'Keep the message under 280 characters.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.sponsorships
    where sponsor_app = p_sponsor_app and host_app = p_host_app and status in ('offered', 'accepted', 'active')
  ) then
    raise exception 'You already have a deal going with that app.' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.sponsorships where sponsor_user = uid and created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'That''s a lot of offers today. Try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.sponsorships (sponsor_app, host_app, sponsor_user, host_user, price_cents, budget_cents, message)
  values (p_sponsor_app, p_host_app, uid, host.owner_id, p_price, p_budget, btrim(coalesce(p_message, '')))
  returning id into new_id;
  perform public.notify(host.owner_id, 'sponsor_offer', uid, p_host_app, new_id);
  return new_id;
end;
$$;

create function public.respond_sponsorship(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sponsorships;
begin
  select * into s from public.sponsorships
    where id = p_id and host_user = auth.uid() and status = 'offered'
    for update;
  if s.id is null then
    raise exception 'That offer isn''t open.' using errcode = 'P0001';
  end if;
  if not p_accept then
    update public.sponsorships set status = 'declined', responded_at = now() where id = s.id;
    return;
  end if;
  if exists (select 1 from public.sponsorships where host_app = s.host_app and status in ('accepted', 'active')) then
    raise exception 'Your app already has a sponsor. End that deal first.' using errcode = 'P0001';
  end if;
  update public.sponsorships set status = 'accepted', responded_at = now() where id = s.id;
  perform public.notify(s.sponsor_user, 'sponsor_accepted', s.host_user, s.sponsor_app, s.id);
end;
$$;

-- Either side can stop a deal. A running deal's unspent budget is marked for
-- refund on its payment; returns that payment's id (or null) so the server
-- can refund it straight away.
create function public.end_sponsorship(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.sponsorships;
begin
  select * into s from public.sponsorships
    where id = p_id and uid in (sponsor_user, host_user) and status in ('offered', 'accepted', 'active')
    for update;
  if s.id is null then
    raise exception 'That deal isn''t running.' using errcode = 'P0001';
  end if;
  update public.sponsorships set status = 'ended', ended_at = now() where id = s.id;
  if s.status = 'active' then
    perform public.notify(case when uid = s.sponsor_user then s.host_user else s.sponsor_user end,
      'sponsor_ended', uid, case when uid = s.sponsor_user then s.host_app else s.sponsor_app end, s.id);
    if s.budget_cents > s.spent_cents and s.payment_id is not null then
      update public.payments set refund_cents = s.budget_cents - s.spent_cents where id = s.payment_id;
      return s.payment_id;
    end if;
  end if;
  return null;
end;
$$;

-- Called by the /try route when someone taps a sponsor card and lands on the
-- sponsor's app (p_app). Charges the sponsor one try's price and pays the
-- host their share. Returns whether this try counted.
create function public.record_sponsored_try(p_id uuid, p_app uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.sponsorships;
  cut integer;
  leftover integer;
begin
  if uid is null or not public.account_is_established(uid) then
    return false;
  end if;
  select * into s from public.sponsorships where id = p_id and status = 'active' for update;
  if s.id is null or s.sponsor_app is distinct from p_app or uid in (s.sponsor_user, s.host_user) then
    return false;
  end if;
  insert into public.sponsored_tries (sponsorship_id, user_id) values (s.id, uid) on conflict do nothing;
  if not found then
    return false;
  end if;

  -- Method V keeps 12% of each try.
  cut := round(s.price_cents * 0.12);
  update public.sponsorships
    set spent_cents = spent_cents + s.price_cents, tries = tries + 1
    where id = s.id;
  insert into public.earnings (user_id, delta_cents, kind, app_id, ref_id)
  values (s.host_user, s.price_cents - cut, 'sponsored_try', s.host_app, s.id);

  -- Budget can't cover another try: the deal is done; refund the few cents left.
  leftover := s.budget_cents - s.spent_cents - s.price_cents;
  if leftover < s.price_cents then
    update public.sponsorships set status = 'completed', ended_at = now() where id = s.id;
    if leftover > 0 and s.payment_id is not null then
      update public.payments set refund_cents = leftover where id = s.payment_id;
    end if;
  end if;
  return true;
end;
$$;

-- "Sponsored by" cards for the given host apps (public).
create function public.active_sponsors(p_hosts uuid[])
returns table (sponsorship_id uuid, host_app uuid, sponsor_id uuid, sponsor_slug text, sponsor_name text, sponsor_tagline text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.host_app, a.id, a.slug, a.name, a.tagline
  from public.sponsorships s
  join public.apps a on a.id = s.sponsor_app and a.link_checked_at is not null
  where s.status = 'active' and s.host_app = any (p_hosts)
$$;

-- ---------------------------------------------------------------------------
-- Payments: prepare (as the payer) and complete (server only)
-- ---------------------------------------------------------------------------

create function public.prepare_payment(
  p_kind text, p_ref uuid default null, p_amount integer default null,
  p_note text default '', p_public boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  amount integer;
  fee integer := 0;
  s public.sponsorships;
  new_id uuid;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.payments where user_id = uid and status = 'pending' and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'Too many checkouts started. Try again in a bit.' using errcode = 'P0001';
  end if;

  if p_kind = 'tip' then
    if not exists (select 1 from public.apps where id = p_ref and link_checked_at is not null) then
      raise exception 'That app can''t take tips.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.apps where id = p_ref and owner_id = uid) then
      raise exception 'You can''t back your own app.' using errcode = 'P0001';
    end if;
    if p_amount is null or p_amount < 100 or p_amount > 50000 then
      raise exception 'Tip between $1 and $500.' using errcode = 'P0001';
    end if;
    if char_length(coalesce(p_note, '')) > 140 then
      raise exception 'Keep the note under 140 characters.' using errcode = 'P0001';
    end if;
    amount := p_amount;
    fee := round(amount * 0.05);
  elsif p_kind = 'pro' then
    amount := 600;
    fee := amount;
  elsif p_kind = 'sponsorship' then
    select * into s from public.sponsorships where id = p_ref and sponsor_user = uid and status = 'accepted';
    if s.id is null then
      raise exception 'That deal isn''t waiting for payment.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.sponsorships where sponsor_user = uid and status = 'active') >= 3 then
      raise exception 'You can run up to 3 sponsorships at once.' using errcode = 'P0001';
    end if;
    amount := s.budget_cents;
  else
    raise exception 'Unknown payment.' using errcode = 'P0001';
  end if;

  insert into public.payments (user_id, kind, ref_id, amount_cents, fee_cents, note, is_public)
  values (uid, p_kind, case when p_kind = 'pro' then null else p_ref end, amount, fee,
          case when p_kind = 'tip' then btrim(coalesce(p_note, '')) else '' end,
          case when p_kind = 'tip' then coalesce(p_public, true) else true end)
  returning id into new_id;
  return new_id;
end;
$$;

-- Called only by the Stripe webhook (secret key). Safe to call twice.
create function public.complete_payment(p_id uuid, p_session text, p_amount integer, p_intent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payments;
  owner uuid;
  backing_id uuid;
  s public.sponsorships;
begin
  select * into p from public.payments where id = p_id for update;
  if p.id is null then
    raise exception 'Unknown payment.' using errcode = 'P0001';
  end if;
  if p.status = 'paid' then
    return;
  end if;
  if p_amount is distinct from p.amount_cents then
    raise exception 'Paid amount doesn''t match.' using errcode = 'P0001';
  end if;
  update public.payments
    set status = 'paid', paid_at = now(), stripe_session_id = p_session, stripe_payment_intent = p_intent
    where id = p.id;

  if p.kind = 'tip' then
    select owner_id into owner from public.apps where id = p.ref_id;
    insert into public.backings (app_id, user_id, payment_id, amount_cents, note, is_public)
    values (p.ref_id, p.user_id, p.id, p.amount_cents, p.note, p.is_public)
    returning id into backing_id;
    if owner is not null then
      insert into public.earnings (user_id, delta_cents, kind, app_id, ref_id)
      values (owner, p.amount_cents - p.fee_cents, 'tip', p.ref_id, backing_id);
      perform public.notify(owner, 'backed', case when p.is_public then p.user_id end, p.ref_id, backing_id);
    end if;
  elsif p.kind = 'pro' then
    update public.profiles
      set pro_until = greatest(coalesce(pro_until, now()), now()) + interval '30 days'
      where id = p.user_id;
  elsif p.kind = 'sponsorship' then
    select * into s from public.sponsorships where id = p.ref_id for update;
    if s.id is not null and s.status = 'accepted' then
      update public.sponsorships set status = 'active', started_at = now(), payment_id = p.id where id = s.id;
      perform public.notify(s.host_user, 'sponsor_started', s.sponsor_user, s.host_app, s.id);
    else
      -- The deal was called off before the money arrived: give it all back.
      update public.payments set refund_cents = p.amount_cents where id = p.id;
    end if;
  end if;
end;
$$;

create function public.mark_refunded(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments set refunded_at = now() where id = p_id and refund_cents > 0 and refunded_at is null
$$;

-- Cash out: moves the whole balance into a pending payout. The server then
-- makes the Stripe transfer and calls finish_payout().
create function public.start_payout(p_user uuid)
returns table (payout_id uuid, amount_cents integer, stripe_account_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct public.payout_accounts;
  balance integer;
  new_id uuid;
begin
  perform 1 from public.profiles where id = p_user for update;
  select * into acct from public.payout_accounts where user_id = p_user;
  if acct.user_id is null or not acct.payouts_enabled then
    raise exception 'Set up payouts first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payouts where user_id = p_user and status = 'pending') then
    raise exception 'A payout is already on its way.' using errcode = 'P0001';
  end if;
  balance := public.earnings_balance(p_user);
  if balance < 500 then
    raise exception 'You can cash out from $5.' using errcode = 'P0001';
  end if;
  insert into public.payouts (user_id, amount_cents) values (p_user, balance) returning id into new_id;
  insert into public.earnings (user_id, delta_cents, kind, ref_id) values (p_user, -balance, 'payout', new_id);
  return query select new_id, balance, acct.stripe_account_id;
end;
$$;

create function public.finish_payout(p_id uuid, p_transfer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  po public.payouts;
begin
  select * into po from public.payouts where id = p_id and status = 'pending' for update;
  if po.id is null then
    return;
  end if;
  if p_transfer is null then
    update public.payouts set status = 'failed', finished_at = now() where id = po.id;
    insert into public.earnings (user_id, delta_cents, kind, ref_id) values (po.user_id, po.amount_cents, 'payout_failed', po.id);
  else
    update public.payouts set status = 'paid', stripe_transfer_id = p_transfer, finished_at = now() where id = po.id;
  end if;
end;
$$;

revoke execute on function public.complete_payment(uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.mark_refunded(uuid) from public, anon, authenticated;
revoke execute on function public.start_payout(uuid) from public, anon, authenticated;
revoke execute on function public.finish_payout(uuid, text) from public, anon, authenticated;
revoke execute on function public.earnings_balance(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Challenges (stack sponsors)
-- ---------------------------------------------------------------------------

-- Created by the Method V team (with the secret key) for a sponsor, e.g.
-- "Best app built with Supabase". If stack is set, entries must list it in
-- their tech stack; if category is set, entries must be in it.
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 5 and 80),
  body text not null default '' check (char_length(body) <= 2000),
  sponsor_name text not null check (char_length(sponsor_name) between 1 and 60),
  sponsor_url text check (sponsor_url is null or sponsor_url ~* '^https://'),
  prize text not null check (char_length(prize) between 1 and 120),
  stack text check (stack is null or char_length(stack) <= 40),
  category text check (category is null or category in (
    'ai', 'productivity', 'dev-tools', 'design', 'games', 'finance', 'education', 'social', 'health', 'other'
  )),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  winner_entry_id uuid,
  entry_count integer not null default 0,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table public.challenges enable row level security;
create policy "Challenges are public" on public.challenges for select using (true);
revoke insert, update, delete on public.challenges from anon, authenticated;

create table public.challenge_entries (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  app_id uuid not null references public.apps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (challenge_id, app_id)
);

create index challenge_entries_rank_idx on public.challenge_entries (challenge_id, vote_count desc);

alter table public.challenge_entries enable row level security;

create policy "Entries are public" on public.challenge_entries for select using (true);

create policy "Builders enter their own apps"
  on public.challenge_entries for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Builders withdraw their own entries"
  on public.challenge_entries for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update on public.challenge_entries from anon, authenticated;
grant insert (challenge_id, app_id, user_id) on public.challenge_entries to authenticated;

alter table public.challenges
  add constraint challenges_winner_fk foreign key (winner_entry_id)
  references public.challenge_entries (id) on delete set null;

create function public.check_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c public.challenges;
  a public.apps;
begin
  select * into c from public.challenges where id = new.challenge_id;
  if c.id is null or now() < c.starts_at or now() >= c.ends_at then
    raise exception 'That challenge isn''t open.' using errcode = 'P0001';
  end if;
  select * into a from public.apps where id = new.app_id and owner_id = new.user_id and link_checked_at is not null;
  if a.id is null then
    raise exception 'Enter one of your own live apps.' using errcode = 'P0001';
  end if;
  if c.category is not null and a.category <> c.category then
    raise exception 'This challenge is for a different category.' using errcode = 'P0001';
  end if;
  if c.stack is not null and not exists (
    select 1 from unnest(a.tech_stack) t where lower(t) = lower(c.stack)
  ) then
    raise exception 'Add % to your app''s tech stack to enter.', c.stack using errcode = 'P0001';
  end if;
  if (select count(*) from public.challenge_entries where challenge_id = c.id and user_id = new.user_id) >= 3 then
    raise exception 'Up to 3 entries per person.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger challenge_entries_check before insert on public.challenge_entries
  for each row execute function public.check_entry();

create function public.bump_entry_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.challenges set entry_count = entry_count + 1 where id = new.challenge_id;
  else
    update public.challenges set entry_count = greatest(entry_count - 1, 0) where id = old.challenge_id;
  end if;
  return null;
end;
$$;
create trigger challenge_entries_count after insert or delete on public.challenge_entries
  for each row execute function public.bump_entry_count();

-- One vote per person per challenge.
create table public.challenge_votes (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_id uuid not null references public.challenge_entries (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

alter table public.challenge_votes enable row level security;

create policy "People see their own votes"
  on public.challenge_votes for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "People vote as themselves"
  on public.challenge_votes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "People take back their own votes"
  on public.challenge_votes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update on public.challenge_votes from anon, authenticated;
grant insert (challenge_id, user_id, entry_id) on public.challenge_votes to authenticated;

create function public.check_vote()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e public.challenge_entries;
  c public.challenges;
begin
  select * into e from public.challenge_entries where id = new.entry_id;
  select * into c from public.challenges where id = e.challenge_id;
  if e.id is null or e.challenge_id <> new.challenge_id then
    raise exception 'That entry isn''t in this challenge.' using errcode = 'P0001';
  end if;
  if now() < c.starts_at or now() >= c.ends_at then
    raise exception 'Voting has closed.' using errcode = 'P0001';
  end if;
  if e.user_id = new.user_id then
    raise exception 'You can''t vote for your own entry.' using errcode = 'P0001';
  end if;
  if not public.account_is_established(new.user_id) then
    raise exception 'New accounts can vote after their first day.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger challenge_votes_check before insert on public.challenge_votes
  for each row execute function public.check_vote();

create function public.bump_vote_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.challenge_entries set vote_count = vote_count + 1 where id = new.entry_id;
  else
    update public.challenge_entries set vote_count = greatest(vote_count - 1, 0) where id = old.entry_id;
  end if;
  return null;
end;
$$;
create trigger challenge_votes_count after insert or delete on public.challenge_votes
  for each row execute function public.bump_vote_count();

-- ---------------------------------------------------------------------------
-- Pro analytics
-- ---------------------------------------------------------------------------

-- Tries per day for the last 30 days, split into tries from people who came
-- through a sponsor card on another app. Owner only, Pro only.
create function public.app_stats(p_app uuid)
returns table (day date, tries integer, sponsored integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.apps where id = p_app and owner_id = auth.uid()) or not public.is_pro(auth.uid()) then
    raise exception 'Analytics are part of Pro.' using errcode = 'P0001';
  end if;
  return query
    select d::date,
      (select count(*)::integer from public.try_clicks t
        where t.app_id = p_app and t.created_at >= d and t.created_at < d + interval '1 day'),
      (select count(*)::integer from public.sponsored_tries st join public.sponsorships s on s.id = st.sponsorship_id
        where s.sponsor_app = p_app and st.created_at >= d and st.created_at < d + interval '1 day')
    from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
    order by 1;
end;
$$;

-- ===========================================================================
-- 20260929000000_phase5_scale.sql
-- ===========================================================================

-- Method V, Phase 5 ("Scale"):
--   * Where tries come from (feed, app page, embed, sponsor card, API…), for
--     builder analytics
--   * Analytics: daily numbers and try sources per app (owner only; more than
--     7 days back is part of Pro)
--   * Brands: companies outside Method V join the Boost Exchange and sponsor
--     apps, once the Method V team verifies them
--
-- Must match TRY_SOURCES and BRAND_LIMITS in src/lib/constants.ts.

-- ---------------------------------------------------------------------------
-- Try sources
-- ---------------------------------------------------------------------------

alter table public.try_clicks
  add column source text not null default 'direct'
    check (source in ('feed', 'page', 'card', 'embed', 'sponsor', 'api', 'share', 'direct'));

grant insert (source) on public.try_clicks to anon, authenticated;

create index try_clicks_app_day_idx on public.try_clicks (app_id, created_at);

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------

create function public.check_analytics_access(p_app uuid, p_days integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.apps where id = p_app and owner_id = auth.uid()) then
    raise exception 'You can only see stats for your own apps.' using errcode = 'P0001';
  end if;
  if p_days not in (7, 30, 90) then
    raise exception 'Pick 7, 30 or 90 days.' using errcode = 'P0001';
  end if;
  if p_days > 7 and not public.is_pro(auth.uid()) then
    raise exception 'More than 7 days of stats is part of Pro.' using errcode = 'P0001';
  end if;
end;
$$;

-- One row per day, oldest first. "sponsored" counts tries this app got from
-- its own sponsor cards on other apps.
create function public.app_daily(p_app uuid, p_days integer)
returns table (day date, tries integer, sponsored integer, likes integer, feedback integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.check_analytics_access(p_app, p_days);
  return query
    select d::date,
      (select count(*)::integer from public.try_clicks t
        where t.app_id = p_app and t.created_at >= d and t.created_at < d + interval '1 day'),
      (select count(*)::integer from public.sponsored_tries st join public.sponsorships s on s.id = st.sponsorship_id
        where s.sponsor_app = p_app and st.created_at >= d and st.created_at < d + interval '1 day'),
      (select count(*)::integer from public.likes l join public.drops dr on dr.id = l.drop_id
        where dr.app_id = p_app and l.created_at >= d and l.created_at < d + interval '1 day'),
      (select count(*)::integer from public.feedback f
        where f.app_id = p_app and f.created_at >= d and f.created_at < d + interval '1 day')
    from generate_series(
      date_trunc('day', now()) - make_interval(days => p_days - 1), date_trunc('day', now()), interval '1 day'
    ) d
    order by 1;
end;
$$;

create function public.app_sources(p_app uuid, p_days integer)
returns table (source text, tries integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.check_analytics_access(p_app, p_days);
  return query
    select t.source, count(*)::integer
    from public.try_clicks t
    where t.app_id = p_app and t.created_at >= date_trunc('day', now()) - make_interval(days => p_days - 1)
    group by t.source
    order by 2 desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------

-- A company outside Method V. Anyone can list one (up to 3); it shows up once
-- the server has checked its link, and it can sponsor apps once the Method V
-- team sets verified_at.
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(name) between 1 and 60),
  tagline text not null check (char_length(tagline) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  url text not null check (url ~* '^https://' and char_length(url) <= 500),
  link_checked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index brands_owner_idx on public.brands (owner_id);

alter table public.brands enable row level security;

create policy "Live brands are public; owners see their own"
  on public.brands for select
  using (link_checked_at is not null or (select auth.uid()) = owner_id);

create policy "People list brands as themselves"
  on public.brands for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners edit their brands"
  on public.brands for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners delete their brands"
  on public.brands for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- link_checked_at is set by the server after the link check; verified_at by
-- the Method V team. Neither is in a grant.
revoke insert, update on public.brands from anon, authenticated;
grant insert (owner_id, slug, name, tagline, description, url) on public.brands to authenticated;
grant update (name, tagline, description) on public.brands to authenticated;

create function public.check_brand_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.brands where owner_id = new.owner_id) >= 3 then
    raise exception 'You can list up to 3 brands.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger brands_limit before insert on public.brands
  for each row execute function public.check_brand_limit();

-- ---------------------------------------------------------------------------
-- Brand sponsorships
-- ---------------------------------------------------------------------------

alter table public.sponsorships
  add column sponsor_brand uuid references public.brands (id) on delete set null,
  add constraint sponsorships_one_sponsor check (sponsor_app is null or sponsor_brand is null);

create unique index sponsorships_one_open_per_brand_pair
  on public.sponsorships (sponsor_brand, host_app)
  where sponsor_brand is not null and status in ('offered', 'accepted', 'active');

create function public.protect_sponsoring_brand()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.sponsorships where sponsor_brand = old.id and status in ('accepted', 'active')) then
    raise exception 'End this brand''s sponsorships before deleting it.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
create trigger brands_protect_sponsoring before delete on public.brands
  for each row execute function public.protect_sponsoring_brand();

-- Same terms as app-to-app offers (see offer_sponsorship in Phase 4).
create function public.offer_brand_sponsorship(
  p_brand uuid, p_host_app uuid, p_price integer, p_budget integer, p_message text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  host public.apps;
  new_id uuid;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.brands
    where id = p_brand and owner_id = uid and link_checked_at is not null and verified_at is not null
  ) then
    raise exception 'Only verified brands can sponsor apps.' using errcode = 'P0001';
  end if;
  select * into host from public.apps where id = p_host_app and link_checked_at is not null;
  if host.id is null then
    raise exception 'That app can''t be sponsored.' using errcode = 'P0001';
  end if;
  if host.owner_id = uid then
    raise exception 'You can''t sponsor your own app.' using errcode = 'P0001';
  end if;
  if p_price is null or p_price < 10 or p_price > 500 then
    raise exception 'Pay between $0.10 and $5 per try.' using errcode = 'P0001';
  end if;
  if p_budget is null or p_budget < 1000 or p_budget > 100000 then
    raise exception 'Set a budget between $10 and $1,000.' using errcode = 'P0001';
  end if;
  if p_budget < p_price * 10 then
    raise exception 'The budget should cover at least 10 tries.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_message, '')) > 280 then
    raise exception 'Keep the message under 280 characters.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.sponsorships
    where sponsor_brand = p_brand and host_app = p_host_app and status in ('offered', 'accepted', 'active')
  ) then
    raise exception 'You already have a deal going with that app.' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.sponsorships where sponsor_user = uid and created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'That''s a lot of offers today. Try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.sponsorships (sponsor_brand, host_app, sponsor_user, host_user, price_cents, budget_cents, message)
  values (p_brand, p_host_app, uid, host.owner_id, p_price, p_budget, btrim(coalesce(p_message, '')))
  returning id into new_id;
  perform public.notify(host.owner_id, 'sponsor_offer', uid, p_host_app, new_id);
  return new_id;
end;
$$;

-- A try now counts when it lands on the deal's sponsor, app or brand.
create or replace function public.record_sponsored_try(p_id uuid, p_app uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.sponsorships;
  cut integer;
  leftover integer;
begin
  if uid is null or p_app is null or not public.account_is_established(uid) then
    return false;
  end if;
  select * into s from public.sponsorships where id = p_id and status = 'active' for update;
  if s.id is null
    or not (s.sponsor_app is not distinct from p_app or s.sponsor_brand is not distinct from p_app)
    or uid in (s.sponsor_user, s.host_user) then
    return false;
  end if;
  insert into public.sponsored_tries (sponsorship_id, user_id) values (s.id, uid) on conflict do nothing;
  if not found then
    return false;
  end if;

  -- Method V keeps 12% of each try.
  cut := round(s.price_cents * 0.12);
  update public.sponsorships
    set spent_cents = spent_cents + s.price_cents, tries = tries + 1
    where id = s.id;
  insert into public.earnings (user_id, delta_cents, kind, app_id, ref_id)
  values (s.host_user, s.price_cents - cut, 'sponsored_try', s.host_app, s.id);

  leftover := s.budget_cents - s.spent_cents - s.price_cents;
  if leftover < s.price_cents then
    update public.sponsorships set status = 'completed', ended_at = now() where id = s.id;
    if leftover > 0 and s.payment_id is not null then
      update public.payments set refund_cents = leftover where id = s.payment_id;
    end if;
  end if;
  return true;
end;
$$;

-- "Sponsored by" cards, from apps or brands.
drop function public.active_sponsors(uuid[]);
create function public.active_sponsors(p_hosts uuid[])
returns table (
  sponsorship_id uuid, host_app uuid, sponsor_kind text, sponsor_id uuid,
  sponsor_slug text, sponsor_name text, sponsor_tagline text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.host_app, 'app', a.id, a.slug, a.name, a.tagline
  from public.sponsorships s
  join public.apps a on a.id = s.sponsor_app and a.link_checked_at is not null
  where s.status = 'active' and s.host_app = any (p_hosts)
  union all
  select s.id, s.host_app, 'brand', b.id, b.slug, b.name, b.tagline
  from public.sponsorships s
  join public.brands b on b.id = s.sponsor_brand and b.link_checked_at is not null and b.verified_at is not null
  where s.status = 'active' and s.host_app = any (p_hosts)
$$;

-- Apps a brand is sponsoring right now, for its public page.
create function public.brand_sponsoring(p_brand uuid)
returns table (app_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select host_app from public.sponsorships
  where sponsor_brand = p_brand and status = 'active' and host_app is not null
$$;

-- ===========================================================================
-- 20260930000000_mobile.sql
-- ===========================================================================

-- The mobile app records its "Try it" taps as their own source, so builders
-- can see how many tries come from the app. Must match TRY_SOURCES in
-- src/lib/constants.ts.

alter table public.try_clicks drop constraint try_clicks_source_check;
alter table public.try_clicks add constraint try_clicks_source_check
  check (source in ('feed', 'page', 'card', 'embed', 'sponsor', 'api', 'share', 'app', 'direct'));

-- ===========================================================================
-- 20261001000000_avatars.sql
-- ===========================================================================

-- Method V: profile photos. A photo is a small square JPEG the builder uploads
-- into their own folder in the "drops" bucket (drops/<user id>/avatar-....jpg,
-- which the bucket's policies already allow); avatar_path points at it. Empty
-- means the colored letter avatar.
--
-- Safe to run more than once.

alter table public.profiles add column if not exists avatar_path text;

alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles add constraint profiles_avatar_path_check
  check (avatar_path is null or (char_length(avatar_path) <= 200 and avatar_path ~ '^[0-9a-f-]{36}/avatar-[0-9]+\.jpg$'));

-- Only ever a file in the person's own folder.
alter table public.profiles drop constraint if exists profiles_avatar_own_folder;
alter table public.profiles add constraint profiles_avatar_own_folder
  check (avatar_path is null or split_part(avatar_path, '/', 1) = id::text);

grant update (avatar_path) on public.profiles to authenticated;

-- ===========================================================================
-- 20261002000000_socials.sql
-- ===========================================================================

-- Method V: more social handles on profiles, shown under the builder's name.
-- Handles only (no @); the site builds the links.
--
-- Safe to run more than once.

alter table public.profiles add column if not exists instagram_handle text;
alter table public.profiles add column if not exists tiktok_handle text;
alter table public.profiles add column if not exists youtube_handle text;
alter table public.profiles add column if not exists threads_handle text;

alter table public.profiles drop constraint if exists profiles_instagram_handle_check;
alter table public.profiles add constraint profiles_instagram_handle_check
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');
alter table public.profiles drop constraint if exists profiles_tiktok_handle_check;
alter table public.profiles add constraint profiles_tiktok_handle_check
  check (tiktok_handle is null or tiktok_handle ~ '^[A-Za-z0-9._]{2,24}$');
alter table public.profiles drop constraint if exists profiles_youtube_handle_check;
alter table public.profiles add constraint profiles_youtube_handle_check
  check (youtube_handle is null or youtube_handle ~ '^[A-Za-z0-9._-]{3,30}$');
alter table public.profiles drop constraint if exists profiles_threads_handle_check;
alter table public.profiles add constraint profiles_threads_handle_check
  check (threads_handle is null or threads_handle ~ '^[A-Za-z0-9._]{1,30}$');

grant update (instagram_handle, tiktok_handle, youtube_handle, threads_handle) on public.profiles to authenticated;

-- ===========================================================================
-- 20261003000000_questions_feed.sql
-- ===========================================================================

-- Method V: Q&A for the Questions feed in Drops.
--   * Polls: a question can carry 2-4 choices that people answer with one tap.
--     Totals are public; who picked what is private.
--   * Replies: an answer can reply to another answer on the same question
--     (one level, like a Reddit thread).
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Polls
-- ---------------------------------------------------------------------------

create or replace function public.valid_poll(p_options text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_options is null or (
    cardinality(p_options) between 2 and 4
    and not exists (select 1 from unnest(p_options) o where char_length(btrim(o)) not between 1 and 60)
  )
$$;

alter table public.questions add column if not exists poll_options text[];
alter table public.questions add column if not exists poll_counts integer[];
alter table public.questions drop constraint if exists questions_poll_valid;
alter table public.questions add constraint questions_poll_valid check (public.valid_poll(poll_options));

-- Totals start at zero for each choice.
create or replace function public.init_poll_counts()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.poll_counts := case when new.poll_options is null then null else array_fill(0, array[cardinality(new.poll_options)]) end;
  return new;
end;
$$;
drop trigger if exists questions_init_poll on public.questions;
create trigger questions_init_poll before insert on public.questions
  for each row execute function public.init_poll_counts();

grant insert (poll_options) on public.questions to authenticated;

create table if not exists public.poll_votes (
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  choice smallint not null check (choice between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

alter table public.poll_votes enable row level security;

drop policy if exists "People see their own poll votes" on public.poll_votes;
create policy "People see their own poll votes" on public.poll_votes for select to authenticated
  using ((select auth.uid()) = user_id);

-- Votes only go through vote_poll, which keeps the totals right.
revoke insert, update, delete on public.poll_votes from anon, authenticated;

-- Pick a choice (0-based), change it, or pass null to take it back. Returns
-- the new totals.
create or replace function public.vote_poll(p_question uuid, p_choice integer)
returns integer[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  q public.questions;
  before smallint;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  select * into q from public.questions where id = p_question for update;
  if q.id is null or q.poll_options is null then
    raise exception 'That question doesn''t have a poll.' using errcode = 'P0001';
  end if;
  if p_choice is not null and (p_choice < 0 or p_choice >= cardinality(q.poll_options)) then
    raise exception 'Pick one of the choices.' using errcode = 'P0001';
  end if;

  select choice into before from public.poll_votes where question_id = p_question and user_id = uid;
  if before is not null then
    q.poll_counts[before + 1] := greatest(q.poll_counts[before + 1] - 1, 0);
    delete from public.poll_votes where question_id = p_question and user_id = uid;
  end if;
  if p_choice is not null then
    insert into public.poll_votes (question_id, user_id, choice) values (p_question, uid, p_choice);
    q.poll_counts[p_choice + 1] := q.poll_counts[p_choice + 1] + 1;
  end if;
  update public.questions set poll_counts = q.poll_counts where id = p_question;
  return q.poll_counts;
end;
$$;

revoke execute on function public.vote_poll(uuid, integer) from public;
grant execute on function public.vote_poll(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Replies
-- ---------------------------------------------------------------------------

alter table public.answers add column if not exists parent_id uuid references public.answers (id) on delete cascade;
create index if not exists answers_parent_idx on public.answers (parent_id) where parent_id is not null;

grant insert (parent_id) on public.answers to authenticated;

-- A reply answers an answer on the same question, one level deep.
create or replace function public.check_answer_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent public.answers;
begin
  if new.parent_id is null then
    return new;
  end if;
  select * into parent from public.answers where id = new.parent_id;
  if parent.id is null or parent.question_id <> new.question_id then
    raise exception 'That reply isn''t on this question.' using errcode = 'P0001';
  end if;
  if parent.parent_id is not null then
    new.parent_id := parent.parent_id;
  end if;
  return new;
end;
$$;
drop trigger if exists answers_check_parent on public.answers;
create trigger answers_check_parent before insert on public.answers
  for each row execute function public.check_answer_parent();

-- Replies to an answer notify its author (answers to the question still
-- notify the asker, as before).
create or replace function public.notify_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent_author uuid;
  q public.questions;
begin
  if new.parent_id is null then
    return null;
  end if;
  select user_id into parent_author from public.answers where id = new.parent_id;
  select * into q from public.questions where id = new.question_id;
  if parent_author is distinct from q.user_id then
    perform public.notify(parent_author, 'answer', new.user_id, q.app_id, q.id);
  end if;
  return null;
end;
$$;
drop trigger if exists answers_notify_reply on public.answers;
create trigger answers_notify_reply after insert on public.answers
  for each row execute function public.notify_reply();

-- Best answers are top-level answers, not replies.
create or replace function public.check_best_answer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.best_answer_id is not null and exists (select 1 from public.answers where id = new.best_answer_id and parent_id is not null) then
    raise exception 'Pick an answer, not a reply.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists questions_check_best on public.questions;
create trigger questions_check_best before update of best_answer_id on public.questions
  for each row execute function public.check_best_answer();

-- ---------------------------------------------------------------------------
-- Top builders of the month (on Home, above top testers)
-- ---------------------------------------------------------------------------

-- Ranked by what other people did with their apps this month: tries, plus
-- likes on their Drops counting double. Their own tries and likes don't count.
create or replace function public.top_builders(p_limit integer default 10)
returns table (user_id uuid, username text, display_name text, avatar_path text, tries bigint, likes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select a.owner_id as uid, count(*) as n
    from public.try_clicks c
    join public.apps a on a.id = c.app_id and a.link_checked_at is not null
    where c.created_at >= date_trunc('month', now()) and c.user_id is distinct from a.owner_id
    group by a.owner_id
  ),
  l as (
    select d.owner_id as uid, count(*) as n
    from public.likes lk
    join public.drops d on d.id = lk.drop_id
    where lk.created_at >= date_trunc('month', now()) and lk.user_id <> d.owner_id
    group by d.owner_id
  )
  select p.id, p.username, p.display_name, p.avatar_path, coalesce(t.n, 0), coalesce(l.n, 0)
  from public.profiles p
  left join t on t.uid = p.id
  left join l on l.uid = p.id
  where coalesce(t.n, 0) + coalesce(l.n, 0) > 0
  order by coalesce(t.n, 0) + 2 * coalesce(l.n, 0) desc, p.username
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

revoke execute on function public.top_builders(integer) from public;
grant execute on function public.top_builders(integer) to anon, authenticated;

-- ===========================================================================
-- 20261004000000_qa_fixes.sql
-- ===========================================================================

-- Method V: fixes from a review of Q&A and the leaderboards.
--   * Deleting an answer keeps other people's replies under it (they become
--     answers) instead of deleting them and their reputation.
--   * A reply notifies the person you replied to ("replied to your answer"),
--     not the top answer's author as an "answer".
--   * Poll choices can't be null or nested arrays.
--   * Top builders only counts tries by signed-in people (one per person per
--     app), so nobody can pad it with anonymous tries.
--
-- Safe to run more than once.

-- Replies outlive the answer they replied to.
alter table public.answers drop constraint if exists answers_parent_id_fkey;
alter table public.answers
  add constraint answers_parent_id_fkey foreign key (parent_id) references public.answers (id) on delete set null;

-- A "reply" notification.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'follow', 'like', 'comment', 'feedback', 'helpful',
    'connection_request', 'connection_accepted',
    'question', 'answer', 'best_answer', 'reply',
    'swap_request', 'swap_accepted',
    'backed', 'sponsor_offer', 'sponsor_accepted', 'sponsor_started', 'sponsor_ended',
    'job_application', 'application_shortlisted'
  ));

-- Notify the person being replied to, before the reply is moved under the
-- top-level answer. The asker already hears about every answer, so they're
-- not told twice.
create or replace function public.check_answer_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent public.answers;
  q public.questions;
begin
  if new.parent_id is null then
    return new;
  end if;
  select * into parent from public.answers where id = new.parent_id;
  if parent.id is null or parent.question_id <> new.question_id then
    raise exception 'That reply isn''t on this question.' using errcode = 'P0001';
  end if;
  select * into q from public.questions where id = new.question_id;
  if parent.user_id is distinct from q.user_id then
    perform public.notify(parent.user_id, 'reply', new.user_id, q.app_id, q.id);
  end if;
  if parent.parent_id is not null then
    new.parent_id := parent.parent_id;
  end if;
  return new;
end;
$$;

drop trigger if exists answers_notify_reply on public.answers;
drop function if exists public.notify_reply();

-- One flat list of 2-4 real choices.
create or replace function public.valid_poll(p_options text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_options is null or (
    array_ndims(p_options) = 1
    and cardinality(p_options) between 2 and 4
    and array_position(p_options, null) is null
    and not exists (select 1 from unnest(p_options) o where char_length(btrim(o)) not between 1 and 60)
  )
$$;

-- Signed-in tries only (one per person per app), never the builder's own.
create or replace function public.top_builders(p_limit integer default 10)
returns table (user_id uuid, username text, display_name text, avatar_path text, tries bigint, likes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select a.owner_id as uid, count(*) as n
    from public.try_clicks c
    join public.apps a on a.id = c.app_id and a.link_checked_at is not null
    where c.created_at >= date_trunc('month', now()) and c.user_id is not null and c.user_id <> a.owner_id
    group by a.owner_id
  ),
  l as (
    select d.owner_id as uid, count(*) as n
    from public.likes lk
    join public.drops d on d.id = lk.drop_id
    where lk.created_at >= date_trunc('month', now()) and lk.user_id <> d.owner_id
    group by d.owner_id
  )
  select p.id, p.username, p.display_name, p.avatar_path, coalesce(t.n, 0), coalesce(l.n, 0)
  from public.profiles p
  left join t on t.uid = p.id
  left join l on l.uid = p.id
  where coalesce(t.n, 0) + coalesce(l.n, 0) > 0
  order by coalesce(t.n, 0) + 2 * coalesce(l.n, 0) desc, p.username
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

-- ===========================================================================
-- 20261005000000_push.sql
-- ===========================================================================

-- Method V: optional push notifications (phone app and browser).
--   * notification_settings: which kinds someone wants. All on until they
--     turn one off; nothing is sent until they turn notifications on for a
--     device, which registers it below.
--   * push_tokens (phone app) and web_push_subscriptions (browsers): the
--     devices to send to. Registered through functions, so a device that
--     changes hands moves to the person signed in on it.
--   * push_queue: filled by triggers when someone gets a follower, feedback
--     (tester feedback, a comment on their Drop, a question about their app)
--     or a message (a direct message or a connection request). A Supabase
--     Database Webhook on push_queue inserts calls the website's
--     /api/push/send, which sends it. Nobody can read or write the queue
--     from the app.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  follows boolean not null default true,
  feedback boolean not null default true,
  messages boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

drop policy if exists "People see their own notification settings" on public.notification_settings;
create policy "People see their own notification settings" on public.notification_settings for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "People set their own notification settings" on public.notification_settings;
create policy "People set their own notification settings" on public.notification_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "People change their own notification settings" on public.notification_settings;
create policy "People change their own notification settings" on public.notification_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke insert, update, delete on public.notification_settings from anon, authenticated;
grant select on public.notification_settings to authenticated;
grant insert (user_id, follows, feedback, messages) on public.notification_settings to authenticated;
grant update (follows, feedback, messages) on public.notification_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------

create table if not exists public.push_tokens (
  token text primary key check (char_length(token) between 10 and 300),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

create table if not exists public.web_push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  created_at timestamptz not null default now()
);
create index if not exists web_push_subscriptions_user_idx on public.web_push_subscriptions (user_id);

alter table public.push_tokens enable row level security;
alter table public.web_push_subscriptions enable row level security;

drop policy if exists "People see their own devices" on public.push_tokens;
create policy "People see their own devices" on public.push_tokens for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "People see their own browsers" on public.web_push_subscriptions;
create policy "People see their own browsers" on public.web_push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

-- Only through the functions below.
revoke insert, update, delete on public.push_tokens, public.web_push_subscriptions from anon, authenticated;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, created_at = now();
end;
$$;

-- Forget a device: only your own (when you turn notifications off or sign out).
create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid()
$$;

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
  insert into public.web_push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

create or replace function public.unregister_web_push(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.web_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

revoke execute on function public.register_push_token(text, text) from public;
revoke execute on function public.unregister_push_token(text) from public;
revoke execute on function public.register_web_push(text, text, text) from public;
revoke execute on function public.unregister_web_push(text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.register_web_push(text, text, text) to authenticated;
grant execute on function public.unregister_web_push(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The queue
-- ---------------------------------------------------------------------------

create table if not exists public.push_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('follows', 'feedback', 'messages')),
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 240),
  url text not null check (url ~ '^/' and char_length(url) <= 300),
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists push_queue_unsent_idx on public.push_queue (created_at) where sent_at is null;

-- No policies: only the website's server (secret key) reads it.
alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;

-- Queues a push if they want this kind and have a device turned on.
create or replace function public.queue_push(p_user uuid, p_kind text, p_title text, p_body text, p_url text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wants boolean;
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  select case p_kind when 'follows' then s.follows when 'feedback' then s.feedback else s.messages end
    into wants
    from public.notification_settings s where s.user_id = p_user;
  if wants is false then
    return;
  end if;
  if not exists (select 1 from public.push_tokens where user_id = p_user)
     and not exists (select 1 from public.web_push_subscriptions where user_id = p_user) then
    return;
  end if;
  insert into public.push_queue (user_id, kind, title, body, url, actor_id)
  values (p_user, p_kind, left(p_title, 120), left(p_body, 240), p_url, p_actor);
end;
$$;

revoke execute on function public.queue_push(uuid, text, text, text, text, uuid) from public, anon, authenticated;

-- In-app notifications that also go out as pushes.
create or replace function public.push_from_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uname text;
  who text;
  app_name text;
  app_slug text;
begin
  if new.kind not in ('follow', 'feedback', 'comment', 'question', 'connection_request') then
    return null;
  end if;
  select username into uname from public.profiles where id = new.actor_id;
  who := coalesce('@' || uname, 'Someone');
  select name, slug into app_name, app_slug from public.apps where id = new.app_id;

  if new.kind = 'follow' then
    perform public.queue_push(new.user_id, 'follows', 'New follower', who || ' followed you', coalesce('/u/' || uname, '/'), new.actor_id);
  elsif new.kind = 'feedback' and app_slug is not null then
    perform public.queue_push(new.user_id, 'feedback', 'New feedback on ' || app_name, who || ' tried it and left feedback', '/apps/' || app_slug || '#feedback', new.actor_id);
  elsif new.kind = 'comment' and app_slug is not null then
    perform public.queue_push(new.user_id, 'feedback', 'New comment on ' || app_name, who || ' commented on your Drop', '/apps/' || app_slug || '#comments', new.actor_id);
  elsif new.kind = 'question' and app_slug is not null then
    perform public.queue_push(new.user_id, 'feedback', 'New question about ' || app_name, who || ' asked a question', '/q/' || new.ref_id, new.actor_id);
  elsif new.kind = 'connection_request' then
    perform public.queue_push(new.user_id, 'messages', 'New connection request', who || ' wants to connect', '/inbox', new.actor_id);
  end if;
  return null;
end;
$$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.push_from_notification();

-- Direct messages. A burst from the same person pushes once a minute at most.
create or replace function public.push_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
begin
  select username into who from public.profiles where id = new.sender_id;
  -- Only other message pushes from this conversation count toward the burst
  -- (not, say, the connection request that came just before).
  if exists (
    select 1 from public.push_queue
    where user_id = new.recipient_id and actor_id = new.sender_id and url = coalesce('/inbox/' || who, '/inbox')
      and created_at > now() - interval '1 minute'
  ) then
    return null;
  end if;
  perform public.queue_push(
    new.recipient_id,
    'messages',
    'Message from @' || coalesce(who, 'someone'),
    case when char_length(new.body) > 140 then left(new.body, 137) || '…' else new.body end,
    coalesce('/inbox/' || who, '/inbox'),
    new.sender_id
  );
  return null;
end;
$$;

drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages
  for each row execute function public.push_from_message();
