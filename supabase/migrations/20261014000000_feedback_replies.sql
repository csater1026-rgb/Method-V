-- Method V: builders reply to feedback. The builder of an app can write one
-- reply on each piece of feedback about it (and change or clear it later).
-- Like the feedback itself, only the tester and the builder can see it. The
-- tester gets a notification (and a push, if they have feedback pushes on).
--
-- Safe to run more than once.

alter table public.feedback add column if not exists reply text not null default '';
alter table public.feedback add column if not exists replied_at timestamptz;

alter table public.feedback drop constraint if exists feedback_reply_check;
alter table public.feedback add constraint feedback_reply_check check (char_length(reply) <= 1000);

-- A new kind of notification: "@builder replied to your feedback on App".
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'follow', 'like', 'comment', 'feedback', 'helpful', 'feedback_reply',
    'connection_request', 'connection_accepted',
    'question', 'answer', 'best_answer', 'reply',
    'swap_request', 'swap_accepted',
    'backed', 'sponsor_offer', 'sponsor_accepted', 'sponsor_started', 'sponsor_ended',
    'job_application', 'application_shortlisted',
    'package_request', 'package_accepted', 'package_declined', 'package_delivered', 'package_completed',
    'package_refunded', 'package_problem'
  ));

-- The only way to write a reply: the app's builder, on feedback about it.
-- An empty reply removes it.
create or replace function public.reply_to_feedback(p_feedback_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  body text := btrim(coalesce(p_body, ''));
  f public.feedback;
begin
  if uid is null then
    raise exception 'Sign in to reply.' using errcode = 'P0001';
  end if;
  if char_length(body) > 1000 then
    raise exception 'Keep your reply under 1,000 characters.' using errcode = 'P0001';
  end if;
  select fb.* into f
  from public.feedback fb
  join public.apps a on a.id = fb.app_id
  where fb.id = p_feedback_id and a.owner_id = uid;
  if not found then
    raise exception 'You can only reply to feedback on your own apps.' using errcode = 'P0001';
  end if;

  update public.feedback
  set reply = body, replied_at = case when body = '' then null else now() end
  where id = f.id;

  -- Tell the tester about a new reply (not about edits or removals).
  if body <> '' and f.reply = '' then
    perform public.notify(f.user_id, 'feedback_reply', uid, f.app_id, f.id);
  end if;
end;
$$;

revoke execute on function public.reply_to_feedback(uuid, text) from public, anon;
grant execute on function public.reply_to_feedback(uuid, text) to authenticated;

-- Pushes: the same as before, plus replies to your feedback (under the
-- "feedback" switch).
create or replace function public.push_from_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uname text;
  who text;
  app_name text;
  app_slug text;
begin
  if new.kind not in ('follow', 'feedback', 'comment', 'question', 'connection_request', 'feedback_reply') then
    return null;
  end if;
  select username into uname from public.profiles where id = new.actor_id;
  who := coalesce('@' || uname, 'Someone');
  select name, slug into app_name, app_slug from public.apps where id = new.app_id;

  if new.kind = 'follow' then
    perform public.queue_push(new.user_id, 'follows', 'New follower', who || ' followed you', coalesce('/u/' || uname, '/'), new.actor_id);
  elsif new.kind = 'feedback' and app_slug is not null then
    perform public.queue_push(new.user_id, 'feedback', 'New feedback on ' || app_name, who || ' tried it and left feedback', '/apps/' || app_slug || '#feedback', new.actor_id);
  elsif new.kind = 'feedback_reply' and app_slug is not null then
    perform public.queue_push(new.user_id, 'feedback', 'Reply to your feedback', who || ' replied to your feedback on ' || app_name, '/apps/' || app_slug || '#feedback', new.actor_id);
  elsif new.kind = 'comment' and app_slug is not null then
    perform public.queue_push(new.user_id, 'feedback', 'New comment on ' || app_name, who || ' commented on your Drop', '/apps/' || app_slug || '#comments', new.actor_id);
  elsif new.kind = 'question' and app_slug is not null then
    perform public.queue_push(new.user_id, 'feedback', 'New question about ' || app_name, who || ' asked a question', '/q/' || new.ref_id, new.actor_id);
  elsif new.kind = 'connection_request' then
    perform public.queue_push(new.user_id, 'messages', 'New connection request', who || ' wants to connect', '/inbox', new.actor_id);
  end if;
  return null;
end;
$$;
