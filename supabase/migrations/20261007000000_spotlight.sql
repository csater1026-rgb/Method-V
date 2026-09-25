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
-- 'package' is added by 20261008000000_sponsor_packages.sql; listed here so running this file again is safe.
alter table public.payments add constraint payments_kind_check check (kind in ('tip', 'sponsorship', 'pro', 'credits', 'package'));

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

