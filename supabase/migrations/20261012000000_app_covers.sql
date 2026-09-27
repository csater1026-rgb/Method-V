-- Method V: app cover images. A builder can pick the picture their app shows
-- on Browse, Featured and every app card, instead of the frame taken from
-- their Drop. A wide JPEG (16:9) in their own folder of the "drops" bucket
-- (drops/<user id>/appcover-....jpg, which the bucket's policies already
-- allow); cover_path points at it. Empty means the Drop's frame, as before.
--
-- Safe to run more than once.

alter table public.apps add column if not exists cover_path text;

alter table public.apps drop constraint if exists apps_cover_path_check;
alter table public.apps add constraint apps_cover_path_check
  check (cover_path is null or (char_length(cover_path) <= 200 and cover_path ~ '^[0-9a-f-]{36}/appcover-[0-9]+\.jpg$'));

-- Only ever a file in the builder's own folder.
alter table public.apps drop constraint if exists apps_cover_own_folder;
alter table public.apps add constraint apps_cover_own_folder
  check (cover_path is null or split_part(cover_path, '/', 1) = owner_id::text);

grant insert (cover_path), update (cover_path) on public.apps to authenticated;
