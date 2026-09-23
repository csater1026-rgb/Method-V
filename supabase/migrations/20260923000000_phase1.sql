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
