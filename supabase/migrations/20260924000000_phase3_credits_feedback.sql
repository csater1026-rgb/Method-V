-- Method V, Phase 3 ("Grow"), part 1: try-to-earn credits and structured
-- feedback.
--
-- How the economy works:
--   * Everyone gets 10 welcome credits.
--   * A builder spends 2 credits per tester to put their app in the
--     "Test & earn" queue.
--   * Someone who has opened the app with "Try it" and leaves feedback on a
--     queued app fills one of those spots and earns the 2 credits.
--   * The builder can mark feedback helpful: +1 credit for the tester.
--   * Earning is capped at 10 paid feedbacks per person per 24 hours.
--
-- Balances are only ever changed by rows in credit_events, which only these
-- server-side functions and triggers can write.

-- ---------------------------------------------------------------------------
-- New counters on existing tables (trigger-only: not in any column grant)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column credits integer not null default 0 check (credits >= 0),
  add column feedback_given_count integer not null default 0,
  add column feedback_helpful_count integer not null default 0;

alter table public.apps
  add column feedback_count integer not null default 0,
  add column would_use_yes_count integer not null default 0,
  add column rating_sum integer not null default 0;

-- ---------------------------------------------------------------------------
-- Credit ledger
-- ---------------------------------------------------------------------------

create table public.credit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null
    check (reason in ('welcome', 'feedback_reward', 'feedback_helpful', 'testers_requested', 'testers_refunded')),
  app_id uuid references public.apps (id) on delete set null,
  created_at timestamptz not null default now()
);

create index credit_events_user_idx on public.credit_events (user_id, created_at desc);

alter table public.credit_events enable row level security;

create policy "People see their own credit history"
  on public.credit_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.credit_events from anon, authenticated;

create function public.apply_credit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The check constraint on profiles.credits stops balances going negative.
  update public.profiles set credits = credits + new.delta where id = new.user_id;
  return null;
end;
$$;

create trigger credit_events_apply
  after insert on public.credit_events
  for each row execute function public.apply_credit_event();

-- Welcome credits for every new profile, and for everyone already here.
create function public.grant_welcome_credits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.credit_events (user_id, delta, reason) values (new.id, 10, 'welcome');
  return null;
end;
$$;

create trigger profiles_welcome_credits
  after insert on public.profiles
  for each row execute function public.grant_welcome_credits();

insert into public.credit_events (user_id, delta, reason)
select id, 10, 'welcome' from public.profiles;

-- ---------------------------------------------------------------------------
-- Tester requests (the "Test & earn" queue)
-- ---------------------------------------------------------------------------

create table public.test_requests (
  app_id uuid primary key references public.apps (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  slots_total integer not null check (slots_total >= 0),
  slots_filled integer not null default 0 check (slots_filled >= 0 and slots_filled <= slots_total),
  opened_at timestamptz not null default now()
);

create index test_requests_open_idx on public.test_requests (opened_at) where slots_filled < slots_total;

alter table public.test_requests enable row level security;

create policy "The test queue is public"
  on public.test_requests for select
  using (true);

revoke insert, update, delete on public.test_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Try clicks: people can now see their own, so the app knows they've tried it
-- ---------------------------------------------------------------------------

create policy "People see their own tries"
  on public.try_clicks for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  would_use text not null check (would_use in ('yes', 'maybe', 'no')),
  rating smallint not null check (rating between 1 and 5),
  worked text not null check (char_length(btrim(worked)) between 10 and 1000),
  confusing text not null default '' check (char_length(confusing) <= 1000),
  earned integer not null default 0,
  helpful_at timestamptz,
  created_at timestamptz not null default now(),
  unique (app_id, user_id)
);

create index feedback_app_idx on public.feedback (app_id, created_at desc);

alter table public.feedback enable row level security;

-- Feedback is private between the tester and the builder. The public sees the
-- totals on apps (feedback_count, would_use_yes_count, rating_sum).
create policy "Testers and builders see feedback"
  on public.feedback for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.apps where apps.id = app_id and apps.owner_id = (select auth.uid()))
  );

create policy "People who tried an app can give feedback"
  on public.feedback for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and not exists (select 1 from public.apps where apps.id = app_id and apps.owner_id = (select auth.uid()))
    and exists (
      select 1 from public.try_clicks
      where try_clicks.app_id = feedback.app_id and try_clicks.user_id = (select auth.uid())
    )
  );

-- No edits or deletes, so feedback can't be recycled for more credits.
revoke insert, update, delete on public.feedback from anon, authenticated;
grant insert (app_id, user_id, would_use, rating, worked, confusing) on public.feedback to authenticated;

-- Before insert: claim a paid spot if the app is in the queue and the tester
-- is under the daily cap. The update is atomic, so two testers can't both
-- take the last spot.
create function public.claim_feedback_reward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  earned_today integer;
begin
  new.earned := 0;
  select count(*) into earned_today
    from public.credit_events
    where user_id = new.user_id and reason = 'feedback_reward' and created_at > now() - interval '24 hours';
  if earned_today < 10 then
    update public.test_requests
      set slots_filled = slots_filled + 1
      where app_id = new.app_id and slots_filled < slots_total;
    if found then
      new.earned := 2;
    end if;
  end if;
  return new;
end;
$$;

create trigger feedback_claim_reward
  before insert on public.feedback
  for each row execute function public.claim_feedback_reward();

create function public.record_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
  return null;
end;
$$;

create trigger feedback_record
  after insert on public.feedback
  for each row execute function public.record_feedback();

-- ---------------------------------------------------------------------------
-- Actions builders take (called with supabase.rpc)
-- ---------------------------------------------------------------------------

create function public.request_testers(p_app_id uuid, p_testers integer)
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
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if p_testers is null or p_testers < 1 or p_testers > 50 then
    raise exception 'Ask for between 1 and 50 testers.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.apps
    where id = p_app_id and owner_id = uid and link_checked_at is not null
  ) then
    raise exception 'You can only ask for testers on your own live apps.' using errcode = 'P0001';
  end if;

  cost := p_testers * 2;
  select credits into balance from public.profiles where id = uid for update;
  if balance < cost then
    raise exception 'That costs % credits and you have %.', cost, balance using errcode = 'P0001';
  end if;

  insert into public.credit_events (user_id, delta, reason, app_id)
  values (uid, -cost, 'testers_requested', p_app_id);

  insert into public.test_requests (app_id, owner_id, slots_total)
  values (p_app_id, uid, p_testers)
  on conflict (app_id) do update
    set slots_total = public.test_requests.slots_total + excluded.slots_total,
        -- Re-opening a finished request puts the app back at the end of the queue.
        opened_at = case
          when public.test_requests.slots_filled >= public.test_requests.slots_total then now()
          else public.test_requests.opened_at
        end;
end;
$$;

create function public.cancel_test_request(p_app_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  remaining integer;
begin
  select slots_total - slots_filled into remaining
    from public.test_requests
    where app_id = p_app_id and owner_id = uid
    for update;
  if remaining is null then
    raise exception 'No tester request to cancel.' using errcode = 'P0001';
  end if;
  if remaining > 0 then
    update public.test_requests set slots_total = slots_filled where app_id = p_app_id;
    insert into public.credit_events (user_id, delta, reason, app_id)
    values (uid, remaining * 2, 'testers_refunded', p_app_id);
  end if;
  return coalesce(remaining, 0);
end;
$$;

create function public.mark_feedback_helpful(p_feedback_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tester uuid;
  app uuid;
begin
  update public.feedback f
    set helpful_at = now()
    from public.apps a
    where f.id = p_feedback_id and a.id = f.app_id and a.owner_id = uid and f.helpful_at is null
    returning f.user_id, f.app_id into tester, app;
  if tester is null then
    raise exception 'You can mark feedback on your own apps once.' using errcode = 'P0001';
  end if;
  insert into public.credit_events (user_id, delta, reason, app_id) values (tester, 1, 'feedback_helpful', app);
  update public.profiles set feedback_helpful_count = feedback_helpful_count + 1 where id = tester;
end;
$$;

revoke execute on function public.request_testers(uuid, integer) from public, anon;
revoke execute on function public.cancel_test_request(uuid) from public, anon;
revoke execute on function public.mark_feedback_helpful(uuid) from public, anon;
grant execute on function public.request_testers(uuid, integer) to authenticated;
grant execute on function public.cancel_test_request(uuid) to authenticated;
grant execute on function public.mark_feedback_helpful(uuid) to authenticated;
