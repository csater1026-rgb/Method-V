-- Method V: the V Store, where people spend V Coin on upgrades.
--
--   * Pro for 30 days: 50 V Coin (the same Pro as paying by card; it adds
--     30 days on top of any Pro you already have).
--   * An extra app post: 30 V Coin. Lets you post one more app past the
--     limit of 3 every 30 days. Up to 2 can be bought every 30 days, so
--     nobody can post more than 5 apps a month. A bought post is saved
--     until it's used, and is only used when you're at the limit.
--   * The Spotlight is booked from the store too, with book_spotlight().
--
-- V Coin is spend-only: nothing here turns it into money.
--
-- Mirrors V_STORE in src/lib/constants.ts and APP_LIMIT in
-- src/lib/app-limit.ts.
--
-- Needs 20261019000000_v_coin_economy.sql (require_credits and the V Coin
-- reasons list) and 20261020000000_app_limit.sql.
-- Safe to run more than once.

-- Extra app posts you've bought and not used yet. Private: like credits it
-- isn't in the public column list, so only my_store() reads it.
alter table public.profiles add column if not exists extra_app_posts integer not null default 0
  check (extra_app_posts >= 0);

-- What people bought in the store (for the 2-a-month limit and history).
create table if not exists public.store_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  item text not null check (item in ('pro', 'app_post')),
  cost integer not null check (cost > 0),
  created_at timestamptz not null default now()
);
create index if not exists store_purchases_user_idx on public.store_purchases (user_id, item, created_at desc);

alter table public.store_purchases enable row level security;
drop policy if exists "See your own store purchases" on public.store_purchases;
create policy "See your own store purchases" on public.store_purchases for select using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.store_purchases from anon, authenticated;
grant select on public.store_purchases to authenticated;

alter table public.credit_events drop constraint if exists credit_events_reason_check;
alter table public.credit_events add constraint credit_events_reason_check
  check (reason in (
    'welcome', 'feedback_reward', 'feedback_helpful', 'testers_requested', 'testers_refunded',
    'streak_bonus', 'boost', 'spotlight', 'credit_pack', 'drop_bonus', 'leaderboard_prize',
    'perk_claimed', 'perk_sold', 'bounty_posted', 'bounty_won', 'bounty_refunded', 'bounty_split',
    'tip_sent', 'tip_received', 'referral_bonus', 'store_pro', 'store_app_post'
  ));

-- Buy something. Returns nothing; errors explain what's wrong.
create or replace function public.buy_store_item(p_item text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  bought integer;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  -- One purchase at a time per person, so two taps can't both get through.
  perform 1 from public.profiles where id = uid for update;

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
    perform public.require_credits(uid, 30);
    insert into public.store_purchases (user_id, item, cost) values (uid, 'app_post', 30);
    insert into public.credit_events (user_id, delta, reason) values (uid, -30, 'store_app_post');
    update public.profiles set extra_app_posts = extra_app_posts + 1 where id = uid;
  else
    raise exception 'That isn''t in the V Store.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.buy_store_item(text) from public, anon;
grant execute on function public.buy_store_item(text) to authenticated;

-- Your saved extra app posts, and how many you bought in the last 30 days.
create or replace function public.my_store()
returns table (extra_app_posts integer, app_posts_bought integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select p.extra_app_posts from public.profiles p where p.id = auth.uid()), 0),
    (select count(*)::integer from public.store_purchases s
      where s.user_id = auth.uid() and s.item = 'app_post' and s.created_at > now() - interval '30 days')
$$;
revoke execute on function public.my_store() from public, anon;
grant execute on function public.my_store() to authenticated;

-- The app limit, now using a saved extra post when you're at 3.
create or replace function public.limit_new_apps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
  opens timestamptz;
begin
  if auth.uid() is null then
    return new;
  end if;
  select count(*) into recent
  from public.apps
  where owner_id = new.owner_id and created_at > now() - interval '30 days';
  if recent >= 3 then
    -- Use a bought extra post if there's one saved.
    update public.profiles set extra_app_posts = extra_app_posts - 1
      where id = new.owner_id and extra_app_posts > 0;
    if found then
      return new;
    end if;
    -- The next one opens when they're down to 2 in the last 30 days: when
    -- their 3rd newest app turns 30 days old.
    select created_at + interval '30 days' into opens
    from public.apps
    where owner_id = new.owner_id
    order by created_at desc
    offset 2 limit 1;
    raise exception 'You can post 3 apps every 30 days. Your next one opens on %. You can still add new Drops to the apps you''ve posted, or get an extra app post in the V Store.',
      to_char(opens at time zone 'America/Los_Angeles', 'FMMon FMDD')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.limit_new_apps() from public, anon, authenticated;
