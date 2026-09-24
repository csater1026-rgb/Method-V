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
