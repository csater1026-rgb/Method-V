-- Method V: promotions. The first one: post a Drop, get 10 V Coin.
--
-- public.promotions holds each promotion's amount and dates. Everyone can
-- read it (the site shows the banner from it); only the Method V team edits
-- it, in the Supabase table editor: change ends_at to end or extend one.
--
-- "drop_bonus": when someone posts a Drop while it's running, a database
-- trigger adds the bonus to their V Coin:
--   * once per app (a second Drop on the same app doesn't earn it again,
--     and deleting a Drop and posting it again doesn't either), and
--   * up to `per_day` bonuses per person per 24 hours, so it can't be farmed.
--
-- Safe to run more than once.

create table if not exists public.promotions (
  slug text primary key,
  amount integer not null check (amount between 1 and 100),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  per_day integer not null default 3 check (per_day between 1 and 20)
);

alter table public.promotions enable row level security;
drop policy if exists "Promotions are public" on public.promotions;
create policy "Promotions are public" on public.promotions for select using (true);
revoke insert, update, delete, truncate on public.promotions from anon, authenticated;
grant select on public.promotions to anon, authenticated;

-- Runs until the end of October 2026 (US Pacific time). Edit ends_at to change it.
insert into public.promotions (slug, amount, starts_at, ends_at, per_day)
values ('drop_bonus', 10, now(), '2026-10-31 23:59:59-07', 3)
on conflict (slug) do nothing;

alter table public.credit_events drop constraint if exists credit_events_reason_check;
alter table public.credit_events add constraint credit_events_reason_check
  check (reason in (
    'welcome', 'feedback_reward', 'feedback_helpful', 'testers_requested', 'testers_refunded',
    'streak_bonus', 'boost', 'spotlight', 'credit_pack', 'drop_bonus'
  ));

create or replace function public.grant_drop_bonus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.promotions;
  today integer;
begin
  select * into p from public.promotions
  where slug = 'drop_bonus' and now() >= starts_at and now() < ends_at;
  if not found then
    return null;
  end if;
  -- Once per app.
  if exists (select 1 from public.credit_events where reason = 'drop_bonus' and app_id = new.app_id) then
    return null;
  end if;
  select count(*) into today from public.credit_events
  where user_id = new.owner_id and reason = 'drop_bonus' and created_at > now() - interval '24 hours';
  if today >= p.per_day then
    return null;
  end if;
  insert into public.credit_events (user_id, delta, reason, app_id)
  values (new.owner_id, p.amount, 'drop_bonus', new.app_id);
  return null;
end;
$$;

revoke execute on function public.grant_drop_bonus() from public, anon, authenticated;

drop trigger if exists drops_bonus on public.drops;
create trigger drops_bonus after insert on public.drops
  for each row execute function public.grant_drop_bonus();
