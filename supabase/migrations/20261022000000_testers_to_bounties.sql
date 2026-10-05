-- Method V: no more paying for testers. Bounties replace it.
--
-- Builders used to hold Methodium for "tester spots" in the Test & earn
-- queue. Nobody can promise that someone will test an app, so that's gone.
-- To get people to try something, builders post a bounty instead ("10
-- Methodium for someone to try my signup flow"): the reward only goes to
-- someone who actually did it, and comes back if nobody answers.
--
--   * Every spot still waiting for a tester is refunded to its builder now
--     (shows in their history as "Unused tester spots refunded").
--   * request_testers() refuses, pointing to bounties, so an old copy of the
--     app can't hold Methodium any more.
--
-- Feedback itself stays: anyone can still try an app and tell the builder
-- what worked. It no longer earns a per-feedback reward (that came from the
-- spots); "marked helpful" and the 4-week streak bonus still pay.
--
-- Invites now also pay out on a friend's first bounty reward (see the end).
--
-- Needs 20261015000000_tester_guarantee.sql and 20261019000000_v_coin_economy.sql.
-- Safe to run more than once.

-- Give back every unfilled spot.
do $$
declare
  r record;
begin
  for r in
    select app_id, owner_id, slots_total - slots_filled as remaining
    from public.test_requests
    where slots_filled < slots_total
    for update
  loop
    update public.test_requests set slots_total = slots_filled where app_id = r.app_id;
    insert into public.credit_events (user_id, delta, reason, app_id)
    values (r.owner_id, r.remaining * 2, 'testers_refunded', r.app_id);
  end loop;
end;
$$;

-- No new spots.
create or replace function public.request_testers(p_app_id uuid, p_testers integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Asking for testers has been replaced by bounties. Post a bounty on your app''s page to pay someone to try it.'
    using errcode = 'P0001';
end;
$$;

-- Invites: the friend's first paid feedback used to count; now their first
-- bounty reward does (winning one, or a share of a split), as well as their
-- first Drop, as before.
create or replace function public.referral_on_bounty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason in ('bounty_won', 'bounty_split') then
    perform public.grant_referral(new.user_id);
  end if;
  return null;
end;
$$;
revoke execute on function public.referral_on_bounty() from public, anon, authenticated;
drop trigger if exists credit_events_referral on public.credit_events;
create trigger credit_events_referral after insert on public.credit_events
  for each row execute function public.referral_on_bounty();
