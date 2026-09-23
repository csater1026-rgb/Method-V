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
