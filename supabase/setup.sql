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

-- ===========================================================================
-- 20261006000000_reserved_handle.sql
-- ===========================================================================

-- Method V: @methodv is Method V's own account, and the website and app draw
-- its handle with the logo's pixel V. Nobody else may take that name: not by
-- changing their username to it, and not when a new profile is made. The
-- account that already has it keeps it (and can save its profile as usual).
--
-- Safe to run more than once.

create or replace function public.reserve_official_handle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.username = 'methodv' and (tg_op = 'INSERT' or old.username is distinct from new.username) then
    raise exception 'That username is reserved.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_reserved_handle on public.profiles;
create trigger profiles_reserved_handle before insert or update of username on public.profiles
  for each row execute function public.reserve_official_handle();

-- ===========================================================================
-- 20261007000000_spotlight.sql
-- ===========================================================================

-- Method V: the Spotlight and credit packs.
--   * The Spotlight replaces Boost. There are 4 spots in the Featured row;
--     booking one costs 25 credits (15 with Pro) and lasts 3 days. When all 4
--     are taken, the booking waits in line and starts the moment a spot frees
--     up (first come, first served). One booking per builder at a time.
--     apps.boosted_from / boosted_until say when an app is in the Spotlight,
--     so every page can tell with one row.
--   * Credit packs: buy credits with Stripe (25 for $5, 60 for $10, 150 for
--     $20). Credits can't be turned back into money.
--
-- Must match SPOTLIGHT and CREDIT_PACKS in src/lib/constants.ts.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- The Spotlight
-- ---------------------------------------------------------------------------

alter table public.apps add column if not exists boosted_from timestamptz;

create table if not exists public.spotlights (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  cost integer not null check (cost >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists spotlights_ends_idx on public.spotlights (ends_at);
create index if not exists spotlights_user_idx on public.spotlights (user_id, ends_at desc);

alter table public.spotlights enable row level security;
drop policy if exists "The Spotlight is public" on public.spotlights;
create policy "The Spotlight is public" on public.spotlights for select using (true);
-- Only through book_spotlight().
revoke insert, update, delete on public.spotlights from anon, authenticated;

alter table public.credit_events drop constraint if exists credit_events_reason_check;
alter table public.credit_events add constraint credit_events_reason_check
  check (reason in (
    'welcome', 'feedback_reward', 'feedback_helpful', 'testers_requested', 'testers_refunded',
    'streak_bonus', 'boost', 'spotlight', 'credit_pack'
  ));

-- When the next booking would start. Every booking is 3 days and they're
-- handed out in order, so with 4 or more booked, the next one starts when the
-- 4th-latest ends.
create or replace function public.spotlight_next_start()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    now(),
    coalesce((select ends_at from public.spotlights where ends_at > now() order by ends_at desc offset 3 limit 1), now())
  )
$$;

-- Returns when it starts: now, or later if all 4 spots are taken.
create or replace function public.book_spotlight(p_app_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cost integer;
  balance integer;
  start_at timestamptz;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.apps where id = p_app_id and owner_id = uid and link_checked_at is not null
  ) then
    raise exception 'You can only put your own live apps in the Spotlight.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.drops where app_id = p_app_id) then
    raise exception 'Post a Drop for this app first.' using errcode = 'P0001';
  end if;
  -- One booking at a time, so two can't take the same place in line.
  perform pg_advisory_xact_lock(hashtext('method-v-spotlight'));
  if exists (select 1 from public.spotlights where user_id = uid and ends_at > now()) then
    raise exception 'You already have a Spotlight booked. You can book another once it ends.' using errcode = 'P0001';
  end if;
  start_at := public.spotlight_next_start();
  if start_at > now() + interval '28 days' then
    raise exception 'The Spotlight is booked up for the next 4 weeks. Try again soon.' using errcode = 'P0001';
  end if;
  cost := case when public.is_pro(uid) then 15 else 25 end;
  select credits into balance from public.profiles where id = uid for update;
  if balance < cost then
    raise exception 'The Spotlight costs % credits and you have %.', cost, balance using errcode = 'P0001';
  end if;
  insert into public.credit_events (user_id, delta, reason, app_id) values (uid, -cost, 'spotlight', p_app_id);
  insert into public.spotlights (app_id, user_id, cost, starts_at, ends_at)
  values (p_app_id, uid, cost, start_at, start_at + interval '3 days');
  update public.apps set boosted_from = start_at, boosted_until = start_at + interval '3 days' where id = p_app_id;
  return start_at;
end;
$$;

-- Boost is gone: the Spotlight took its place. Boosts already running finish.
create or replace function public.boost_app(p_app_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Boost is now the Spotlight: book it from your app page.' using errcode = 'P0001';
end;
$$;

revoke execute on function public.spotlight_next_start() from public;
revoke execute on function public.book_spotlight(uuid) from public, anon;
grant execute on function public.spotlight_next_start() to anon, authenticated;
grant execute on function public.book_spotlight(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Credit packs
-- ---------------------------------------------------------------------------

create or replace function public.credit_packs()
returns table (credits integer, cents integer)
language sql
immutable
set search_path = ''
as $$
  values (25, 500), (60, 1000), (150, 2000)
$$;

alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('tip', 'sponsorship', 'pro', 'credits'));

create or replace function public.prepare_payment(
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
  elsif p_kind = 'credits' then
    -- p_amount is how many credits: one of the packs.
    select c.cents into amount from public.credit_packs() c where c.credits = p_amount;
    if amount is null then
      raise exception 'Pick a credit pack.' using errcode = 'P0001';
    end if;
    fee := amount;
  else
    raise exception 'Unknown payment.' using errcode = 'P0001';
  end if;

  insert into public.payments (user_id, kind, ref_id, amount_cents, fee_cents, note, is_public)
  values (uid, p_kind, case when p_kind in ('pro', 'credits') then null else p_ref end, amount, fee,
          case when p_kind = 'tip' then btrim(coalesce(p_note, '')) else '' end,
          case when p_kind = 'tip' then coalesce(p_public, true) else true end)
  returning id into new_id;
  return new_id;
end;
$$;


create or replace function public.complete_payment(p_id uuid, p_session text, p_amount integer, p_intent text)
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
  pack integer;
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
  elsif p.kind = 'credits' then
    select c.credits into pack from public.credit_packs() c where c.cents = p.amount_cents;
    if pack is not null then
      insert into public.credit_events (user_id, delta, reason) values (p.user_id, pack, 'credit_pack');
    end if;
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

-- ===========================================================================
-- 20261008000000_sponsor_packages.sql
-- ===========================================================================

-- Method V: sponsorship packages (they replace pay-per-try offers).
--   * Builders choose which packages their app offers and set their own price
--     for each ($10 to $1,000): a Sponsored card on their app page and Drops
--     for 7 days, a shout-out in a Drop, an ad on their website, a video on
--     their socials, or a newsletter mention.
--   * A sponsor (with one of their live apps or verified brands) picks a
--     package, writes a short brief and pays. Method V holds the money.
--   * The builder has 3 days to accept or decline; declined or no answer is a
--     full refund. Then they do it and mark it delivered with a link as proof
--     (the Sponsored card goes up by itself). The sponsor approves, or it's
--     approved by itself 3 days later, and the builder is paid, less Method
--     V's cut: 12%, or 7% for Pro builders. Not delivered within 14 days of
--     accepting is a full refund. The sponsor can report a problem, which
--     pauses it for Method V to sort out (resolve_package_dispute).
--   * Sponsors can have 3 open packages at once, 10 with Pro.
--
-- Must match SPONSOR_PACKAGES in src/lib/constants.ts. Safe to run twice.

-- ---------------------------------------------------------------------------
-- What each app offers
-- ---------------------------------------------------------------------------

create table if not exists public.sponsor_packages (
  app_id uuid not null references public.apps (id) on delete cascade,
  kind text not null check (kind in ('card', 'drop', 'site', 'video', 'newsletter')),
  price_cents integer not null check (price_cents between 1000 and 100000),
  note text not null default '' check (char_length(note) <= 140),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (app_id, kind)
);

alter table public.sponsor_packages enable row level security;
drop policy if exists "Packages on live apps are public" on public.sponsor_packages;
create policy "Packages on live apps are public" on public.sponsor_packages for select
  using (exists (select 1 from public.apps a where a.id = app_id and a.link_checked_at is not null));
-- Only through set_sponsor_package().
revoke insert, update, delete on public.sponsor_packages from anon, authenticated;

create or replace function public.set_sponsor_package(p_app uuid, p_kind text, p_price integer, p_note text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.apps where id = p_app and owner_id = auth.uid() and link_checked_at is not null) then
    raise exception 'You can only set packages on your own live apps.' using errcode = 'P0001';
  end if;
  if p_kind not in ('card', 'drop', 'site', 'video', 'newsletter') then
    raise exception 'Unknown package.' using errcode = 'P0001';
  end if;
  if p_price is null or p_price < 1000 or p_price > 100000 then
    raise exception 'Set a price between $10 and $1,000.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_note, '')) > 140 then
    raise exception 'Keep the note under 140 characters.' using errcode = 'P0001';
  end if;
  insert into public.sponsor_packages (app_id, kind, price_cents, note, active)
  values (p_app, p_kind, p_price, btrim(coalesce(p_note, '')), coalesce(p_active, true))
  on conflict (app_id, kind) do update
    set price_cents = excluded.price_cents, note = excluded.note, active = excluded.active, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Deals
-- ---------------------------------------------------------------------------

-- unpaid -> requested (paid, the builder decides) -> accepted -> delivered
-- -> completed (builder paid). Or declined / expired / cancelled (refunded),
-- or disputed (Method V decides: completed or refunded).
create table if not exists public.package_deals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('card', 'drop', 'site', 'video', 'newsletter')),
  host_app uuid references public.apps (id) on delete set null,
  host_user uuid not null references public.profiles (id) on delete cascade,
  sponsor_user uuid not null references public.profiles (id) on delete cascade,
  sponsor_app uuid references public.apps (id) on delete set null,
  sponsor_brand uuid references public.brands (id) on delete set null,
  price_cents integer not null check (price_cents between 1000 and 100000),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  brief text not null default '' check (char_length(brief) <= 500),
  status text not null default 'unpaid'
    check (status in ('unpaid', 'requested', 'accepted', 'delivered', 'completed', 'declined', 'expired', 'cancelled', 'disputed', 'refunded')),
  proof_url text check (proof_url is null or (proof_url ~ '^https://' and char_length(proof_url) <= 500)),
  problem text not null default '' check (char_length(problem) <= 500),
  payment_id uuid references public.payments (id) on delete set null,
  card_until timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  responded_at timestamptz,
  delivered_at timestamptz,
  finished_at timestamptz
);
create index if not exists package_deals_host_idx on public.package_deals (host_user, created_at desc);
create index if not exists package_deals_sponsor_idx on public.package_deals (sponsor_user, created_at desc);
create index if not exists package_deals_card_idx on public.package_deals (host_app, card_until) where kind = 'card';

alter table public.package_deals enable row level security;
drop policy if exists "Both sides see their package deals" on public.package_deals;
create policy "Both sides see their package deals" on public.package_deals for select to authenticated
  using ((select auth.uid()) in (sponsor_user, host_user));
revoke insert, update, delete on public.package_deals from anon, authenticated;

alter table public.earnings drop constraint if exists earnings_kind_check;
alter table public.earnings add constraint earnings_kind_check
  check (kind in ('tip', 'sponsored_try', 'sponsor_package', 'payout', 'payout_failed'));

alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('tip', 'sponsorship', 'pro', 'credits', 'package'));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'follow', 'like', 'comment', 'feedback', 'helpful',
    'connection_request', 'connection_accepted',
    'question', 'answer', 'best_answer', 'reply',
    'swap_request', 'swap_accepted',
    'backed', 'sponsor_offer', 'sponsor_accepted', 'sponsor_started', 'sponsor_ended',
    'job_application', 'application_shortlisted',
    'package_request', 'package_accepted', 'package_declined', 'package_delivered', 'package_completed',
    'package_refunded', 'package_problem'
  ));

-- A sponsor picks a package. Returns the deal to pay for (prepare_payment 'package').
create or replace function public.request_package(
  p_host_app uuid, p_kind text, p_sponsor_app uuid, p_sponsor_brand uuid, p_brief text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  host public.apps;
  pkg public.sponsor_packages;
  new_id uuid;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  select * into host from public.apps where id = p_host_app and link_checked_at is not null;
  if host.id is null then
    raise exception 'That app can''t be sponsored.' using errcode = 'P0001';
  end if;
  if host.owner_id = uid then
    raise exception 'You can''t sponsor your own app.' using errcode = 'P0001';
  end if;
  select * into pkg from public.sponsor_packages where app_id = p_host_app and kind = p_kind and active;
  if pkg.app_id is null then
    raise exception 'That package isn''t offered right now.' using errcode = 'P0001';
  end if;
  if (p_sponsor_app is null) = (p_sponsor_brand is null) then
    raise exception 'Pick the app or brand you''re promoting.' using errcode = 'P0001';
  end if;
  if p_sponsor_app is not null and not exists (
    select 1 from public.apps where id = p_sponsor_app and owner_id = uid and link_checked_at is not null
  ) then
    raise exception 'Sponsor with one of your own live apps.' using errcode = 'P0001';
  end if;
  if p_sponsor_brand is not null and not exists (
    select 1 from public.brands where id = p_sponsor_brand and owner_id = uid and link_checked_at is not null and verified_at is not null
  ) then
    raise exception 'Sponsor with one of your verified brands.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_brief, '')) > 500 then
    raise exception 'Keep the brief under 500 characters.' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.package_deals
    where sponsor_user = uid and status in ('requested', 'accepted', 'delivered', 'disputed')
  ) >= (case when public.is_pro(uid) then 10 else 3 end) then
    raise exception 'You have as many sponsorships going as you can (3, or 10 with Pro). Finish one first.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.package_deals where sponsor_user = uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'That''s a lot of sponsorships today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  -- An unpaid pick of the same package is replaced, not piled up.
  delete from public.package_deals
    where sponsor_user = uid and host_app = p_host_app and kind = p_kind and status = 'unpaid';

  insert into public.package_deals (kind, host_app, host_user, sponsor_user, sponsor_app, sponsor_brand, price_cents, brief)
  values (p_kind, p_host_app, host.owner_id, uid, p_sponsor_app, p_sponsor_brand, pkg.price_cents, btrim(coalesce(p_brief, '')))
  returning id into new_id;
  return new_id;
end;
$$;

-- Marks a deal's payment for a full refund; returns the payment to refund.
create or replace function public.refund_package(d public.package_deals, p_status text, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.package_deals set status = p_status, finished_at = now() where id = d.id;
  if d.payment_id is not null then
    update public.payments set refund_cents = amount_cents where id = d.payment_id and refunded_at is null;
  end if;
  if p_kind is not null then
    perform public.notify(d.sponsor_user, p_kind, d.host_user, d.host_app, d.id);
  end if;
  return d.payment_id;
end;
$$;

-- Pays the builder, less Method V's cut (12%, or 7% for Pro).
create or replace function public.pay_package(d public.package_deals)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fee integer := round(d.price_cents * (case when public.is_pro(d.host_user) then 0.07 else 0.12 end));
begin
  update public.package_deals set status = 'completed', fee_cents = fee, finished_at = now() where id = d.id;
  if d.payment_id is not null then
    update public.payments set fee_cents = fee where id = d.payment_id;
  end if;
  insert into public.earnings (user_id, delta_cents, kind, app_id, ref_id)
  values (d.host_user, d.price_cents - fee, 'sponsor_package', d.host_app, d.id);
  perform public.notify(d.host_user, 'package_completed', d.sponsor_user, d.host_app, d.id);
end;
$$;

-- The builder says yes or no. Returns a payment to refund (declined) or null.
create or replace function public.respond_package(p_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.package_deals;
begin
  select * into d from public.package_deals where id = p_id and host_user = auth.uid() and status = 'requested' for update;
  if d.id is null then
    raise exception 'That request isn''t waiting for you.' using errcode = 'P0001';
  end if;
  if d.paid_at < now() - interval '3 days' then
    -- settle_package_deals() refunds it.
    raise exception 'That request expired after 3 days, so the sponsor gets their money back.' using errcode = 'P0001';
  end if;
  if not p_accept then
    return public.refund_package(d, 'declined', 'package_declined');
  end if;
  if d.kind = 'card' then
    if exists (
      select 1 from public.package_deals
      where host_app = d.host_app and kind = 'card' and card_until > now() and status in ('delivered', 'completed', 'disputed')
    ) or exists (select 1 from public.sponsorships where host_app = d.host_app and status = 'active') then
      raise exception 'Your app already shows a sponsor card. Accept this once it ends.' using errcode = 'P0001';
    end if;
    -- The card is the delivery: it goes up now for 7 days.
    update public.package_deals
      set status = 'delivered', responded_at = now(), delivered_at = now(), card_until = now() + interval '7 days'
      where id = d.id;
  else
    update public.package_deals set status = 'accepted', responded_at = now() where id = d.id;
  end if;
  perform public.notify(d.sponsor_user, 'package_accepted', d.host_user, d.host_app, d.id);
  return null;
end;
$$;

-- The builder did it: a link to the post, page or Drop.
create or replace function public.deliver_package(p_id uuid, p_proof text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.package_deals;
begin
  select * into d from public.package_deals where id = p_id and host_user = auth.uid() and status = 'accepted' for update;
  if d.id is null then
    raise exception 'That sponsorship isn''t waiting to be delivered.' using errcode = 'P0001';
  end if;
  if p_proof is null or p_proof !~ '^https://' or char_length(p_proof) > 500 then
    raise exception 'Add the https:// link to where it''s live.' using errcode = 'P0001';
  end if;
  update public.package_deals set status = 'delivered', delivered_at = now(), proof_url = p_proof where id = d.id;
  perform public.notify(d.sponsor_user, 'package_delivered', d.host_user, d.host_app, d.id);
end;
$$;

-- The sponsor is happy: pay the builder now.
create or replace function public.approve_package(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.package_deals;
begin
  select * into d from public.package_deals where id = p_id and sponsor_user = auth.uid() and status = 'delivered' for update;
  if d.id is null then
    raise exception 'That sponsorship isn''t waiting for your approval.' using errcode = 'P0001';
  end if;
  perform public.pay_package(d);
end;
$$;

-- The sponsor cancels: free before paying, a full refund before the builder accepts.
create or replace function public.cancel_package(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.package_deals;
begin
  select * into d from public.package_deals where id = p_id and sponsor_user = auth.uid() and status in ('unpaid', 'requested') for update;
  if d.id is null then
    raise exception 'Once the builder accepts, it can''t be cancelled. Report a problem instead.' using errcode = 'P0001';
  end if;
  if d.status = 'unpaid' then
    update public.package_deals set status = 'cancelled', finished_at = now() where id = d.id;
    return null;
  end if;
  return public.refund_package(d, 'cancelled', null);
end;
$$;

-- The sponsor reports a problem: nobody is paid until Method V decides.
create or replace function public.report_package(p_id uuid, p_problem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.package_deals;
begin
  select * into d from public.package_deals where id = p_id and sponsor_user = auth.uid() and status in ('accepted', 'delivered') for update;
  if d.id is null then
    raise exception 'You can report a problem while it''s being done or before you approve it.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_problem, ''))) < 5 or char_length(p_problem) > 500 then
    raise exception 'Say what went wrong (up to 500 characters).' using errcode = 'P0001';
  end if;
  update public.package_deals set status = 'disputed', problem = btrim(p_problem) where id = d.id;
  perform public.notify(d.host_user, 'package_problem', d.sponsor_user, d.host_app, d.id);
end;
$$;

-- For Method V (SQL Editor): settle a reported problem. p_refund true gives
-- the sponsor their money back; false pays the builder.
create or replace function public.resolve_package_dispute(p_id uuid, p_refund boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.package_deals;
begin
  select * into d from public.package_deals where id = p_id and status = 'disputed' for update;
  if d.id is null then
    raise exception 'That sponsorship isn''t disputed.' using errcode = 'P0001';
  end if;
  if p_refund then
    perform public.refund_package(d, 'refunded', 'package_refunded');
  else
    perform public.pay_package(d);
  end if;
end;
$$;

-- Time-based steps: unanswered requests expire (refund), accepted but never
-- delivered after 14 days (refund), delivered and not approved after 3 days
-- (paid), Sponsored cards that finished their 7 days (paid). Safe to run any
-- time; the site runs it when people open Earn.
create or replace function public.settle_package_deals()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.package_deals;
begin
  for d in
    select * from public.package_deals where status = 'requested' and paid_at < now() - interval '3 days' for update skip locked
  loop
    perform public.refund_package(d, 'expired', 'package_refunded');
  end loop;
  for d in
    select * from public.package_deals where status = 'accepted' and responded_at < now() - interval '14 days' for update skip locked
  loop
    perform public.refund_package(d, 'expired', 'package_refunded');
  end loop;
  for d in
    select * from public.package_deals
    where status = 'delivered'
      and ((kind = 'card' and card_until < now()) or (kind <> 'card' and delivered_at < now() - interval '3 days'))
    for update skip locked
  loop
    perform public.pay_package(d);
  end loop;
end;
$$;

-- Sponsored cards now also come from card packages.
create or replace function public.active_sponsors(p_hosts uuid[])
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
  union all
  select d.id, d.host_app, 'app', a.id, a.slug, a.name, a.tagline
  from public.package_deals d
  join public.apps a on a.id = d.sponsor_app and a.link_checked_at is not null
  where d.kind = 'card' and d.status in ('delivered', 'completed') and d.card_until > now() and d.host_app = any (p_hosts)
  union all
  select d.id, d.host_app, 'brand', b.id, b.slug, b.name, b.tagline
  from public.package_deals d
  join public.brands b on b.id = d.sponsor_brand and b.link_checked_at is not null and b.verified_at is not null
  where d.kind = 'card' and d.status in ('delivered', 'completed') and d.card_until > now() and d.host_app = any (p_hosts)
$$;

-- Pay-per-try offers are replaced by packages. Deals already running finish.
create or replace function public.offer_sponsorship(
  p_sponsor_app uuid, p_host_app uuid, p_price integer, p_budget integer, p_message text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Sponsorships are packages now: pick one on the app''s page.' using errcode = 'P0001';
end;
$$;

create or replace function public.offer_brand_sponsorship(
  p_brand uuid, p_host_app uuid, p_price integer, p_budget integer, p_message text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Sponsorships are packages now: pick one on the app''s page.' using errcode = 'P0001';
end;
$$;

revoke execute on function public.refund_package(public.package_deals, text, text) from public, anon, authenticated;
revoke execute on function public.pay_package(public.package_deals) from public, anon, authenticated;
revoke execute on function public.resolve_package_dispute(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.set_sponsor_package(uuid, text, integer, text, boolean) from public, anon;
revoke execute on function public.request_package(uuid, text, uuid, uuid, text) from public, anon;
revoke execute on function public.respond_package(uuid, boolean) from public, anon;
revoke execute on function public.deliver_package(uuid, text) from public, anon;
revoke execute on function public.approve_package(uuid) from public, anon;
revoke execute on function public.cancel_package(uuid) from public, anon;
revoke execute on function public.report_package(uuid, text) from public, anon;
revoke execute on function public.settle_package_deals() from public, anon;
grant execute on function public.set_sponsor_package(uuid, text, integer, text, boolean) to authenticated;
grant execute on function public.request_package(uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.respond_package(uuid, boolean) to authenticated;
grant execute on function public.deliver_package(uuid, text) to authenticated;
grant execute on function public.approve_package(uuid) to authenticated;
grant execute on function public.cancel_package(uuid) to authenticated;
grant execute on function public.report_package(uuid, text) to authenticated;
grant execute on function public.settle_package_deals() to authenticated;

-- ---------------------------------------------------------------------------
-- Payments: packages are paid through the same checkout
-- ---------------------------------------------------------------------------

create or replace function public.prepare_payment(
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
  d public.package_deals;
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
  elsif p_kind = 'package' then
    select * into d from public.package_deals where id = p_ref and sponsor_user = uid and status = 'unpaid';
    if d.id is null then
      raise exception 'That sponsorship isn''t waiting for payment.' using errcode = 'P0001';
    end if;
    amount := d.price_cents;
  elsif p_kind = 'credits' then
    -- p_amount is how many credits: one of the packs.
    select c.cents into amount from public.credit_packs() c where c.credits = p_amount;
    if amount is null then
      raise exception 'Pick a credit pack.' using errcode = 'P0001';
    end if;
    fee := amount;
  else
    raise exception 'Unknown payment.' using errcode = 'P0001';
  end if;

  insert into public.payments (user_id, kind, ref_id, amount_cents, fee_cents, note, is_public)
  values (uid, p_kind, case when p_kind in ('pro', 'credits') then null else p_ref end, amount, fee,
          case when p_kind = 'tip' then btrim(coalesce(p_note, '')) else '' end,
          case when p_kind = 'tip' then coalesce(p_public, true) else true end)
  returning id into new_id;
  return new_id;
end;
$$;


create or replace function public.complete_payment(p_id uuid, p_session text, p_amount integer, p_intent text)
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
  pack integer;
  d public.package_deals;
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
  elsif p.kind = 'package' then
    update public.package_deals set status = 'requested', paid_at = now(), payment_id = p.id
      where id = p.ref_id and status = 'unpaid'
      returning * into d;
    if d.id is not null then
      perform public.notify(d.host_user, 'package_request', d.sponsor_user, d.host_app, d.id);
    else
      -- Cancelled before the money arrived: give it all back.
      update public.payments set refund_cents = p.amount_cents where id = p.id;
    end if;
  elsif p.kind = 'credits' then
    select c.credits into pack from public.credit_packs() c where c.cents = p.amount_cents;
    if pack is not null then
      insert into public.credit_events (user_id, delta, reason) values (p.user_id, pack, 'credit_pack');
    end if;
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

-- ===========================================================================
-- 20261009000000_review_fixes.sql
-- ===========================================================================

-- Method V: fixes from a code review.
--   * Sponsors can have 3 open packages at once (10 with Pro). Unpaid picks
--     don't count when picking, so the limit is checked again before each
--     package checkout, and once more when the payment lands: a payment that
--     would go past it (several checkouts paid at once) is cancelled and
--     refunded in full.
--   * The Spotlight counts Boosts bought before it existed that are still
--     running, and won't overwrite one on the same app.
--   * @methodv stays reserved for everyone signing in, but Method V can still
--     give it out from the SQL Editor (for a fresh setup).
--
-- Must match PACKAGE_RULES.open / proOpen in src/lib/constants.ts.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- The open-package limit, at checkout and when the payment lands
-- ---------------------------------------------------------------------------

create or replace function public.prepare_payment(
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
  d public.package_deals;
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
  elsif p_kind = 'package' then
    select * into d from public.package_deals where id = p_ref and sponsor_user = uid and status = 'unpaid';
    if d.id is null then
      raise exception 'That sponsorship isn''t waiting for payment.' using errcode = 'P0001';
    end if;
    -- request_package() only counts paid deals, so check again here: picking
    -- several packages and then paying for them all can't get past the limit.
    if (
      select count(*) from public.package_deals
      where sponsor_user = uid and status in ('requested', 'accepted', 'delivered', 'disputed')
    ) >= (case when public.is_pro(uid) then 10 else 3 end) then
      raise exception 'You have as many sponsorships going as you can (3, or 10 with Pro). Finish one first.' using errcode = 'P0001';
    end if;
    amount := d.price_cents;
  elsif p_kind = 'credits' then
    -- p_amount is how many credits: one of the packs.
    select c.cents into amount from public.credit_packs() c where c.credits = p_amount;
    if amount is null then
      raise exception 'Pick a credit pack.' using errcode = 'P0001';
    end if;
    fee := amount;
  else
    raise exception 'Unknown payment.' using errcode = 'P0001';
  end if;

  insert into public.payments (user_id, kind, ref_id, amount_cents, fee_cents, note, is_public)
  values (uid, p_kind, case when p_kind in ('pro', 'credits') then null else p_ref end, amount, fee,
          case when p_kind = 'tip' then btrim(coalesce(p_note, '')) else '' end,
          case when p_kind = 'tip' then coalesce(p_public, true) else true end)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.complete_payment(p_id uuid, p_session text, p_amount integer, p_intent text)
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
  pack integer;
  d public.package_deals;
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
  elsif p.kind = 'package' then
    select * into d from public.package_deals where id = p.ref_id and status = 'unpaid' for update;
    if d.id is not null and (
      select count(*) from public.package_deals
      where sponsor_user = d.sponsor_user and id <> d.id and status in ('requested', 'accepted', 'delivered', 'disputed')
    ) >= (case when public.is_pro(d.sponsor_user) then 10 else 3 end) then
      -- Several checkouts were opened and paid at once, past the limit: this
      -- one is cancelled and refunded in full.
      update public.package_deals set status = 'cancelled', payment_id = p.id, finished_at = now() where id = d.id;
      update public.payments set refund_cents = p.amount_cents where id = p.id;
    elsif d.id is not null then
      update public.package_deals set status = 'requested', paid_at = now(), payment_id = p.id where id = d.id;
      perform public.notify(d.host_user, 'package_request', d.sponsor_user, d.host_app, d.id);
    else
      -- Cancelled before the money arrived: give it all back.
      update public.payments set refund_cents = p.amount_cents where id = p.id;
    end if;
  elsif p.kind = 'credits' then
    select c.credits into pack from public.credit_packs() c where c.cents = p.amount_cents;
    if pack is not null then
      insert into public.credit_events (user_id, delta, reason) values (p.user_id, pack, 'credit_pack');
    end if;
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


-- ---------------------------------------------------------------------------
-- The Spotlight and Boosts still running
-- ---------------------------------------------------------------------------

create or replace function public.spotlight_next_start()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  -- Every booking and old Boost still on the row takes a spot; the next
  -- booking starts when the 4th-latest of them ends.
  select greatest(
    now(),
    coalesce(
      (
        select e from (
          select ends_at as e from public.spotlights where ends_at > now()
          union all
          select boosted_until from public.apps where boosted_from is null and boosted_until > now()
        ) taken
        order by e desc offset 3 limit 1
      ),
      now()
    )
  )
$$;

create or replace function public.book_spotlight(p_app_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cost integer;
  balance integer;
  start_at timestamptz;
  boost_ends timestamptz;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.apps where id = p_app_id and owner_id = uid and link_checked_at is not null
  ) then
    raise exception 'You can only put your own live apps in the Spotlight.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.drops where app_id = p_app_id) then
    raise exception 'Post a Drop for this app first.' using errcode = 'P0001';
  end if;
  -- A Boost bought before the Spotlight existed keeps running to its end.
  select boosted_until into boost_ends from public.apps where id = p_app_id and boosted_from is null and boosted_until > now();
  if boost_ends is not null then
    raise exception 'This app is boosted until %. Book the Spotlight once that ends.', to_char(boost_ends, 'Mon DD') using errcode = 'P0001';
  end if;
  -- One booking at a time, so two can't take the same place in line.
  perform pg_advisory_xact_lock(hashtext('method-v-spotlight'));
  if exists (select 1 from public.spotlights where user_id = uid and ends_at > now()) then
    raise exception 'You already have a Spotlight booked. You can book another once it ends.' using errcode = 'P0001';
  end if;
  start_at := public.spotlight_next_start();
  if start_at > now() + interval '28 days' then
    raise exception 'The Spotlight is booked up for the next 4 weeks. Try again soon.' using errcode = 'P0001';
  end if;
  cost := case when public.is_pro(uid) then 15 else 25 end;
  select credits into balance from public.profiles where id = uid for update;
  if balance < cost then
    raise exception 'The Spotlight costs % credits and you have %.', cost, balance using errcode = 'P0001';
  end if;
  insert into public.credit_events (user_id, delta, reason, app_id) values (uid, -cost, 'spotlight', p_app_id);
  insert into public.spotlights (app_id, user_id, cost, starts_at, ends_at)
  values (p_app_id, uid, cost, start_at, start_at + interval '3 days');
  update public.apps set boosted_from = start_at, boosted_until = start_at + interval '3 days' where id = p_app_id;
  return start_at;
end;
$$;


-- ---------------------------------------------------------------------------
-- @methodv
-- ---------------------------------------------------------------------------

create or replace function public.reserve_official_handle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The SQL Editor (and the server's secret key) can still give it out.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if new.username = 'methodv' and (tg_op = 'INSERT' or old.username is distinct from new.username) then
    raise exception 'That username is reserved.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 20261010000000_cover_photos.sql
-- ===========================================================================

-- Method V: profile header pictures. A wide JPEG (3:1) the person uploads into
-- their own folder in the "drops" bucket (drops/<user id>/cover-....jpg, which
-- the bucket's policies already allow); cover_path points at it. It shows
-- behind their photo at the top of their profile page only. Empty means none.
--
-- Safe to run more than once.

alter table public.profiles add column if not exists cover_path text;

alter table public.profiles drop constraint if exists profiles_cover_path_check;
alter table public.profiles add constraint profiles_cover_path_check
  check (cover_path is null or (char_length(cover_path) <= 200 and cover_path ~ '^[0-9a-f-]{36}/cover-[0-9]+\.jpg$'));

-- Only ever a file in the person's own folder.
alter table public.profiles drop constraint if exists profiles_cover_own_folder;
alter table public.profiles add constraint profiles_cover_own_folder
  check (cover_path is null or split_part(cover_path, '/', 1) = id::text);

grant update (cover_path) on public.profiles to authenticated;

-- ===========================================================================
-- 20261011000000_security_hardening.sql
-- ===========================================================================

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

-- ===========================================================================
-- 20261012000000_app_covers.sql
-- ===========================================================================

-- Method V: app cover images. A builder can pick the picture their app shows
-- on Browse, Featured and every app card, instead of the frame taken from
-- their Drop. A wide JPEG (16:9) in their own folder of the "drops" bucket
-- (drops/<user id>/appcover-....jpg, which the bucket's policies already
-- allow); cover_path points at it. Empty means the Drop's frame, as before.
--
-- Safe to run more than once.

alter table public.apps add column if not exists cover_path text;

alter table public.apps drop constraint if exists apps_cover_path_check;
alter table public.apps add constraint apps_cover_path_check
  check (cover_path is null or (char_length(cover_path) <= 200 and cover_path ~ '^[0-9a-f-]{36}/appcover-[0-9]+\.jpg$'));

-- Only ever a file in the builder's own folder.
alter table public.apps drop constraint if exists apps_cover_own_folder;
alter table public.apps add constraint apps_cover_own_folder
  check (cover_path is null or split_part(cover_path, '/', 1) = owner_id::text);

grant insert (cover_path), update (cover_path) on public.apps to authenticated;

-- ===========================================================================
-- 20261013000000_feedback_screenshots.sql
-- ===========================================================================

-- Method V: screenshots on feedback. Testers can add up to 3 screenshots to
-- "What worked?" and up to 3 to "What confused you?". Feedback is private
-- between the tester and the builder, so the pictures live in their own
-- private "feedback" bucket (not the public "drops" one): only the tester who
-- uploaded them and the builder of the app they're about can open them, and
-- only through short-lived signed links.
--
-- Files: feedback/<tester id>/fb-<time>-<random>.jpg
--
-- Safe to run more than once.

-- Up to 3 of the tester's own files, each a JPEG in their folder.
create or replace function public.feedback_shots_ok(tester uuid, shots text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(shots), 0) <= 3
    and coalesce(bool_and(
      char_length(s) <= 120
      and s ~ '^[0-9a-f-]{36}/fb-[0-9]+-[a-z0-9]+\.jpg$'
      and split_part(s, '/', 1) = tester::text
    ), true)
  from unnest(shots) as s
$$;

alter table public.feedback add column if not exists worked_shots text[] not null default '{}';
alter table public.feedback add column if not exists confusing_shots text[] not null default '{}';

alter table public.feedback drop constraint if exists feedback_worked_shots_check;
alter table public.feedback add constraint feedback_worked_shots_check check (public.feedback_shots_ok(user_id, worked_shots));
alter table public.feedback drop constraint if exists feedback_confusing_shots_check;
alter table public.feedback add constraint feedback_confusing_shots_check check (public.feedback_shots_ok(user_id, confusing_shots));

grant insert (worked_shots, confusing_shots) on public.feedback to authenticated;

-- A private bucket: JPEGs only (the site shrinks every screenshot to one),
-- 3 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Testers upload feedback screenshots into their own folder" on storage.objects;
create policy "Testers upload feedback screenshots into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'feedback'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The tester sees their own; the builder sees the ones attached to feedback
-- on their apps. Nobody else, and there are no public links.
drop policy if exists "Testers and builders see feedback screenshots" on storage.objects;
create policy "Testers and builders see feedback screenshots"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'feedback'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.feedback f
        join public.apps a on a.id = f.app_id
        where a.owner_id = (select auth.uid())
          and (objects.name = any (f.worked_shots) or objects.name = any (f.confusing_shots))
      )
    )
  );

-- So a tester can clean up screenshots from feedback that didn't send.
drop policy if exists "Testers delete their own feedback screenshots" on storage.objects;
create policy "Testers delete their own feedback screenshots"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'feedback'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ===========================================================================
-- 20261014000000_feedback_replies.sql
-- ===========================================================================

-- Method V: builders reply to feedback. The builder of an app can write one
-- reply on each piece of feedback about it (and change or clear it later).
-- Like the feedback itself, only the tester and the builder can see it. The
-- tester gets a notification (and a push, if they have feedback pushes on).
--
-- Safe to run more than once.

alter table public.feedback add column if not exists reply text not null default '';
alter table public.feedback add column if not exists replied_at timestamptz;

alter table public.feedback drop constraint if exists feedback_reply_check;
alter table public.feedback add constraint feedback_reply_check check (char_length(reply) <= 1000);

-- A new kind of notification: "@builder replied to your feedback on App".
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'follow', 'like', 'comment', 'feedback', 'helpful', 'feedback_reply',
    'connection_request', 'connection_accepted',
    'question', 'answer', 'best_answer', 'reply',
    'swap_request', 'swap_accepted',
    'backed', 'sponsor_offer', 'sponsor_accepted', 'sponsor_started', 'sponsor_ended',
    'job_application', 'application_shortlisted',
    'package_request', 'package_accepted', 'package_declined', 'package_delivered', 'package_completed',
    'package_refunded', 'package_problem'
  ));

-- The only way to write a reply: the app's builder, on feedback about it.
-- An empty reply removes it.
create or replace function public.reply_to_feedback(p_feedback_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  body text := btrim(coalesce(p_body, ''));
  f public.feedback;
begin
  if uid is null then
    raise exception 'Sign in to reply.' using errcode = 'P0001';
  end if;
  if char_length(body) > 1000 then
    raise exception 'Keep your reply under 1,000 characters.' using errcode = 'P0001';
  end if;
  select fb.* into f
  from public.feedback fb
  join public.apps a on a.id = fb.app_id
  where fb.id = p_feedback_id and a.owner_id = uid;
  if not found then
    raise exception 'You can only reply to feedback on your own apps.' using errcode = 'P0001';
  end if;

  update public.feedback
  set reply = body, replied_at = case when body = '' then null else now() end
  where id = f.id;

  -- Tell the tester about a new reply (not about edits or removals).
  if body <> '' and f.reply = '' then
    perform public.notify(f.user_id, 'feedback_reply', uid, f.app_id, f.id);
  end if;
end;
$$;

revoke execute on function public.reply_to_feedback(uuid, text) from public, anon;
grant execute on function public.reply_to_feedback(uuid, text) to authenticated;

-- Pushes: the same as before, plus replies to your feedback (under the
-- "feedback" switch).
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
  if new.kind not in ('follow', 'feedback', 'comment', 'question', 'connection_request', 'feedback_reply') then
    return null;
  end if;
  select username into uname from public.profiles where id = new.actor_id;
  who := coalesce('@' || uname, 'Someone');
  select name, slug into app_name, app_slug from public.apps where id = new.app_id;

  if new.kind = 'follow' then
    perform public.queue_push(new.user_id, 'follows', 'New follower', who || ' followed you', coalesce('/u/' || uname, '/'), new.actor_id);
  elsif new.kind = 'feedback' and app_slug is not null then
    perform public.queue_push(new.user_id, 'feedback', 'New feedback on ' || app_name, who || ' tried it and left feedback', '/apps/' || app_slug || '#feedback', new.actor_id);
  elsif new.kind = 'feedback_reply' and app_slug is not null then
    perform public.queue_push(new.user_id, 'feedback', 'Reply to your feedback', who || ' replied to your feedback on ' || app_name, '/apps/' || app_slug || '#feedback', new.actor_id);
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

-- ===========================================================================
-- 20261015000000_tester_guarantee.sql
-- ===========================================================================

-- Method V: testers are guaranteed or your credits come back.
--
-- When a builder asks for testers, the credits are held as spots. A spot is
-- only used up by real feedback:
--   * the tester opened the app with Try it at least a minute before sending
--     feedback, and
--   * "What worked?" is a real answer (at least 40 characters, a couple of
--     sentences), not a one-liner.
-- Feedback that misses either still reaches the builder, but doesn't use a
-- spot or earn the tester credits.
--
-- Spots nobody fills within 7 days of the last time the builder added
-- testers go back to the builder automatically (expire_test_requests(),
-- which the site runs whenever the queue, an app's feedback or someone's
-- credits are looked at). Stop and refund still works any time.
--
-- Mirrors CREDITS / TESTER_GUARANTEE in src/lib/constants.ts.
--
-- Safe to run more than once.

alter table public.test_requests add column if not exists expires_at timestamptz;
update public.test_requests set expires_at = now() + interval '7 days'
  where expires_at is null and slots_filled < slots_total;

create index if not exists test_requests_expires_idx on public.test_requests (expires_at)
  where slots_filled < slots_total;

-- Gives back every spot that's been waiting too long. Safe to call from
-- anywhere, any number of times: it only ever refunds expired spots, once.
create or replace function public.expire_test_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  refunded integer := 0;
  r record;
begin
  for r in
    select app_id, owner_id, slots_total - slots_filled as remaining
    from public.test_requests
    where expires_at < now() and slots_filled < slots_total
    for update skip locked
  loop
    update public.test_requests set slots_total = slots_filled where app_id = r.app_id;
    insert into public.credit_events (user_id, delta, reason, app_id)
    values (r.owner_id, r.remaining * 2, 'testers_refunded', r.app_id);
    refunded := refunded + 1;
  end loop;
  return refunded;
end;
$$;

revoke execute on function public.expire_test_requests() from public;
grant execute on function public.expire_test_requests() to anon, authenticated;

-- Asking for testers: as before, and every request (or top-up) gets 7 days.
create or replace function public.request_testers(p_app_id uuid, p_testers integer)
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

  -- Settle anything already expired first, so old spots refund before new ones are added.
  perform public.expire_test_requests();

  cost := p_testers * 2;
  select credits into balance from public.profiles where id = uid for update;
  if balance < cost then
    raise exception 'That costs % credits and you have %.', cost, balance using errcode = 'P0001';
  end if;

  insert into public.credit_events (user_id, delta, reason, app_id)
  values (uid, -cost, 'testers_requested', p_app_id);

  insert into public.test_requests (app_id, owner_id, slots_total, expires_at)
  values (p_app_id, uid, p_testers, now() + interval '7 days')
  on conflict (app_id) do update
    set slots_total = public.test_requests.slots_total + excluded.slots_total,
        expires_at = now() + interval '7 days',
        -- Re-opening a finished request puts the app back at the end of the queue.
        opened_at = case
          when public.test_requests.slots_filled >= public.test_requests.slots_total then now()
          else public.test_requests.opened_at
        end;
end;
$$;

-- Paid feedback: as before (ranks, daily caps), plus the two checks above.
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

  -- A real try (at least a minute with the app) and a real answer.
  if char_length(btrim(new.worked)) < 40 or not exists (
    select 1 from public.try_clicks
    where app_id = new.app_id and user_id = new.user_id and created_at <= now() - interval '1 minute'
  ) then
    return new;
  end if;

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
      where app_id = new.app_id and slots_filled < slots_total and (expires_at is null or expires_at > now());
    if found then
      new.earned := reward;
    end if;
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 20261016000000_drop_bonus.sql
-- ===========================================================================

-- Method V: promotions. The first one: post a Drop, get 10 V Coin.
--
-- public.promotions holds each promotion's amount and dates. Everyone can
-- read it (the site shows the banner from it); only the Method V team edits
-- it, in the Supabase table editor: change ends_at to end or extend one.
--
-- "drop_bonus": when someone posts a Drop while it's running, a database
-- trigger adds the bonus to their V Coin:
--   * once per app (a second Drop on the same app doesn't earn it again,
--     and deleting a Drop and posting it again doesn't either), and
--   * up to `per_day` bonuses per person per 24 hours, so it can't be farmed.
--
-- Safe to run more than once.

create table if not exists public.promotions (
  slug text primary key,
  amount integer not null check (amount between 1 and 100),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  per_day integer not null default 3 check (per_day between 1 and 20)
);

alter table public.promotions enable row level security;
drop policy if exists "Promotions are public" on public.promotions;
create policy "Promotions are public" on public.promotions for select using (true);
revoke insert, update, delete, truncate on public.promotions from anon, authenticated;
grant select on public.promotions to anon, authenticated;

-- Runs until the end of October 2026 (US Pacific time). Edit ends_at to change it.
insert into public.promotions (slug, amount, starts_at, ends_at, per_day)
values ('drop_bonus', 10, now(), '2026-10-31 23:59:59-07', 3)
on conflict (slug) do nothing;

alter table public.credit_events drop constraint if exists credit_events_reason_check;
alter table public.credit_events add constraint credit_events_reason_check
  check (reason in (
    'welcome', 'feedback_reward', 'feedback_helpful', 'testers_requested', 'testers_refunded',
    'streak_bonus', 'boost', 'spotlight', 'credit_pack', 'drop_bonus'
  ));

create or replace function public.grant_drop_bonus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.promotions;
  today integer;
begin
  select * into p from public.promotions
  where slug = 'drop_bonus' and now() >= starts_at and now() < ends_at;
  if not found then
    return null;
  end if;
  -- Once per app.
  if exists (select 1 from public.credit_events where reason = 'drop_bonus' and app_id = new.app_id) then
    return null;
  end if;
  select count(*) into today from public.credit_events
  where user_id = new.owner_id and reason = 'drop_bonus' and created_at > now() - interval '24 hours';
  if today >= p.per_day then
    return null;
  end if;
  insert into public.credit_events (user_id, delta, reason, app_id)
  values (new.owner_id, p.amount, 'drop_bonus', new.app_id);
  return null;
end;
$$;

revoke execute on function public.grant_drop_bonus() from public, anon, authenticated;

drop trigger if exists drops_bonus on public.drops;
create trigger drops_bonus after insert on public.drops
  for each row execute function public.grant_drop_bonus();

-- ===========================================================================
-- 20261017000000_spotlight_fill.sql
-- ===========================================================================

-- Method V: Today's picks on the Spotlight stage. While this promotion runs,
-- Spotlight spots nobody paid for are filled with different unpaid apps each
-- day (see src/lib/spotlight-stage.ts). Paid Spotlights always come first.
--
-- To stop it: in the Supabase table editor, set ends_at on the
-- "spotlight_fill" row of public.promotions to a time in the past (or delete
-- the row). To start it again, set ends_at in the future. amount and per_day
-- aren't used for this one.
--
-- Needs 20261016000000_drop_bonus.sql (it creates public.promotions).
-- Safe to run more than once.

insert into public.promotions (slug, amount, starts_at, ends_at, per_day)
values ('spotlight_fill', 1, now(), '2100-01-01 00:00:00+00', 1)
on conflict (slug) do nothing;

-- ===========================================================================
-- 20261018000000_leaderboard_prizes.sql
-- ===========================================================================

-- Method V: monthly leaderboard prizes.
--
-- Both leaderboards (top builders and top testers) start fresh each month.
-- When a month ends, the top 3 on each board win V Coin: 25 for 1st, 15 for
-- 2nd, 10 for 3rd (mirrors LEADERBOARD_PRIZES in src/lib/constants.ts).
--
-- settle_leaderboards() pays last month's prizes. The site runs it whenever
-- a leaderboard is looked at, so the first visit of a new month pays out.
-- It's safe to call from anywhere, any number of times: each prize is a row
-- in public.leaderboard_prizes (one per month, board and place), so it's
-- only ever paid once.
--
-- Months are calendar months in UTC, the same as the leaderboards.
--
-- Needs 20261016000000_drop_bonus.sql (the V Coin reasons list).
-- Safe to run more than once.

-- The rankings for any window of time, so the live boards and the prizes use
-- exactly the same rules.
create or replace function public.leaderboard_builders(p_from timestamptz, p_to timestamptz, p_limit integer default 10)
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
    where c.created_at >= p_from and c.created_at < p_to and c.user_id is not null and c.user_id <> a.owner_id
    group by a.owner_id
  ),
  l as (
    select d.owner_id as uid, count(*) as n
    from public.likes lk
    join public.drops d on d.id = lk.drop_id
    where lk.created_at >= p_from and lk.created_at < p_to and lk.user_id <> d.owner_id
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

create or replace function public.leaderboard_testers(p_from timestamptz, p_to timestamptz, p_limit integer default 10)
returns table (user_id uuid, username text, display_name text, feedback_count bigint, helpful_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, count(*), count(f.helpful_at)
  from public.feedback f
  join public.profiles p on p.id = f.user_id
  where f.created_at >= p_from and f.created_at < p_to
  group by p.id, p.username, p.display_name
  order by count(f.helpful_at) desc, count(*) desc, p.username
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

-- Internal: only the functions below use these.
revoke execute on function public.leaderboard_builders(timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.leaderboard_testers(timestamptz, timestamptz, integer) from public, anon, authenticated;

-- This month's boards, as before (same names and columns the site reads).
create or replace function public.top_builders(p_limit integer default 10)
returns table (user_id uuid, username text, display_name text, avatar_path text, tries bigint, likes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.leaderboard_builders(date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', p_limit)
$$;

create or replace function public.top_testers(p_limit integer default 10)
returns table (user_id uuid, username text, display_name text, feedback_count bigint, helpful_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.leaderboard_testers(date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', p_limit)
$$;

-- Who won what. Everyone can see the winners; only settle_leaderboards()
-- writes here.
create table if not exists public.leaderboard_prizes (
  month date not null,
  board text not null check (board in ('builders', 'testers')),
  place integer not null check (place between 1 and 3),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (month, board, place)
);

alter table public.leaderboard_prizes enable row level security;
drop policy if exists "Leaderboard winners are public" on public.leaderboard_prizes;
create policy "Leaderboard winners are public" on public.leaderboard_prizes for select using (true);
revoke insert, update, delete, truncate on public.leaderboard_prizes from anon, authenticated;
grant select on public.leaderboard_prizes to anon, authenticated;

alter table public.credit_events drop constraint if exists credit_events_reason_check;
alter table public.credit_events add constraint credit_events_reason_check
  check (reason in (
    'welcome', 'feedback_reward', 'feedback_helpful', 'testers_requested', 'testers_refunded',
    'streak_bonus', 'boost', 'spotlight', 'credit_pack', 'drop_bonus', 'leaderboard_prize'
  ));

-- Pays last month's top 3 on each board, once. Returns how many prizes it
-- paid this time (0 when they're already paid).
create or replace function public.settle_leaderboards()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m_start timestamptz := date_trunc('month', now()) - interval '1 month';
  m_end timestamptz := date_trunc('month', now());
  prizes integer[] := array[25, 15, 10];
  paid integer := 0;
  r record;
  n integer;
  won uuid;
begin
  -- Already settled (the usual case): nothing to do.
  if exists (select 1 from public.leaderboard_prizes where month = m_start::date and board = 'builders')
     and exists (select 1 from public.leaderboard_prizes where month = m_start::date and board = 'testers') then
    return 0;
  end if;
  -- One payout at a time, so two visits at once can't both pay.
  perform pg_advisory_xact_lock(hashtext('settle_leaderboards'));

  if not exists (select 1 from public.leaderboard_prizes where month = m_start::date and board = 'builders') then
    n := 0;
    for r in select * from public.leaderboard_builders(m_start, m_end, 3) loop
      n := n + 1;
      insert into public.leaderboard_prizes (month, board, place, user_id, amount)
      values (m_start::date, 'builders', n, r.user_id, prizes[n])
      on conflict do nothing
      returning user_id into won;
      if won is not null then
        insert into public.credit_events (user_id, delta, reason) values (won, prizes[n], 'leaderboard_prize');
        paid := paid + 1;
      end if;
      won := null;
    end loop;
  end if;

  if not exists (select 1 from public.leaderboard_prizes where month = m_start::date and board = 'testers') then
    n := 0;
    for r in select * from public.leaderboard_testers(m_start, m_end, 3) loop
      n := n + 1;
      insert into public.leaderboard_prizes (month, board, place, user_id, amount)
      values (m_start::date, 'testers', n, r.user_id, prizes[n])
      on conflict do nothing
      returning user_id into won;
      if won is not null then
        insert into public.credit_events (user_id, delta, reason) values (won, prizes[n], 'leaderboard_prize');
        paid := paid + 1;
      end if;
      won := null;
    end loop;
  end if;

  return paid;
end;
$$;

revoke execute on function public.settle_leaderboards() from public;
grant execute on function public.settle_leaderboards() to anon, authenticated;

-- ===========================================================================
-- 20261019000000_v_coin_economy.sql
-- ===========================================================================

-- Method V: more to do with V Coin.
--
--   1. Perks: builders offer deals on their app (a promo code, a lifetime
--      deal, a month of Pro...) that people unlock with V Coin. The code or
--      link is only shown to the builder and to people who unlocked it. The
--      V Coin goes to the builder, who can spend it on testers or the
--      Spotlight.
--   2. Bounties: builders post a task with a V Coin reward ("find a bug in
--      checkout: 20 V Coin"). The reward is held when it's posted. The
--      builder picks the best answer and it's paid. Nobody answered by the
--      deadline: the reward goes back. Answers came in but the builder
--      didn't pick one: it's split equally between everyone who answered
--      (so people who did the work aren't left with nothing).
--   3. Tips: send V Coin to a builder or a helpful tester (1 to 50 at a
--      time, up to 100 a day).
--   4. Referrals: invite a friend with your link. When they post their
--      first Drop or earn their first feedback reward, you both get 10 V
--      Coin (up to 20 friends a month).
--
-- Mirrors PERKS / BOUNTIES / TIPS / REFERRALS in src/lib/constants.ts.
--
-- Needs 20261018000000_leaderboard_prizes.sql (the V Coin reasons list).
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- V Coin reasons and notification kinds
-- ---------------------------------------------------------------------------

alter table public.credit_events drop constraint if exists credit_events_reason_check;
alter table public.credit_events add constraint credit_events_reason_check
  check (reason in (
    'welcome', 'feedback_reward', 'feedback_helpful', 'testers_requested', 'testers_refunded',
    'streak_bonus', 'boost', 'spotlight', 'credit_pack', 'drop_bonus', 'leaderboard_prize',
    'perk_claimed', 'perk_sold', 'bounty_posted', 'bounty_won', 'bounty_refunded', 'bounty_split',
    'tip_sent', 'tip_received', 'referral_bonus'
  ));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'follow', 'like', 'comment', 'feedback', 'helpful', 'feedback_reply',
    'connection_request', 'connection_accepted',
    'question', 'answer', 'best_answer', 'reply',
    'swap_request', 'swap_accepted',
    'backed', 'sponsor_offer', 'sponsor_accepted', 'sponsor_started', 'sponsor_ended',
    'job_application', 'application_shortlisted',
    'package_request', 'package_accepted', 'package_declined', 'package_delivered', 'package_completed',
    'package_refunded', 'package_problem',
    'perk_claimed', 'bounty_answer', 'bounty_won', 'bounty_split', 'tip', 'referral_joined'
  ));

-- Raises a friendly error unless the person has at least `p_amount` V Coin.
create or replace function public.require_credits(p_user uuid, p_amount integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select credits from public.profiles where id = p_user), 0) < p_amount then
    raise exception 'You need % V Coin for that. Earn more by testing apps.', p_amount using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.require_credits(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Perks
-- ---------------------------------------------------------------------------

create table if not exists public.perks (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 80),
  details text not null default '' check (char_length(details) <= 500),
  -- The code or link people get when they unlock it. Never public.
  secret text not null check (char_length(btrim(secret)) between 1 and 500),
  cost integer not null check (cost between 5 and 500),
  quantity integer check (quantity is null or quantity between 1 and 1000),
  claimed_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists perks_app_idx on public.perks (app_id, created_at desc);

create table if not exists public.perk_claims (
  perk_id uuid not null references public.perks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  cost integer not null,
  created_at timestamptz not null default now(),
  primary key (perk_id, user_id)
);

alter table public.perks enable row level security;
alter table public.perk_claims enable row level security;
drop policy if exists "Members see perks" on public.perks;
create policy "Members see perks" on public.perks for select to authenticated using (true);
drop policy if exists "You see your unlocks and the builder sees theirs" on public.perk_claims;
create policy "You see your unlocks and the builder sees theirs" on public.perk_claims for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.perks p where p.id = perk_id and p.owner_id = (select auth.uid())));

-- Everything but the secret. Writes only go through the functions below.
revoke all on public.perks from anon, authenticated;
grant select (id, app_id, owner_id, title, details, cost, quantity, claimed_count, active, created_at) on public.perks to authenticated;
revoke all on public.perk_claims from anon, authenticated;
grant select on public.perk_claims to authenticated;

-- Adds a perk, or (with p_id) changes one. Builders only, on their own apps,
-- up to 3 active perks per app.
create or replace function public.save_perk(
  p_id uuid, p_app uuid, p_title text, p_details text, p_secret text, p_cost integer, p_quantity integer, p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pid uuid;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.apps where id = p_app and owner_id = uid) then
    raise exception 'You can only add perks to your own apps.' using errcode = 'P0001';
  end if;
  if p_cost is null or p_cost < 5 or p_cost > 500 then
    raise exception 'Perks cost 5 to 500 V Coin.' using errcode = 'P0001';
  end if;
  if p_active and (select count(*) from public.perks where app_id = p_app and active and id is distinct from p_id) >= 3 then
    raise exception 'An app can have 3 perks at a time. Turn one off first.' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.perks (app_id, owner_id, title, details, secret, cost, quantity, active)
    values (p_app, uid, btrim(p_title), btrim(coalesce(p_details, '')), btrim(p_secret), p_cost, p_quantity, coalesce(p_active, true))
    returning id into pid;
  else
    update public.perks
    set title = btrim(p_title), details = btrim(coalesce(p_details, '')), secret = btrim(p_secret), cost = p_cost,
        quantity = p_quantity, active = coalesce(p_active, true)
    where id = p_id and owner_id = uid and app_id = p_app
    returning id into pid;
    if pid is null then
      raise exception 'That perk isn''t yours.' using errcode = 'P0001';
    end if;
  end if;
  return pid;
end;
$$;
revoke execute on function public.save_perk(uuid, uuid, text, text, text, integer, integer, boolean) from public, anon;
grant execute on function public.save_perk(uuid, uuid, text, text, text, integer, integer, boolean) to authenticated;

-- The code or link, for the builder and for people who unlocked it.
create or replace function public.perk_secret(p_perk uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.secret from public.perks p
  where p.id = p_perk
    and (p.owner_id = auth.uid() or exists (select 1 from public.perk_claims c where c.perk_id = p.id and c.user_id = auth.uid()))
$$;
revoke execute on function public.perk_secret(uuid) from public, anon;
grant execute on function public.perk_secret(uuid) to authenticated;

-- Unlocks a perk: the V Coin goes to the builder, the code or link comes
-- back. Unlocking one you already have just shows it again (no charge).
create or replace function public.claim_perk(p_perk uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p public.perks;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  select * into p from public.perks where id = p_perk for update;
  if not found then
    raise exception 'That perk is gone.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.perk_claims where perk_id = p.id and user_id = uid) then
    return p.secret;
  end if;
  if p.owner_id = uid then
    return p.secret;
  end if;
  if not p.active then
    raise exception 'That perk isn''t available any more.' using errcode = 'P0001';
  end if;
  if p.quantity is not null and p.claimed_count >= p.quantity then
    raise exception 'That perk is all claimed.' using errcode = 'P0001';
  end if;
  perform public.require_credits(uid, p.cost);
  insert into public.perk_claims (perk_id, user_id, cost) values (p.id, uid, p.cost);
  update public.perks set claimed_count = claimed_count + 1 where id = p.id;
  insert into public.credit_events (user_id, delta, reason, app_id) values (uid, -p.cost, 'perk_claimed', p.app_id);
  insert into public.credit_events (user_id, delta, reason, app_id) values (p.owner_id, p.cost, 'perk_sold', p.app_id);
  perform public.notify(p.owner_id, 'perk_claimed', uid, p.app_id, p.id);
  return p.secret;
end;
$$;
revoke execute on function public.claim_perk(uuid) from public, anon;
grant execute on function public.claim_perk(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Bounties
-- ---------------------------------------------------------------------------

create table if not exists public.bounties (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 5 and 100),
  details text not null default '' check (char_length(details) <= 1000),
  reward integer not null check (reward between 5 and 200),
  status text not null default 'open' check (status in ('open', 'awarded', 'refunded', 'split', 'cancelled')),
  answer_count integer not null default 0,
  winner_id uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bounties_open_idx on public.bounties (expires_at) where status = 'open';
create index if not exists bounties_app_idx on public.bounties (app_id, created_at desc);

create table if not exists public.bounty_answers (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounties (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 20 and 2000),
  link text check (link is null or (link ~* '^https?://' and char_length(link) <= 500)),
  created_at timestamptz not null default now(),
  unique (bounty_id, user_id)
);

alter table public.bounties enable row level security;
alter table public.bounty_answers enable row level security;
drop policy if exists "Members see bounties" on public.bounties;
create policy "Members see bounties" on public.bounties for select to authenticated using (true);
-- An answer is between the person who wrote it and the builder.
drop policy if exists "You and the builder see an answer" on public.bounty_answers;
create policy "You and the builder see an answer" on public.bounty_answers for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.bounties b where b.id = bounty_id and b.owner_id = (select auth.uid())));
revoke all on public.bounties from anon, authenticated;
grant select on public.bounties to authenticated;
revoke all on public.bounty_answers from anon, authenticated;
grant select on public.bounty_answers to authenticated;

-- Posts a bounty: the reward is held from the builder's V Coin now. Up to 3
-- open bounties per app; 3 to 30 days to answer.
create or replace function public.post_bounty(p_app uuid, p_title text, p_details text, p_reward integer, p_days integer default 14)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  bid uuid;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.apps where id = p_app and owner_id = uid) then
    raise exception 'You can only post bounties for your own apps.' using errcode = 'P0001';
  end if;
  if p_reward is null or p_reward < 5 or p_reward > 200 then
    raise exception 'Rewards are 5 to 200 V Coin.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.bounties where app_id = p_app and status = 'open') >= 3 then
    raise exception 'An app can have 3 open bounties at a time.' using errcode = 'P0001';
  end if;
  perform public.require_credits(uid, p_reward);
  insert into public.bounties (app_id, owner_id, title, details, reward, expires_at)
  values (p_app, uid, btrim(p_title), btrim(coalesce(p_details, '')), p_reward,
          now() + make_interval(days => least(greatest(coalesce(p_days, 14), 3), 30)))
  returning id into bid;
  insert into public.credit_events (user_id, delta, reason, app_id) values (uid, -p_reward, 'bounty_posted', p_app);
  return bid;
end;
$$;
revoke execute on function public.post_bounty(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.post_bounty(uuid, text, text, integer, integer) to authenticated;

create or replace function public.answer_bounty(p_bounty uuid, p_body text, p_link text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  b public.bounties;
  aid uuid;
  lnk text := nullif(btrim(coalesce(p_link, '')), '');
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  select * into b from public.bounties where id = p_bounty for update;
  if not found or b.status <> 'open' or b.expires_at <= now() then
    raise exception 'That bounty is closed.' using errcode = 'P0001';
  end if;
  if b.owner_id = uid then
    raise exception 'You can''t answer your own bounty.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) < 20 then
    raise exception 'Write a real answer (at least 20 characters).' using errcode = 'P0001';
  end if;
  if lnk is not null and lnk !~* '^https?://' then
    raise exception 'Links start with https://' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bounty_answers where bounty_id = b.id and user_id = uid) then
    raise exception 'You''ve already answered this one.' using errcode = 'P0001';
  end if;
  insert into public.bounty_answers (bounty_id, user_id, body, link) values (b.id, uid, btrim(p_body), lnk)
  returning id into aid;
  update public.bounties set answer_count = answer_count + 1 where id = b.id;
  perform public.notify(b.owner_id, 'bounty_answer', uid, b.app_id, b.id);
  return aid;
end;
$$;
revoke execute on function public.answer_bounty(uuid, text, text) from public, anon;
grant execute on function public.answer_bounty(uuid, text, text) to authenticated;

-- The builder picks the best answer; its writer gets the whole reward.
create or replace function public.award_bounty(p_answer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  a public.bounty_answers;
  b public.bounties;
begin
  select * into a from public.bounty_answers where id = p_answer;
  if not found then
    raise exception 'That answer is gone.' using errcode = 'P0001';
  end if;
  select * into b from public.bounties where id = a.bounty_id for update;
  if b.owner_id is distinct from uid then
    raise exception 'Only the builder can pick the winner.' using errcode = 'P0001';
  end if;
  if b.status <> 'open' then
    raise exception 'That bounty is already settled.' using errcode = 'P0001';
  end if;
  update public.bounties set status = 'awarded', winner_id = a.user_id, settled_at = now() where id = b.id;
  insert into public.credit_events (user_id, delta, reason, app_id) values (a.user_id, b.reward, 'bounty_won', b.app_id);
  perform public.notify(a.user_id, 'bounty_won', uid, b.app_id, b.id);
end;
$$;
revoke execute on function public.award_bounty(uuid) from public, anon;
grant execute on function public.award_bounty(uuid) to authenticated;

-- Taking a bounty down: only while nobody has answered. The reward comes back.
create or replace function public.cancel_bounty(p_bounty uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  b public.bounties;
begin
  select * into b from public.bounties where id = p_bounty for update;
  if not found or b.owner_id is distinct from uid then
    raise exception 'That bounty isn''t yours.' using errcode = 'P0001';
  end if;
  if b.status <> 'open' then
    raise exception 'That bounty is already settled.' using errcode = 'P0001';
  end if;
  if b.answer_count > 0 then
    raise exception 'People have answered, so pick the best answer instead.' using errcode = 'P0001';
  end if;
  update public.bounties set status = 'cancelled', settled_at = now() where id = b.id;
  insert into public.credit_events (user_id, delta, reason, app_id) values (b.owner_id, b.reward, 'bounty_refunded', b.app_id);
end;
$$;
revoke execute on function public.cancel_bounty(uuid) from public, anon;
grant execute on function public.cancel_bounty(uuid) to authenticated;

-- Settles bounties past their deadline: no answers, the reward goes back;
-- answers but no winner picked, it's split equally between everyone who
-- answered (any remainder goes back). Safe to call from anywhere, any number
-- of times; the site runs it whenever bounties are looked at.
create or replace function public.settle_bounties()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  a record;
  share integer;
  settled integer := 0;
begin
  for b in
    select * from public.bounties where status = 'open' and expires_at <= now()
    for update skip locked
  loop
    if b.answer_count = 0 then
      update public.bounties set status = 'refunded', settled_at = now() where id = b.id;
      insert into public.credit_events (user_id, delta, reason, app_id) values (b.owner_id, b.reward, 'bounty_refunded', b.app_id);
    else
      share := b.reward / b.answer_count;
      update public.bounties set status = 'split', settled_at = now() where id = b.id;
      if share > 0 then
        for a in select user_id from public.bounty_answers where bounty_id = b.id loop
          insert into public.credit_events (user_id, delta, reason, app_id) values (a.user_id, share, 'bounty_split', b.app_id);
          perform public.notify(a.user_id, 'bounty_split', b.owner_id, b.app_id, b.id);
        end loop;
      end if;
      if b.reward - share * b.answer_count > 0 then
        insert into public.credit_events (user_id, delta, reason, app_id)
        values (b.owner_id, b.reward - share * b.answer_count, 'bounty_refunded', b.app_id);
      end if;
    end if;
    settled := settled + 1;
  end loop;
  return settled;
end;
$$;
revoke execute on function public.settle_bounties() from public;
grant execute on function public.settle_bounties() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tips
-- ---------------------------------------------------------------------------

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount between 1 and 50),
  app_id uuid references public.apps (id) on delete set null,
  note text not null default '' check (char_length(note) <= 140),
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);
create index if not exists tips_from_idx on public.tips (from_id, created_at desc);
create index if not exists tips_to_idx on public.tips (to_id, created_at desc);

alter table public.tips enable row level security;
drop policy if exists "You see tips you sent or got" on public.tips;
create policy "You see tips you sent or got" on public.tips for select to authenticated
  using (from_id = (select auth.uid()) or to_id = (select auth.uid()));
revoke all on public.tips from anon, authenticated;
grant select on public.tips to authenticated;

create or replace function public.send_tip(p_to uuid, p_amount integer, p_app uuid default null, p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tid uuid;
  today integer;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if p_to is null or p_to = uid then
    raise exception 'You can''t tip yourself.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_to) then
    raise exception 'That person isn''t on Method V.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 50 then
    raise exception 'Tips are 1 to 50 V Coin.' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount), 0) into today from public.tips where from_id = uid and created_at > now() - interval '24 hours';
  if today + p_amount > 100 then
    raise exception 'You can tip up to 100 V Coin a day (% left today).', greatest(100 - today, 0) using errcode = 'P0001';
  end if;
  perform public.require_credits(uid, p_amount);
  insert into public.tips (from_id, to_id, amount, app_id, note)
  values (uid, p_to, p_amount, p_app, left(btrim(coalesce(p_note, '')), 140))
  returning id into tid;
  insert into public.credit_events (user_id, delta, reason, app_id) values (uid, -p_amount, 'tip_sent', p_app);
  insert into public.credit_events (user_id, delta, reason, app_id) values (p_to, p_amount, 'tip_received', p_app);
  perform public.notify(p_to, 'tip', uid, p_app, tid);
  return tid;
end;
$$;
revoke execute on function public.send_tip(uuid, integer, uuid, text) from public, anon;
grant execute on function public.send_tip(uuid, integer, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Referrals
-- ---------------------------------------------------------------------------

-- Who invited you. Private: not in the list of profile columns anyone can
-- read (see 20261011000000_security_hardening.sql).
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id) on delete set null;

create table if not exists public.referral_rewards (
  referred_id uuid primary key references public.profiles (id) on delete cascade,
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists referral_rewards_referrer_idx on public.referral_rewards (referrer_id, created_at desc);
alter table public.referral_rewards enable row level security;
revoke all on public.referral_rewards from anon, authenticated;

-- Records who invited you: once, within 7 days of joining, never yourself.
create or replace function public.set_referrer(p_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  me public.profiles;
  ref uuid;
begin
  if uid is null then
    return false;
  end if;
  select * into me from public.profiles where id = uid;
  if not found or me.referred_by is not null or me.created_at < now() - interval '7 days' then
    return false;
  end if;
  select id into ref from public.profiles where username = lower(btrim(coalesce(p_username, '')));
  if ref is null or ref = uid then
    return false;
  end if;
  update public.profiles set referred_by = ref where id = uid;
  return true;
end;
$$;
revoke execute on function public.set_referrer(text) from public, anon;
grant execute on function public.set_referrer(text) to authenticated;

-- Pays both people once the friend has really joined in. Up to 20 rewarded
-- friends per person per 30 days.
create or replace function public.grant_referral(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ref uuid;
begin
  select referred_by into ref from public.profiles where id = p_user;
  if ref is null or exists (select 1 from public.referral_rewards where referred_id = p_user) then
    return;
  end if;
  if (select count(*) from public.referral_rewards where referrer_id = ref and created_at > now() - interval '30 days') >= 20 then
    return;
  end if;
  insert into public.referral_rewards (referred_id, referrer_id) values (p_user, ref) on conflict do nothing;
  if not found then
    return;
  end if;
  insert into public.credit_events (user_id, delta, reason) values (p_user, 10, 'referral_bonus');
  insert into public.credit_events (user_id, delta, reason) values (ref, 10, 'referral_bonus');
  perform public.notify(ref, 'referral_joined', p_user);
end;
$$;
revoke execute on function public.grant_referral(uuid) from public, anon, authenticated;

create or replace function public.referral_on_drop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.grant_referral(new.owner_id);
  return null;
end;
$$;
revoke execute on function public.referral_on_drop() from public, anon, authenticated;
drop trigger if exists drops_referral on public.drops;
create trigger drops_referral after insert on public.drops
  for each row execute function public.referral_on_drop();

create or replace function public.referral_on_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.earned > 0 then
    perform public.grant_referral(new.user_id);
  end if;
  return null;
end;
$$;
revoke execute on function public.referral_on_feedback() from public, anon, authenticated;
drop trigger if exists feedback_referral on public.feedback;
create trigger feedback_referral after insert on public.feedback
  for each row execute function public.referral_on_feedback();

-- Your invites: how many friends joined with your link, and how many of
-- those earned you the bonus.
create or replace function public.my_referrals()
returns table (joined integer, rewarded integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.profiles where referred_by = auth.uid()),
    (select count(*)::integer from public.referral_rewards where referrer_id = auth.uid())
$$;
revoke execute on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

-- ===========================================================================
-- 20261020000000_app_limit.sql
-- ===========================================================================

-- Method V: up to 3 new apps per person every 30 days.
--
-- Keeps the feed and the Spotlight fair: nobody can flood Method V with
-- apps. It counts apps posted in the last 30 days (so the next one opens 30
-- days after the oldest of the 3). Adding a new Drop to an app you already
-- posted is never limited. Mirrors APP_LIMIT in src/lib/app-limit.ts.
--
-- Only people posting for themselves are limited (the site and the phone
-- app); the server's own key and the Supabase dashboard aren't.
--
-- Safe to run more than once.

create index if not exists apps_owner_created_idx on public.apps (owner_id, created_at desc);

create or replace function public.limit_new_apps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
  opens timestamptz;
begin
  if auth.uid() is null then
    return new;
  end if;
  select count(*) into recent
  from public.apps
  where owner_id = new.owner_id and created_at > now() - interval '30 days';
  if recent >= 3 then
    -- The next one opens when they're down to 2 in the last 30 days: when
    -- their 3rd newest app turns 30 days old.
    select created_at + interval '30 days' into opens
    from public.apps
    where owner_id = new.owner_id
    order by created_at desc
    offset 2 limit 1;
    raise exception 'You can post 3 apps every 30 days. Your next one opens on %. You can still add new Drops to the apps you''ve posted.',
      to_char(opens at time zone 'America/Los_Angeles', 'FMMon FMDD')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.limit_new_apps() from public, anon, authenticated;

drop trigger if exists apps_limit_new on public.apps;
create trigger apps_limit_new before insert on public.apps
  for each row execute function public.limit_new_apps();

-- ===========================================================================
-- 20261021000000_v_store.sql
-- ===========================================================================

-- Method V: the V Store, where people spend V Coin on upgrades.
--
--   * Pro for 30 days: 50 V Coin (the same Pro as paying by card; it adds
--     30 days on top of any Pro you already have).
--   * An extra app post: 30 V Coin. Lets you post one more app past the
--     limit of 3 every 30 days. Up to 2 can be bought every 30 days, so
--     nobody can post more than 5 apps a month. A bought post is saved
--     until it's used, and is only used when you're at the limit.
--   * The Spotlight is booked from the store too, with book_spotlight().
--
-- V Coin is spend-only: nothing here turns it into money.
--
-- Mirrors V_STORE in src/lib/constants.ts and APP_LIMIT in
-- src/lib/app-limit.ts.
--
-- Needs 20261019000000_v_coin_economy.sql (require_credits and the V Coin
-- reasons list) and 20261020000000_app_limit.sql.
-- Safe to run more than once.

-- Extra app posts you've bought and not used yet. Private: like credits it
-- isn't in the public column list, so only my_store() reads it.
alter table public.profiles add column if not exists extra_app_posts integer not null default 0
  check (extra_app_posts >= 0);

-- What people bought in the store (for the 2-a-month limit and history).
create table if not exists public.store_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  item text not null check (item in ('pro', 'app_post')),
  cost integer not null check (cost > 0),
  created_at timestamptz not null default now()
);
create index if not exists store_purchases_user_idx on public.store_purchases (user_id, item, created_at desc);

alter table public.store_purchases enable row level security;
drop policy if exists "See your own store purchases" on public.store_purchases;
create policy "See your own store purchases" on public.store_purchases for select using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.store_purchases from anon, authenticated;
grant select on public.store_purchases to authenticated;

alter table public.credit_events drop constraint if exists credit_events_reason_check;
alter table public.credit_events add constraint credit_events_reason_check
  check (reason in (
    'welcome', 'feedback_reward', 'feedback_helpful', 'testers_requested', 'testers_refunded',
    'streak_bonus', 'boost', 'spotlight', 'credit_pack', 'drop_bonus', 'leaderboard_prize',
    'perk_claimed', 'perk_sold', 'bounty_posted', 'bounty_won', 'bounty_refunded', 'bounty_split',
    'tip_sent', 'tip_received', 'referral_bonus', 'store_pro', 'store_app_post'
  ));

-- Buy something. Returns nothing; errors explain what's wrong.
create or replace function public.buy_store_item(p_item text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  bought integer;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  -- One purchase at a time per person, so two taps can't both get through.
  perform 1 from public.profiles where id = uid for update;

  if p_item = 'pro' then
    perform public.require_credits(uid, 50);
    insert into public.store_purchases (user_id, item, cost) values (uid, 'pro', 50);
    insert into public.credit_events (user_id, delta, reason) values (uid, -50, 'store_pro');
    update public.profiles
      set pro_until = greatest(coalesce(pro_until, now()), now()) + interval '30 days'
      where id = uid;
  elsif p_item = 'app_post' then
    select count(*) into bought
    from public.store_purchases
    where user_id = uid and item = 'app_post' and created_at > now() - interval '30 days';
    if bought >= 2 then
      raise exception 'You can buy 2 extra app posts every 30 days.' using errcode = 'P0001';
    end if;
    perform public.require_credits(uid, 30);
    insert into public.store_purchases (user_id, item, cost) values (uid, 'app_post', 30);
    insert into public.credit_events (user_id, delta, reason) values (uid, -30, 'store_app_post');
    update public.profiles set extra_app_posts = extra_app_posts + 1 where id = uid;
  else
    raise exception 'That isn''t in the V Store.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.buy_store_item(text) from public, anon;
grant execute on function public.buy_store_item(text) to authenticated;

-- Your saved extra app posts, and how many you bought in the last 30 days.
create or replace function public.my_store()
returns table (extra_app_posts integer, app_posts_bought integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select p.extra_app_posts from public.profiles p where p.id = auth.uid()), 0),
    (select count(*)::integer from public.store_purchases s
      where s.user_id = auth.uid() and s.item = 'app_post' and s.created_at > now() - interval '30 days')
$$;
revoke execute on function public.my_store() from public, anon;
grant execute on function public.my_store() to authenticated;

-- The app limit, now using a saved extra post when you're at 3.
create or replace function public.limit_new_apps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
  opens timestamptz;
begin
  if auth.uid() is null then
    return new;
  end if;
  select count(*) into recent
  from public.apps
  where owner_id = new.owner_id and created_at > now() - interval '30 days';
  if recent >= 3 then
    -- Use a bought extra post if there's one saved.
    update public.profiles set extra_app_posts = extra_app_posts - 1
      where id = new.owner_id and extra_app_posts > 0;
    if found then
      return new;
    end if;
    -- The next one opens when they're down to 2 in the last 30 days: when
    -- their 3rd newest app turns 30 days old.
    select created_at + interval '30 days' into opens
    from public.apps
    where owner_id = new.owner_id
    order by created_at desc
    offset 2 limit 1;
    raise exception 'You can post 3 apps every 30 days. Your next one opens on %. You can still add new Drops to the apps you''ve posted, or get an extra app post in the V Store.',
      to_char(opens at time zone 'America/Los_Angeles', 'FMMon FMDD')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.limit_new_apps() from public, anon, authenticated;

-- ===========================================================================
-- 20261022000000_testers_to_bounties.sql
-- ===========================================================================

-- Method V: no more paying for testers. Bounties replace it.
--
-- Builders used to hold Methodium for "tester spots" in the Test & earn
-- queue. Nobody can promise that someone will test an app, so that's gone.
-- To get people to try something, builders post a bounty instead ("10
-- Methodium for someone to try my signup flow"): the reward only goes to
-- someone who actually did it, and comes back if nobody answers.
--
--   * Every spot still waiting for a tester is refunded to its builder now
--     (shows in their history as "Unused tester spots refunded").
--   * request_testers() refuses, pointing to bounties, so an old copy of the
--     app can't hold Methodium any more.
--
-- Feedback itself stays: anyone can still try an app and tell the builder
-- what worked. It no longer earns a per-feedback reward (that came from the
-- spots); "marked helpful" and the 4-week streak bonus still pay.
--
-- Invites now also pay out on a friend's first bounty reward (see the end).
--
-- Needs 20261015000000_tester_guarantee.sql and 20261019000000_v_coin_economy.sql.
-- Safe to run more than once.

-- Give back every unfilled spot.
do $$
declare
  r record;
begin
  for r in
    select app_id, owner_id, slots_total - slots_filled as remaining
    from public.test_requests
    where slots_filled < slots_total
    for update
  loop
    update public.test_requests set slots_total = slots_filled where app_id = r.app_id;
    insert into public.credit_events (user_id, delta, reason, app_id)
    values (r.owner_id, r.remaining * 2, 'testers_refunded', r.app_id);
  end loop;
end;
$$;

-- No new spots.
create or replace function public.request_testers(p_app_id uuid, p_testers integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Asking for testers has been replaced by bounties. Post a bounty on your app''s page to pay someone to try it.'
    using errcode = 'P0001';
end;
$$;

-- Invites: the friend's first paid feedback used to count; now their first
-- bounty reward does (winning one, or a share of a split), as well as their
-- first Drop, as before.
create or replace function public.referral_on_bounty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason in ('bounty_won', 'bounty_split') then
    perform public.grant_referral(new.user_id);
  end if;
  return null;
end;
$$;
revoke execute on function public.referral_on_bounty() from public, anon, authenticated;
drop trigger if exists credit_events_referral on public.credit_events;
create trigger credit_events_referral after insert on public.credit_events
  for each row execute function public.referral_on_bounty();

-- ===========================================================================
-- 20261023000000_app_post_price.sql
-- ===========================================================================

-- Method V: an extra app post in the V Store now costs 15 Methodium (was
-- 30). Still up to 2 every 30 days. Pro stays 50.
--
-- Mirrors V_STORE in src/lib/constants.ts.
--
-- Needs 20261021000000_v_store.sql.
-- Safe to run more than once.

-- Buy something. Returns nothing; errors explain what's wrong.
create or replace function public.buy_store_item(p_item text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  bought integer;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  -- One purchase at a time per person, so two taps can't both get through.
  perform 1 from public.profiles where id = uid for update;

  if p_item = 'pro' then
    perform public.require_credits(uid, 50);
    insert into public.store_purchases (user_id, item, cost) values (uid, 'pro', 50);
    insert into public.credit_events (user_id, delta, reason) values (uid, -50, 'store_pro');
    update public.profiles
      set pro_until = greatest(coalesce(pro_until, now()), now()) + interval '30 days'
      where id = uid;
  elsif p_item = 'app_post' then
    select count(*) into bought
    from public.store_purchases
    where user_id = uid and item = 'app_post' and created_at > now() - interval '30 days';
    if bought >= 2 then
      raise exception 'You can buy 2 extra app posts every 30 days.' using errcode = 'P0001';
    end if;
    perform public.require_credits(uid, 15);
    insert into public.store_purchases (user_id, item, cost) values (uid, 'app_post', 15);
    insert into public.credit_events (user_id, delta, reason) values (uid, -15, 'store_app_post');
    update public.profiles set extra_app_posts = extra_app_posts + 1 where id = uid;
  else
    raise exception 'That isn''t in the V Store.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.buy_store_item(text) from public, anon;
grant execute on function public.buy_store_item(text) to authenticated;

-- ===========================================================================
-- 20261024000000_economy_fixes.sql
-- ===========================================================================

-- Method V: fixes from a code review of Methodium, the V Store and the app
-- limit.
--
--   1. The app limit counts every app you posted in the last 30 days, even
--      ones you deleted since (deleting and reposting used to get around it).
--      A new table, app_posts, remembers each post.
--   2. Nobody posts more than 5 apps in 30 days: 3, plus up to 2 bought extra
--      posts. You can hold at most 2 extra posts at a time.
--   3. If posting fails halfway (the Drop couldn't be saved), the server takes
--      the app back with undo_app_post(), which also gives back an extra post
--      it used. Only the server's own key can call it.
--   4. Bounties split by the answers that still exist (someone who deleted
--      their account isn't counted), and the whole reward is paid out: any
--      leftover goes 1 each to the earliest answers, so a small reward with
--      lots of answers doesn't round down to nothing.
--   5. Tips and perks: an account has to be a week old to send tips or unlock
--      perks (so bonuses from throwaway accounts can't be funneled into one),
--      and tips are capped at 50 Methodium a day.
--   6. "Not enough Methodium" no longer says to earn it by testing apps
--      (testing only pays through bounties now).
--   7. schema_version() tells /api/health which update the database has.
--
-- Mirrors APP_LIMIT in src/lib/app-limit.ts and V_STORE / TIPS in
-- src/lib/constants.ts.
--
-- Needs 20261021000000_v_store.sql and 20261022000000_testers_to_bounties.sql
-- (and replaces what 20261023000000_app_post_price.sql set).
-- Safe to run more than once.

do $$
begin
  if to_regclass('public.store_purchases') is null then
    raise exception 'Run 20261021000000_v_store.sql first.';
  end if;
  if to_regprocedure('public.referral_on_bounty()') is null then
    raise exception 'Run 20261022000000_testers_to_bounties.sql first.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1–3. The app limit
-- ---------------------------------------------------------------------------

-- Every app someone posted, kept even if the app is deleted later. Private:
-- you can read your own (the Post screens use it to say when the next one
-- opens); only the database writes it.
create table if not exists public.app_posts (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  app_id uuid not null,
  -- The post used a bought extra app post (given back if posting fails).
  used_extra boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists app_posts_owner_idx on public.app_posts (owner_id, created_at desc);
create unique index if not exists app_posts_app_idx on public.app_posts (app_id);

alter table public.app_posts enable row level security;
drop policy if exists "See your own app posts" on public.app_posts;
create policy "See your own app posts" on public.app_posts for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.app_posts from anon, authenticated;
grant select on public.app_posts to authenticated;

-- The apps posted in the last 30 days, so the limit is right from the start.
insert into public.app_posts (owner_id, app_id, created_at)
select owner_id, id, created_at from public.apps
where created_at > now() - interval '30 days'
on conflict (app_id) do nothing;

create or replace function public.limit_new_apps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
  saved integer;
  used boolean := false;
  opens timestamptz;
begin
  -- Only people posting for themselves are limited; the server's own key and
  -- the Supabase dashboard aren't (their posts still count).
  if auth.uid() is not null then
    -- One post at a time per person, so two at once can't both get under the limit.
    select extra_app_posts into saved from public.profiles where id = new.owner_id for update;
    select count(*) into recent
    from public.app_posts
    where owner_id = new.owner_id and created_at > now() - interval '30 days';
    if recent >= 5 then
      -- The most anyone can post. With an extra post saved, the next one opens
      -- when they're down to 4 in the last 30 days; otherwise when they're
      -- down to 2 (free again).
      select created_at + interval '30 days' into opens
      from public.app_posts
      where owner_id = new.owner_id
      order by created_at desc
      offset (case when coalesce(saved, 0) > 0 then 4 else 2 end) limit 1;
      raise exception 'You''ve posted 5 apps in the last 30 days, the most anyone can (3, plus 2 extra posts). Your next one opens on %. You can still add new Drops to the apps you''ve posted.',
        to_char(opens at time zone 'America/Los_Angeles', 'FMMon FMDD')
        using errcode = 'P0001';
    end if;
    if recent >= 3 then
      -- Use a bought extra post if there's one saved.
      update public.profiles set extra_app_posts = extra_app_posts - 1
        where id = new.owner_id and extra_app_posts > 0;
      if not found then
        -- The next one opens when they're down to 2 in the last 30 days: when
        -- their 3rd newest post turns 30 days old.
        select created_at + interval '30 days' into opens
        from public.app_posts
        where owner_id = new.owner_id
        order by created_at desc
        offset 2 limit 1;
        raise exception 'You can post 3 apps every 30 days. Your next one opens on %. You can still add new Drops to the apps you''ve posted, or get an extra app post in the V Store.',
          to_char(opens at time zone 'America/Los_Angeles', 'FMMon FMDD')
          using errcode = 'P0001';
      end if;
      used := true;
    end if;
  end if;
  insert into public.app_posts (owner_id, app_id, used_extra) values (new.owner_id, new.id, used)
  on conflict (app_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.limit_new_apps() from public, anon, authenticated;

drop trigger if exists apps_limit_new on public.apps;
create trigger apps_limit_new before insert on public.apps
  for each row execute function public.limit_new_apps();

-- Takes back an app whose posting failed halfway: removes the app and its
-- post (so it doesn't count), and gives back an extra post it used. For the
-- server's own key only (src/lib/publish.ts).
create or replace function public.undo_app_post(p_app uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  post public.app_posts;
begin
  delete from public.app_posts where app_id = p_app returning * into post;
  delete from public.apps where id = p_app;
  if post.used_extra then
    update public.profiles set extra_app_posts = extra_app_posts + 1 where id = post.owner_id;
  end if;
end;
$$;
revoke execute on function public.undo_app_post(uuid) from public, anon, authenticated;
grant execute on function public.undo_app_post(uuid) to service_role;

-- The V Store: Pro (50) and extra app posts (15, up to 2 bought every 30
-- days, and at most 2 saved at a time).
create or replace function public.buy_store_item(p_item text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  saved integer;
  bought integer;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  -- One purchase at a time per person, so two taps can't both get through.
  select extra_app_posts into saved from public.profiles where id = uid for update;

  if p_item = 'pro' then
    perform public.require_credits(uid, 50);
    insert into public.store_purchases (user_id, item, cost) values (uid, 'pro', 50);
    insert into public.credit_events (user_id, delta, reason) values (uid, -50, 'store_pro');
    update public.profiles
      set pro_until = greatest(coalesce(pro_until, now()), now()) + interval '30 days'
      where id = uid;
  elsif p_item = 'app_post' then
    select count(*) into bought
    from public.store_purchases
    where user_id = uid and item = 'app_post' and created_at > now() - interval '30 days';
    if bought >= 2 then
      raise exception 'You can buy 2 extra app posts every 30 days.' using errcode = 'P0001';
    end if;
    if coalesce(saved, 0) >= 2 then
      raise exception 'You have 2 extra app posts saved, the most you can hold. Use one before buying another.' using errcode = 'P0001';
    end if;
    perform public.require_credits(uid, 15);
    insert into public.store_purchases (user_id, item, cost) values (uid, 'app_post', 15);
    insert into public.credit_events (user_id, delta, reason) values (uid, -15, 'store_app_post');
    update public.profiles set extra_app_posts = extra_app_posts + 1 where id = uid;
  else
    raise exception 'That isn''t in the V Store.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.buy_store_item(text) from public, anon;
grant execute on function public.buy_store_item(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bounties
-- ---------------------------------------------------------------------------

-- answer_count follows the answers: one removed (its writer deleted their
-- account) counts down.
create or replace function public.bounty_answer_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bounties set answer_count = greatest(answer_count - 1, 0) where id = old.bounty_id;
  return null;
end;
$$;
revoke execute on function public.bounty_answer_removed() from public, anon, authenticated;
drop trigger if exists bounty_answers_removed on public.bounty_answers;
create trigger bounty_answers_removed after delete on public.bounty_answers
  for each row execute function public.bounty_answer_removed();

-- Counts that drifted before the trigger existed.
update public.bounties b
set answer_count = c.n
from (
  select b2.id, (select count(*)::integer from public.bounty_answers a where a.bounty_id = b2.id) as n
  from public.bounties b2
) c
where c.id = b.id and b.answer_count <> c.n;

-- Taking a bounty down: only while nobody has answered. The reward comes back.
create or replace function public.cancel_bounty(p_bounty uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  b public.bounties;
begin
  select * into b from public.bounties where id = p_bounty for update;
  if not found or b.owner_id is distinct from uid then
    raise exception 'That bounty isn''t yours.' using errcode = 'P0001';
  end if;
  if b.status <> 'open' then
    raise exception 'That bounty is already settled.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bounty_answers where bounty_id = b.id) then
    raise exception 'People have answered, so pick the best answer instead.' using errcode = 'P0001';
  end if;
  update public.bounties set status = 'cancelled', settled_at = now() where id = b.id;
  insert into public.credit_events (user_id, delta, reason, app_id) values (b.owner_id, b.reward, 'bounty_refunded', b.app_id);
end;
$$;
revoke execute on function public.cancel_bounty(uuid) from public, anon;
grant execute on function public.cancel_bounty(uuid) to authenticated;

-- Settles bounties past their deadline. No answers (or everyone who answered
-- has left): the reward goes back. Answers but no winner picked: the whole
-- reward is split between everyone who answered, and any leftover goes 1
-- each to the earliest answers. Safe to call from anywhere, any number of
-- times; the site runs it whenever bounties are looked at.
create or replace function public.settle_bounties()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  a record;
  n integer;
  share integer;
  leftover integer;
  pay integer;
  i integer;
  settled integer := 0;
begin
  for b in
    select * from public.bounties where status = 'open' and expires_at <= now()
    for update skip locked
  loop
    select count(*) into n from public.bounty_answers where bounty_id = b.id;
    if n = 0 then
      update public.bounties set status = 'refunded', answer_count = 0, settled_at = now() where id = b.id;
      insert into public.credit_events (user_id, delta, reason, app_id) values (b.owner_id, b.reward, 'bounty_refunded', b.app_id);
    else
      share := b.reward / n;
      leftover := b.reward - share * n;
      update public.bounties set status = 'split', answer_count = n, settled_at = now() where id = b.id;
      i := 0;
      for a in select user_id from public.bounty_answers where bounty_id = b.id order by created_at, id loop
        pay := share + (case when i < leftover then 1 else 0 end);
        i := i + 1;
        if pay > 0 then
          insert into public.credit_events (user_id, delta, reason, app_id) values (a.user_id, pay, 'bounty_split', b.app_id);
          perform public.notify(a.user_id, 'bounty_split', b.owner_id, b.app_id, b.id);
        end if;
      end loop;
    end if;
    settled := settled + 1;
  end loop;
  return settled;
end;
$$;
revoke execute on function public.settle_bounties() from public;
grant execute on function public.settle_bounties() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Tips and perks
-- ---------------------------------------------------------------------------

-- Raises a friendly error unless the account is at least a week old. Stops
-- Methodium from new (possibly throwaway) accounts being passed to another.
create or replace function public.require_week_old(p_user uuid, p_what text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  joined timestamptz := (select created_at from public.profiles where id = p_user);
begin
  if joined is not null and joined > now() - interval '7 days' then
    raise exception 'New accounts can % once they''re a week old (on %).', p_what,
      to_char((joined + interval '7 days') at time zone 'America/Los_Angeles', 'FMMon FMDD')
      using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.require_week_old(uuid, text) from public, anon, authenticated;

-- Send Methodium to someone: 1 to 50 at a time, up to 50 a day, once your
-- account is a week old.
create or replace function public.send_tip(p_to uuid, p_amount integer, p_app uuid default null, p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tid uuid;
  today integer;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if p_to is null or p_to = uid then
    raise exception 'You can''t tip yourself.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_to) then
    raise exception 'That person isn''t on Method V.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 50 then
    raise exception 'Tips are 1 to 50 Methodium.' using errcode = 'P0001';
  end if;
  perform public.require_week_old(uid, 'send tips');
  -- One tip at a time per person, so two at once can't both fit under the daily cap.
  perform 1 from public.profiles where id = uid for update;
  select coalesce(sum(amount), 0) into today from public.tips where from_id = uid and created_at > now() - interval '24 hours';
  if today + p_amount > 50 then
    raise exception 'You can tip up to 50 Methodium a day (% left today).', greatest(50 - today, 0) using errcode = 'P0001';
  end if;
  perform public.require_credits(uid, p_amount);
  insert into public.tips (from_id, to_id, amount, app_id, note)
  values (uid, p_to, p_amount, p_app, left(btrim(coalesce(p_note, '')), 140))
  returning id into tid;
  insert into public.credit_events (user_id, delta, reason, app_id) values (uid, -p_amount, 'tip_sent', p_app);
  insert into public.credit_events (user_id, delta, reason, app_id) values (p_to, p_amount, 'tip_received', p_app);
  perform public.notify(p_to, 'tip', uid, p_app, tid);
  return tid;
end;
$$;
revoke execute on function public.send_tip(uuid, integer, uuid, text) from public, anon;
grant execute on function public.send_tip(uuid, integer, uuid, text) to authenticated;

-- Unlocks a perk: the Methodium goes to the builder, the code or link comes
-- back. Unlocking one you already have just shows it again (no charge).
-- Paying for one needs an account at least a week old.
create or replace function public.claim_perk(p_perk uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p public.perks;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  select * into p from public.perks where id = p_perk for update;
  if not found then
    raise exception 'That perk is gone.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.perk_claims where perk_id = p.id and user_id = uid) then
    return p.secret;
  end if;
  if p.owner_id = uid then
    return p.secret;
  end if;
  if not p.active then
    raise exception 'That perk isn''t available any more.' using errcode = 'P0001';
  end if;
  if p.quantity is not null and p.claimed_count >= p.quantity then
    raise exception 'That perk is all claimed.' using errcode = 'P0001';
  end if;
  perform public.require_week_old(uid, 'unlock perks');
  perform public.require_credits(uid, p.cost);
  insert into public.perk_claims (perk_id, user_id, cost) values (p.id, uid, p.cost);
  update public.perks set claimed_count = claimed_count + 1 where id = p.id;
  insert into public.credit_events (user_id, delta, reason, app_id) values (uid, -p.cost, 'perk_claimed', p.app_id);
  insert into public.credit_events (user_id, delta, reason, app_id) values (p.owner_id, p.cost, 'perk_sold', p.app_id);
  perform public.notify(p.owner_id, 'perk_claimed', uid, p.app_id, p.id);
  return p.secret;
end;
$$;
revoke execute on function public.claim_perk(uuid) from public, anon;
grant execute on function public.claim_perk(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Wording
-- ---------------------------------------------------------------------------

create or replace function public.require_credits(p_user uuid, p_amount integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select credits from public.profiles where id = p_user), 0) < p_amount then
    raise exception 'You need % Methodium for that. Earn more by answering bounties, or buy a pack.', p_amount using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.require_credits(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Which update the database has (read by /api/health). Each new
--    migration bumps it.
-- ---------------------------------------------------------------------------

create or replace function public.schema_version()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20261024
$$;
revoke execute on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated;

-- ===========================================================================
-- 20261025000000_app_logos.sql
-- ===========================================================================

-- Method V: app logos. A builder can add a square logo to their app; it shows
-- next to the name on cards (over the banner on Home, at the start of each
-- row on Browse). A square JPEG in their own folder of the "drops" bucket
-- (drops/<user id>/applogo-....jpg, which the bucket's policies already
-- allow); logo_path points at it. Empty means the app's first letter on a
-- color, drawn by the site.
--
-- Needs 20261024000000_economy_fixes.sql (schema_version).
-- Safe to run more than once.

alter table public.apps add column if not exists logo_path text;

alter table public.apps drop constraint if exists apps_logo_path_check;
alter table public.apps add constraint apps_logo_path_check
  check (logo_path is null or (char_length(logo_path) <= 200 and logo_path ~ '^[0-9a-f-]{36}/applogo-[0-9]+\.jpg$'));

-- Only ever a file in the builder's own folder.
alter table public.apps drop constraint if exists apps_logo_own_folder;
alter table public.apps add constraint apps_logo_own_folder
  check (logo_path is null or split_part(logo_path, '/', 1) = owner_id::text);

grant insert (logo_path), update (logo_path) on public.apps to authenticated;

-- Which update the database has (read by /api/health).
create or replace function public.schema_version()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20261025
$$;
revoke execute on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated;
