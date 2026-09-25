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

