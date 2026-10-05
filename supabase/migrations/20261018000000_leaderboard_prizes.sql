-- Method V: monthly leaderboard prizes.
--
-- Both leaderboards (top builders and top testers) start fresh each month.
-- When a month ends, the top 3 on each board win V Coin: 25 for 1st, 15 for
-- 2nd, 10 for 3rd (mirrors LEADERBOARD_PRIZES in src/lib/constants.ts).
--
-- settle_leaderboards() pays last month's prizes. The site runs it whenever
-- a leaderboard is looked at, so the first visit of a new month pays out.
-- It's safe to call from anywhere, any number of times: each prize is a row
-- in public.leaderboard_prizes (one per month, board and place), so it's
-- only ever paid once.
--
-- Months are calendar months in UTC, the same as the leaderboards.
--
-- Needs 20261016000000_drop_bonus.sql (the V Coin reasons list).
-- Safe to run more than once.

-- The rankings for any window of time, so the live boards and the prizes use
-- exactly the same rules.
create or replace function public.leaderboard_builders(p_from timestamptz, p_to timestamptz, p_limit integer default 10)
returns table (user_id uuid, username text, display_name text, avatar_path text, tries bigint, likes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select a.owner_id as uid, count(*) as n
    from public.try_clicks c
    join public.apps a on a.id = c.app_id and a.link_checked_at is not null
    where c.created_at >= p_from and c.created_at < p_to and c.user_id is not null and c.user_id <> a.owner_id
    group by a.owner_id
  ),
  l as (
    select d.owner_id as uid, count(*) as n
    from public.likes lk
    join public.drops d on d.id = lk.drop_id
    where lk.created_at >= p_from and lk.created_at < p_to and lk.user_id <> d.owner_id
    group by d.owner_id
  )
  select p.id, p.username, p.display_name, p.avatar_path, coalesce(t.n, 0), coalesce(l.n, 0)
  from public.profiles p
  left join t on t.uid = p.id
  left join l on l.uid = p.id
  where coalesce(t.n, 0) + coalesce(l.n, 0) > 0
  order by coalesce(t.n, 0) + 2 * coalesce(l.n, 0) desc, p.username
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

create or replace function public.leaderboard_testers(p_from timestamptz, p_to timestamptz, p_limit integer default 10)
returns table (user_id uuid, username text, display_name text, feedback_count bigint, helpful_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, count(*), count(f.helpful_at)
  from public.feedback f
  join public.profiles p on p.id = f.user_id
  where f.created_at >= p_from and f.created_at < p_to
  group by p.id, p.username, p.display_name
  order by count(f.helpful_at) desc, count(*) desc, p.username
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

-- Internal: only the functions below use these.
revoke execute on function public.leaderboard_builders(timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.leaderboard_testers(timestamptz, timestamptz, integer) from public, anon, authenticated;

-- This month's boards, as before (same names and columns the site reads).
create or replace function public.top_builders(p_limit integer default 10)
returns table (user_id uuid, username text, display_name text, avatar_path text, tries bigint, likes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.leaderboard_builders(date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', p_limit)
$$;

create or replace function public.top_testers(p_limit integer default 10)
returns table (user_id uuid, username text, display_name text, feedback_count bigint, helpful_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.leaderboard_testers(date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', p_limit)
$$;

-- Who won what. Everyone can see the winners; only settle_leaderboards()
-- writes here.
create table if not exists public.leaderboard_prizes (
  month date not null,
  board text not null check (board in ('builders', 'testers')),
  place integer not null check (place between 1 and 3),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (month, board, place)
);

alter table public.leaderboard_prizes enable row level security;
drop policy if exists "Leaderboard winners are public" on public.leaderboard_prizes;
create policy "Leaderboard winners are public" on public.leaderboard_prizes for select using (true);
revoke insert, update, delete, truncate on public.leaderboard_prizes from anon, authenticated;
grant select on public.leaderboard_prizes to anon, authenticated;

alter table public.credit_events drop constraint if exists credit_events_reason_check;
alter table public.credit_events add constraint credit_events_reason_check
  check (reason in (
    'welcome', 'feedback_reward', 'feedback_helpful', 'testers_requested', 'testers_refunded',
    'streak_bonus', 'boost', 'spotlight', 'credit_pack', 'drop_bonus', 'leaderboard_prize'
  ));

-- Pays last month's top 3 on each board, once. Returns how many prizes it
-- paid this time (0 when they're already paid).
create or replace function public.settle_leaderboards()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m_start timestamptz := date_trunc('month', now()) - interval '1 month';
  m_end timestamptz := date_trunc('month', now());
  prizes integer[] := array[25, 15, 10];
  paid integer := 0;
  r record;
  n integer;
  won uuid;
begin
  -- Already settled (the usual case): nothing to do.
  if exists (select 1 from public.leaderboard_prizes where month = m_start::date and board = 'builders')
     and exists (select 1 from public.leaderboard_prizes where month = m_start::date and board = 'testers') then
    return 0;
  end if;
  -- One payout at a time, so two visits at once can't both pay.
  perform pg_advisory_xact_lock(hashtext('settle_leaderboards'));

  if not exists (select 1 from public.leaderboard_prizes where month = m_start::date and board = 'builders') then
    n := 0;
    for r in select * from public.leaderboard_builders(m_start, m_end, 3) loop
      n := n + 1;
      insert into public.leaderboard_prizes (month, board, place, user_id, amount)
      values (m_start::date, 'builders', n, r.user_id, prizes[n])
      on conflict do nothing
      returning user_id into won;
      if won is not null then
        insert into public.credit_events (user_id, delta, reason) values (won, prizes[n], 'leaderboard_prize');
        paid := paid + 1;
      end if;
      won := null;
    end loop;
  end if;

  if not exists (select 1 from public.leaderboard_prizes where month = m_start::date and board = 'testers') then
    n := 0;
    for r in select * from public.leaderboard_testers(m_start, m_end, 3) loop
      n := n + 1;
      insert into public.leaderboard_prizes (month, board, place, user_id, amount)
      values (m_start::date, 'testers', n, r.user_id, prizes[n])
      on conflict do nothing
      returning user_id into won;
      if won is not null then
        insert into public.credit_events (user_id, delta, reason) values (won, prizes[n], 'leaderboard_prize');
        paid := paid + 1;
      end if;
      won := null;
    end loop;
  end if;

  return paid;
end;
$$;

revoke execute on function public.settle_leaderboards() from public;
grant execute on function public.settle_leaderboards() to anon, authenticated;
