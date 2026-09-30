-- Method V: screenshots on feedback. Testers can add up to 3 screenshots to
-- "What worked?" and up to 3 to "What confused you?". Feedback is private
-- between the tester and the builder, so the pictures live in their own
-- private "feedback" bucket (not the public "drops" one): only the tester who
-- uploaded them and the builder of the app they're about can open them, and
-- only through short-lived signed links.
--
-- Files: feedback/<tester id>/fb-<time>-<random>.jpg
--
-- Safe to run more than once.

-- Up to 3 of the tester's own files, each a JPEG in their folder.
create or replace function public.feedback_shots_ok(tester uuid, shots text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(shots), 0) <= 3
    and coalesce(bool_and(
      char_length(s) <= 120
      and s ~ '^[0-9a-f-]{36}/fb-[0-9]+-[a-z0-9]+\.jpg$'
      and split_part(s, '/', 1) = tester::text
    ), true)
  from unnest(shots) as s
$$;

alter table public.feedback add column if not exists worked_shots text[] not null default '{}';
alter table public.feedback add column if not exists confusing_shots text[] not null default '{}';

alter table public.feedback drop constraint if exists feedback_worked_shots_check;
alter table public.feedback add constraint feedback_worked_shots_check check (public.feedback_shots_ok(user_id, worked_shots));
alter table public.feedback drop constraint if exists feedback_confusing_shots_check;
alter table public.feedback add constraint feedback_confusing_shots_check check (public.feedback_shots_ok(user_id, confusing_shots));

grant insert (worked_shots, confusing_shots) on public.feedback to authenticated;

-- A private bucket: JPEGs only (the site shrinks every screenshot to one),
-- 3 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Testers upload feedback screenshots into their own folder" on storage.objects;
create policy "Testers upload feedback screenshots into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'feedback'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The tester sees their own; the builder sees the ones attached to feedback
-- on their apps. Nobody else, and there are no public links.
drop policy if exists "Testers and builders see feedback screenshots" on storage.objects;
create policy "Testers and builders see feedback screenshots"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'feedback'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.feedback f
        join public.apps a on a.id = f.app_id
        where a.owner_id = (select auth.uid())
          and (objects.name = any (f.worked_shots) or objects.name = any (f.confusing_shots))
      )
    )
  );

-- So a tester can clean up screenshots from feedback that didn't send.
drop policy if exists "Testers delete their own feedback screenshots" on storage.objects;
create policy "Testers delete their own feedback screenshots"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'feedback'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
