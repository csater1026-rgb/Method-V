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
