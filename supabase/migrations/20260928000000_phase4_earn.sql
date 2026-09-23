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

-- Called by the /try route when someone taps a sponsor card. Charges the
-- sponsor one try's price and pays the host their share. Returns whether
-- this try counted.
create function public.record_sponsored_try(p_id uuid)
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
  if s.id is null or uid in (s.sponsor_user, s.host_user) then
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
