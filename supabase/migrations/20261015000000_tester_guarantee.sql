-- Method V: testers are guaranteed or your credits come back.
--
-- When a builder asks for testers, the credits are held as spots. A spot is
-- only used up by real feedback:
--   * the tester opened the app with Try it at least a minute before sending
--     feedback, and
--   * "What worked?" is a real answer (at least 40 characters, a couple of
--     sentences), not a one-liner.
-- Feedback that misses either still reaches the builder, but doesn't use a
-- spot or earn the tester credits.
--
-- Spots nobody fills within 7 days of the last time the builder added
-- testers go back to the builder automatically (expire_test_requests(),
-- which the site runs whenever the queue, an app's feedback or someone's
-- credits are looked at). Stop and refund still works any time.
--
-- Mirrors CREDITS / TESTER_GUARANTEE in src/lib/constants.ts.
--
-- Safe to run more than once.

alter table public.test_requests add column if not exists expires_at timestamptz;
update public.test_requests set expires_at = now() + interval '7 days'
  where expires_at is null and slots_filled < slots_total;

create index if not exists test_requests_expires_idx on public.test_requests (expires_at)
  where slots_filled < slots_total;

-- Gives back every spot that's been waiting too long. Safe to call from
-- anywhere, any number of times: it only ever refunds expired spots, once.
create or replace function public.expire_test_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  refunded integer := 0;
  r record;
begin
  for r in
    select app_id, owner_id, slots_total - slots_filled as remaining
    from public.test_requests
    where expires_at < now() and slots_filled < slots_total
    for update skip locked
  loop
    update public.test_requests set slots_total = slots_filled where app_id = r.app_id;
    insert into public.credit_events (user_id, delta, reason, app_id)
    values (r.owner_id, r.remaining * 2, 'testers_refunded', r.app_id);
    refunded := refunded + 1;
  end loop;
  return refunded;
end;
$$;

revoke execute on function public.expire_test_requests() from public;
grant execute on function public.expire_test_requests() to anon, authenticated;

-- Asking for testers: as before, and every request (or top-up) gets 7 days.
create or replace function public.request_testers(p_app_id uuid, p_testers integer)
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

  -- Settle anything already expired first, so old spots refund before new ones are added.
  perform public.expire_test_requests();

  cost := p_testers * 2;
  select credits into balance from public.profiles where id = uid for update;
  if balance < cost then
    raise exception 'That costs % credits and you have %.', cost, balance using errcode = 'P0001';
  end if;

  insert into public.credit_events (user_id, delta, reason, app_id)
  values (uid, -cost, 'testers_requested', p_app_id);

  insert into public.test_requests (app_id, owner_id, slots_total, expires_at)
  values (p_app_id, uid, p_testers, now() + interval '7 days')
  on conflict (app_id) do update
    set slots_total = public.test_requests.slots_total + excluded.slots_total,
        expires_at = now() + interval '7 days',
        -- Re-opening a finished request puts the app back at the end of the queue.
        opened_at = case
          when public.test_requests.slots_filled >= public.test_requests.slots_total then now()
          else public.test_requests.opened_at
        end;
end;
$$;

-- Paid feedback: as before (ranks, daily caps), plus the two checks above.
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

  -- A real try (at least a minute with the app) and a real answer.
  if char_length(btrim(new.worked)) < 40 or not exists (
    select 1 from public.try_clicks
    where app_id = new.app_id and user_id = new.user_id and created_at <= now() - interval '1 minute'
  ) then
    return new;
  end if;

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
      where app_id = new.app_id and slots_filled < slots_total and (expires_at is null or expires_at > now());
    if found then
      new.earned := reward;
    end if;
  end if;
  return new;
end;
$$;
