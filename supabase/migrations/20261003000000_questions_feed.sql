-- Method V: Q&A for the Questions feed in Drops.
--   * Polls: a question can carry 2-4 choices that people answer with one tap.
--     Totals are public; who picked what is private.
--   * Replies: an answer can reply to another answer on the same question
--     (one level, like a Reddit thread).
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Polls
-- ---------------------------------------------------------------------------

create or replace function public.valid_poll(p_options text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_options is null or (
    cardinality(p_options) between 2 and 4
    and not exists (select 1 from unnest(p_options) o where char_length(btrim(o)) not between 1 and 60)
  )
$$;

alter table public.questions add column if not exists poll_options text[];
alter table public.questions add column if not exists poll_counts integer[];
alter table public.questions drop constraint if exists questions_poll_valid;
alter table public.questions add constraint questions_poll_valid check (public.valid_poll(poll_options));

-- Totals start at zero for each choice.
create or replace function public.init_poll_counts()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.poll_counts := case when new.poll_options is null then null else array_fill(0, array[cardinality(new.poll_options)]) end;
  return new;
end;
$$;
drop trigger if exists questions_init_poll on public.questions;
create trigger questions_init_poll before insert on public.questions
  for each row execute function public.init_poll_counts();

grant insert (poll_options) on public.questions to authenticated;

create table if not exists public.poll_votes (
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  choice smallint not null check (choice between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

alter table public.poll_votes enable row level security;

drop policy if exists "People see their own poll votes" on public.poll_votes;
create policy "People see their own poll votes" on public.poll_votes for select to authenticated
  using ((select auth.uid()) = user_id);

-- Votes only go through vote_poll, which keeps the totals right.
revoke insert, update, delete on public.poll_votes from anon, authenticated;

-- Pick a choice (0-based), change it, or pass null to take it back. Returns
-- the new totals.
create or replace function public.vote_poll(p_question uuid, p_choice integer)
returns integer[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  q public.questions;
  before smallint;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  select * into q from public.questions where id = p_question for update;
  if q.id is null or q.poll_options is null then
    raise exception 'That question doesn''t have a poll.' using errcode = 'P0001';
  end if;
  if p_choice is not null and (p_choice < 0 or p_choice >= cardinality(q.poll_options)) then
    raise exception 'Pick one of the choices.' using errcode = 'P0001';
  end if;

  select choice into before from public.poll_votes where question_id = p_question and user_id = uid;
  if before is not null then
    q.poll_counts[before + 1] := greatest(q.poll_counts[before + 1] - 1, 0);
    delete from public.poll_votes where question_id = p_question and user_id = uid;
  end if;
  if p_choice is not null then
    insert into public.poll_votes (question_id, user_id, choice) values (p_question, uid, p_choice);
    q.poll_counts[p_choice + 1] := q.poll_counts[p_choice + 1] + 1;
  end if;
  update public.questions set poll_counts = q.poll_counts where id = p_question;
  return q.poll_counts;
end;
$$;

revoke execute on function public.vote_poll(uuid, integer) from public;
grant execute on function public.vote_poll(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Replies
-- ---------------------------------------------------------------------------

alter table public.answers add column if not exists parent_id uuid references public.answers (id) on delete cascade;
create index if not exists answers_parent_idx on public.answers (parent_id) where parent_id is not null;

grant insert (parent_id) on public.answers to authenticated;

-- A reply answers an answer on the same question, one level deep.
create or replace function public.check_answer_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent public.answers;
begin
  if new.parent_id is null then
    return new;
  end if;
  select * into parent from public.answers where id = new.parent_id;
  if parent.id is null or parent.question_id <> new.question_id then
    raise exception 'That reply isn''t on this question.' using errcode = 'P0001';
  end if;
  if parent.parent_id is not null then
    new.parent_id := parent.parent_id;
  end if;
  return new;
end;
$$;
drop trigger if exists answers_check_parent on public.answers;
create trigger answers_check_parent before insert on public.answers
  for each row execute function public.check_answer_parent();

-- Replies to an answer notify its author (answers to the question still
-- notify the asker, as before).
create or replace function public.notify_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent_author uuid;
  q public.questions;
begin
  if new.parent_id is null then
    return null;
  end if;
  select user_id into parent_author from public.answers where id = new.parent_id;
  select * into q from public.questions where id = new.question_id;
  if parent_author is distinct from q.user_id then
    perform public.notify(parent_author, 'answer', new.user_id, q.app_id, q.id);
  end if;
  return null;
end;
$$;
drop trigger if exists answers_notify_reply on public.answers;
create trigger answers_notify_reply after insert on public.answers
  for each row execute function public.notify_reply();

-- Best answers are top-level answers, not replies.
create or replace function public.check_best_answer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.best_answer_id is not null and exists (select 1 from public.answers where id = new.best_answer_id and parent_id is not null) then
    raise exception 'Pick an answer, not a reply.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists questions_check_best on public.questions;
create trigger questions_check_best before update of best_answer_id on public.questions
  for each row execute function public.check_best_answer();

-- ---------------------------------------------------------------------------
-- Top builders of the month (on Home, above top testers)
-- ---------------------------------------------------------------------------

-- Ranked by what other people did with their apps this month: tries, plus
-- likes on their Drops counting double. Their own tries and likes don't count.
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
    where c.created_at >= date_trunc('month', now()) and c.user_id is distinct from a.owner_id
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

revoke execute on function public.top_builders(integer) from public;
grant execute on function public.top_builders(integer) to anon, authenticated;
