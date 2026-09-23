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
