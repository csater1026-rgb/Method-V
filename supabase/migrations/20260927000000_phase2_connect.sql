-- Method V, Phase 2 ("Connect"):
--   * Connections with a reason (collaborate, hire, feedback, invest, fan)
--   * Messages between connected builders
--   * Q&A on each app: questions, answers, votes, best answer, reputation
--   * Notifications, created by triggers
--   * "Builders like you" suggestions
--
-- Writes that change someone else's data (accepting, best answers, counters,
-- notifications) go through security-definer functions and triggers.

-- ---------------------------------------------------------------------------
-- Profile counters
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column connection_count integer not null default 0,
  add column reputation integer not null default 0;

-- ---------------------------------------------------------------------------
-- Notifications (defined first; the triggers below write to it)
-- ---------------------------------------------------------------------------

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'follow', 'like', 'comment', 'feedback', 'helpful',
    'connection_request', 'connection_accepted',
    'question', 'answer', 'best_answer',
    'swap_request', 'swap_accepted'
  )),
  actor_id uuid references public.profiles (id) on delete cascade,
  app_id uuid references public.apps (id) on delete cascade,
  ref_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "People see their own notifications"
  on public.notifications for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.notifications from anon, authenticated;

-- Skips notifying people about their own actions, and doesn't repeat an
-- unread notification for the same thing (e.g. like, unlike, like again).
create function public.notify(p_user uuid, p_kind text, p_actor uuid, p_app uuid default null, p_ref uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  if exists (
    select 1 from public.notifications
    where user_id = p_user and kind = p_kind and actor_id is not distinct from p_actor
      and app_id is not distinct from p_app and ref_id is not distinct from p_ref and read_at is null
  ) then
    return;
  end if;
  insert into public.notifications (user_id, kind, actor_id, app_id, ref_id)
  values (p_user, p_kind, p_actor, p_app, p_ref);
end;
$$;

revoke execute on function public.notify(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;

create function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

-- Notifications for things built in earlier phases.
create function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(new.following_id, 'follow', new.follower_id);
  return null;
end;
$$;
create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_on_follow();

create function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d public.drops;
begin
  select * into d from public.drops where id = new.drop_id;
  perform public.notify(d.owner_id, 'like', new.user_id, d.app_id, d.id);
  return null;
end;
$$;
create trigger likes_notify after insert on public.likes
  for each row execute function public.notify_on_like();

create function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d public.drops;
begin
  select * into d from public.drops where id = new.drop_id;
  perform public.notify(d.owner_id, 'comment', new.user_id, d.app_id, new.id);
  return null;
end;
$$;
create trigger comments_notify after insert on public.comments
  for each row execute function public.notify_on_comment();

create function public.notify_on_feedback()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.apps where id = new.app_id;
  if tg_op = 'INSERT' then
    perform public.notify(owner, 'feedback', new.user_id, new.app_id, new.id);
  elsif old.helpful_at is null and new.helpful_at is not null then
    perform public.notify(new.user_id, 'helpful', owner, new.app_id, new.id);
  end if;
  return null;
end;
$$;
create trigger feedback_notify after insert or update of helpful_at on public.feedback
  for each row execute function public.notify_on_feedback();

create function public.notify_on_swap()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  from_owner uuid;
  to_owner uuid;
begin
  select owner_id into from_owner from public.apps where id = new.from_app;
  select owner_id into to_owner from public.apps where id = new.to_app;
  if tg_op = 'INSERT' then
    perform public.notify(to_owner, 'swap_request', from_owner, new.to_app, new.id);
  elsif old.status = 'pending' and new.status = 'accepted' then
    perform public.notify(from_owner, 'swap_accepted', to_owner, new.from_app, new.id);
  end if;
  return null;
end;
$$;
create trigger swaps_notify after insert or update of status on public.swaps
  for each row execute function public.notify_on_swap();

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('collaborate', 'hire', 'feedback', 'invest', 'fan')),
  note text not null default '' check (char_length(note) <= 280),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One connection (or request) per pair of people, either direction.
create unique index connections_one_per_pair
  on public.connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index connections_addressee_idx on public.connections (addressee_id, status);
create index connections_requester_idx on public.connections (requester_id, status);

alter table public.connections enable row level security;

create policy "People see their own connections"
  on public.connections for select
  to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

revoke insert, update, delete on public.connections from anon, authenticated;

create function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(a, b)
      and greatest(requester_id, addressee_id) = greatest(a, b)
  )
$$;

create function public.request_connection(p_to uuid, p_reason text, p_note text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing public.connections;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if p_to is null or p_to = uid or not exists (select 1 from public.profiles where id = p_to) then
    raise exception 'You can''t connect with that person.' using errcode = 'P0001';
  end if;
  if p_reason not in ('collaborate', 'hire', 'feedback', 'invest', 'fan') then
    raise exception 'Pick a reason to connect.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_note, '')) > 280 then
    raise exception 'Keep the note under 280 characters.' using errcode = 'P0001';
  end if;

  select * into existing from public.connections
    where least(requester_id, addressee_id) = least(uid, p_to)
      and greatest(requester_id, addressee_id) = greatest(uid, p_to)
    for update;

  if found then
    if existing.status = 'accepted' then
      raise exception 'You''re already connected.' using errcode = 'P0001';
    end if;
    if existing.status = 'pending' and existing.requester_id = p_to then
      -- They already asked you: connecting back accepts it.
      update public.connections set status = 'accepted', responded_at = now() where id = existing.id;
      return 'accepted';
    end if;
    if existing.status = 'pending' then
      raise exception 'Your request is waiting for an answer.' using errcode = 'P0001';
    end if;
    if existing.responded_at > now() - interval '30 days' then
      raise exception 'You can ask again 30 days after a request is declined.' using errcode = 'P0001';
    end if;
    delete from public.connections where id = existing.id;
  end if;

  if (
    select count(*) from public.connections where requester_id = uid and created_at > now() - interval '24 hours'
  ) >= 30 then
    raise exception 'That''s a lot of requests today. Try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.connections (requester_id, addressee_id, reason, note)
  values (uid, p_to, p_reason, btrim(coalesce(p_note, '')));
  return 'requested';
end;
$$;

create function public.respond_connection(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.connections
    set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
    where id = p_id and addressee_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'No pending request to answer.' using errcode = 'P0001';
  end if;
end;
$$;

-- Withdraw a request or remove a connection (either person).
create function public.remove_connection(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.connections
    where id = p_id and auth.uid() in (requester_id, addressee_id) and status in ('pending', 'accepted');
  if not found then
    raise exception 'Nothing to remove.' using errcode = 'P0001';
  end if;
end;
$$;

create function public.track_connections()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.addressee_id, 'connection_request', new.requester_id, null, new.id);
  elsif tg_op = 'UPDATE' and old.status <> 'accepted' and new.status = 'accepted' then
    update public.profiles set connection_count = connection_count + 1 where id in (new.requester_id, new.addressee_id);
    perform public.notify(new.requester_id, 'connection_accepted', new.addressee_id, null, new.id);
  elsif tg_op = 'DELETE' and old.status = 'accepted' then
    update public.profiles set connection_count = greatest(connection_count - 1, 0)
      where id in (old.requester_id, old.addressee_id);
  end if;
  return null;
end;
$$;
create trigger connections_track after insert or update of status or delete on public.connections
  for each row execute function public.track_connections();

-- ---------------------------------------------------------------------------
-- Messages (only between connected people)
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create index messages_recipient_idx on public.messages (recipient_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index messages_unread_idx on public.messages (recipient_id) where read_at is null;

alter table public.messages enable row level security;

create policy "People see their own messages"
  on public.messages for select
  to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

create policy "Connected people can message each other"
  on public.messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and public.are_connected(sender_id, recipient_id)
  );

revoke insert, update, delete on public.messages from anon, authenticated;
grant insert (sender_id, recipient_id, body) on public.messages to authenticated;

create function public.mark_thread_read(p_other uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages set read_at = now()
  where recipient_id = auth.uid() and sender_id = p_other and read_at is null
$$;

-- ---------------------------------------------------------------------------
-- Q&A
-- ---------------------------------------------------------------------------

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 5 and 500),
  answer_count integer not null default 0,
  vote_count integer not null default 0,
  best_answer_id uuid,
  created_at timestamptz not null default now()
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  vote_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.questions
  add constraint questions_best_answer_fkey foreign key (best_answer_id) references public.answers (id) on delete set null;

create index questions_app_idx on public.questions (app_id, created_at desc);
create index answers_question_idx on public.answers (question_id, created_at);

create table public.question_votes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  primary key (user_id, question_id)
);

create table public.answer_votes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer_id uuid not null references public.answers (id) on delete cascade,
  primary key (user_id, answer_id)
);

alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.question_votes enable row level security;
alter table public.answer_votes enable row level security;

create policy "Questions are public" on public.questions for select using (true);
create policy "Answers are public" on public.answers for select using (true);

create policy "People ask as themselves" on public.questions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "People delete their own questions" on public.questions for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "People answer as themselves" on public.answers for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "People delete their own answers" on public.answers for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "People see their own question votes" on public.question_votes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "People vote on others' questions" on public.question_votes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not exists (select 1 from public.questions q where q.id = question_id and q.user_id = (select auth.uid()))
  );
create policy "People take back their question votes" on public.question_votes for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "People see their own answer votes" on public.answer_votes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "People vote on others' answers" on public.answer_votes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not exists (select 1 from public.answers a where a.id = answer_id and a.user_id = (select auth.uid()))
  );
create policy "People take back their answer votes" on public.answer_votes for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update on public.questions, public.answers, public.question_votes, public.answer_votes
  from anon, authenticated;
grant insert (app_id, user_id, body) on public.questions to authenticated;
grant insert (question_id, user_id, body) on public.answers to authenticated;
grant insert (user_id, question_id) on public.question_votes to authenticated;
grant insert (user_id, answer_id) on public.answer_votes to authenticated;

-- Counters, reputation and notifications.
create function public.track_questions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.apps where id = new.app_id;
  perform public.notify(owner, 'question', new.user_id, new.app_id, new.id);
  return null;
end;
$$;
create trigger questions_track after insert on public.questions
  for each row execute function public.track_questions();

create function public.track_answers()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  q public.questions;
begin
  if tg_op = 'INSERT' then
    update public.questions set answer_count = answer_count + 1 where id = new.question_id returning * into q;
    perform public.notify(q.user_id, 'answer', new.user_id, q.app_id, q.id);
  else
    update public.questions set answer_count = greatest(answer_count - 1, 0) where id = old.question_id;
  end if;
  return null;
end;
$$;
create trigger answers_track after insert or delete on public.answers
  for each row execute function public.track_answers();

-- A deleted answer takes its reputation with it: its upvotes, and +5 if it was
-- the best answer. Runs before the delete, while best_answer_id still points here.
create function public.answer_reputation_on_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lost integer := old.vote_count;
begin
  if exists (select 1 from public.questions where id = old.question_id and best_answer_id = old.id) then
    lost := lost + 5;
  end if;
  update public.profiles set reputation = greatest(reputation - lost, 0) where id = old.user_id;
  return old;
end;
$$;
create trigger answers_reputation before delete on public.answers
  for each row execute function public.answer_reputation_on_delete();

create function public.track_question_votes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.questions set vote_count = vote_count + 1 where id = new.question_id;
  else
    update public.questions set vote_count = greatest(vote_count - 1, 0) where id = old.question_id;
  end if;
  return null;
end;
$$;
create trigger question_votes_track after insert or delete on public.question_votes
  for each row execute function public.track_question_votes();

-- Each upvote on an answer is +1 reputation for whoever wrote it.
create function public.track_answer_votes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
begin
  if tg_op = 'INSERT' then
    update public.answers set vote_count = vote_count + 1 where id = new.answer_id returning user_id into author;
    update public.profiles set reputation = reputation + 1 where id = author;
  else
    update public.answers set vote_count = greatest(vote_count - 1, 0) where id = old.answer_id returning user_id into author;
    update public.profiles set reputation = greatest(reputation - 1, 0) where id = author;
  end if;
  return null;
end;
$$;
create trigger answer_votes_track after insert or delete on public.answer_votes
  for each row execute function public.track_answer_votes();

-- The asker or the app's builder picks the best answer: +5 reputation to its
-- author. Picking a different one moves the points.
create function public.mark_best_answer(p_question uuid, p_answer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  q public.questions;
  new_author uuid;
  old_author uuid;
begin
  select qq.* into q
    from public.questions qq join public.apps a on a.id = qq.app_id
    where qq.id = p_question and uid in (qq.user_id, a.owner_id)
    for update of qq;
  if not found then
    raise exception 'Only the person who asked or the app''s builder can pick the best answer.' using errcode = 'P0001';
  end if;
  select user_id into new_author from public.answers where id = p_answer and question_id = p_question;
  if new_author is null then
    raise exception 'That answer isn''t on this question.' using errcode = 'P0001';
  end if;
  if q.best_answer_id = p_answer then
    return;
  end if;
  if q.best_answer_id is not null then
    select user_id into old_author from public.answers where id = q.best_answer_id;
    update public.profiles set reputation = greatest(reputation - 5, 0) where id = old_author;
  end if;
  update public.questions set best_answer_id = p_answer where id = p_question;
  update public.profiles set reputation = reputation + 5 where id = new_author;
  perform public.notify(new_author, 'best_answer', uid, q.app_id, q.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Builders like you
-- ---------------------------------------------------------------------------

-- Scores other builders by shared app categories (from what you build, like
-- and test) and shared skills. Leaves out people you already follow.
create function public.suggest_builders(p_limit integer default 6)
returns table (id uuid, username text, display_name text, roles text[], shared_categories text[], shared_skills text[], score integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as uid
  ),
  my_categories as (
    select a.category from public.apps a, me where a.owner_id = me.uid
    union
    select a.category from public.likes l join public.drops d on d.id = l.drop_id join public.apps a on a.id = d.app_id, me
      where l.user_id = me.uid
    union
    select a.category from public.feedback f join public.apps a on a.id = f.app_id, me where f.user_id = me.uid
  ),
  my_skills as (
    select distinct lower(s) as skill from public.profiles p, me, unnest(p.skills) s where p.id = me.uid
  ),
  scored as (
    select
      p.id, p.username, p.display_name, p.roles,
      array(
        select distinct a.category from public.apps a
        where a.owner_id = p.id and a.link_checked_at is not null and a.category in (select category from my_categories)
      ) as shared_categories,
      array(select distinct s from unnest(p.skills) s where lower(s) in (select skill from my_skills)) as shared_skills
    from public.profiles p, me
    where me.uid is not null
      and p.id <> me.uid
      and not exists (select 1 from public.follows f where f.follower_id = me.uid and f.following_id = p.id)
  )
  select id, username, display_name, roles, shared_categories, shared_skills,
         (2 * cardinality(shared_categories) + cardinality(shared_skills))::integer as score
  from scored
  where cardinality(shared_categories) + cardinality(shared_skills) > 0
  order by score desc, username
  limit least(greatest(coalesce(p_limit, 6), 1), 20)
$$;

-- ---------------------------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------------------------

revoke execute on function public.mark_notifications_read() from public, anon;
revoke execute on function public.are_connected(uuid, uuid) from public, anon;
revoke execute on function public.request_connection(uuid, text, text) from public, anon;
revoke execute on function public.respond_connection(uuid, boolean) from public, anon;
revoke execute on function public.remove_connection(uuid) from public, anon;
revoke execute on function public.mark_thread_read(uuid) from public, anon;
revoke execute on function public.mark_best_answer(uuid, uuid) from public, anon;
revoke execute on function public.suggest_builders(integer) from public, anon;

grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.are_connected(uuid, uuid) to authenticated;
grant execute on function public.request_connection(uuid, text, text) to authenticated;
grant execute on function public.respond_connection(uuid, boolean) to authenticated;
grant execute on function public.remove_connection(uuid) to authenticated;
grant execute on function public.mark_thread_read(uuid) to authenticated;
grant execute on function public.mark_best_answer(uuid, uuid) to authenticated;
grant execute on function public.suggest_builders(integer) to authenticated;
