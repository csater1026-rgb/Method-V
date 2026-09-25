-- Method V: fixes from a review of Q&A and the leaderboards.
--   * Deleting an answer keeps other people's replies under it (they become
--     answers) instead of deleting them and their reputation.
--   * A reply notifies the person you replied to ("replied to your answer"),
--     not the top answer's author as an "answer".
--   * Poll choices can't be null or nested arrays.
--   * Top builders only counts tries by signed-in people (one per person per
--     app), so nobody can pad it with anonymous tries.
--
-- Safe to run more than once.

-- Replies outlive the answer they replied to.
alter table public.answers drop constraint if exists answers_parent_id_fkey;
alter table public.answers
  add constraint answers_parent_id_fkey foreign key (parent_id) references public.answers (id) on delete set null;

-- A "reply" notification.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'follow', 'like', 'comment', 'feedback', 'helpful',
    'connection_request', 'connection_accepted',
    'question', 'answer', 'best_answer', 'reply',
    'swap_request', 'swap_accepted',
    'backed', 'sponsor_offer', 'sponsor_accepted', 'sponsor_started', 'sponsor_ended',
    'job_application', 'application_shortlisted',
    -- Added by 20261008000000_sponsor_packages.sql, listed here so running this file again is safe.
    'package_request', 'package_accepted', 'package_declined', 'package_delivered', 'package_completed',
    'package_refunded', 'package_problem'
  ));

-- Notify the person being replied to, before the reply is moved under the
-- top-level answer. The asker already hears about every answer, so they're
-- not told twice.
create or replace function public.check_answer_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent public.answers;
  q public.questions;
begin
  if new.parent_id is null then
    return new;
  end if;
  select * into parent from public.answers where id = new.parent_id;
  if parent.id is null or parent.question_id <> new.question_id then
    raise exception 'That reply isn''t on this question.' using errcode = 'P0001';
  end if;
  select * into q from public.questions where id = new.question_id;
  if parent.user_id is distinct from q.user_id then
    perform public.notify(parent.user_id, 'reply', new.user_id, q.app_id, q.id);
  end if;
  if parent.parent_id is not null then
    new.parent_id := parent.parent_id;
  end if;
  return new;
end;
$$;

drop trigger if exists answers_notify_reply on public.answers;
drop function if exists public.notify_reply();

-- One flat list of 2-4 real choices.
create or replace function public.valid_poll(p_options text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_options is null or (
    array_ndims(p_options) = 1
    and cardinality(p_options) between 2 and 4
    and array_position(p_options, null) is null
    and not exists (select 1 from unnest(p_options) o where char_length(btrim(o)) not between 1 and 60)
  )
$$;

-- Signed-in tries only (one per person per app), never the builder's own.
create or replace function public.top_builders(p_limit integer default 10)
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
    where c.created_at >= date_trunc('month', now()) and c.user_id is not null and c.user_id <> a.owner_id
    group by a.owner_id
  ),
  l as (
    select d.owner_id as uid, count(*) as n
    from public.likes lk
    join public.drops d on d.id = lk.drop_id
    where lk.created_at >= date_trunc('month', now()) and lk.user_id <> d.owner_id
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
