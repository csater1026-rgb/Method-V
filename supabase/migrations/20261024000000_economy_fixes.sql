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
