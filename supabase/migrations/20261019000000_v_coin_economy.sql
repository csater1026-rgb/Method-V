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
