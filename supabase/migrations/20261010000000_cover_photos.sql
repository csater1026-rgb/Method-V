-- Method V: profile header pictures. A wide JPEG (3:1) the person uploads into
-- their own folder in the "drops" bucket (drops/<user id>/cover-....jpg, which
-- the bucket's policies already allow); cover_path points at it. It shows
-- behind their photo at the top of their profile page only. Empty means none.
--
-- Safe to run more than once.

alter table public.profiles add column if not exists cover_path text;

alter table public.profiles drop constraint if exists profiles_cover_path_check;
alter table public.profiles add constraint profiles_cover_path_check
  check (cover_path is null or (char_length(cover_path) <= 200 and cover_path ~ '^[0-9a-f-]{36}/cover-[0-9]+\.jpg$'));

-- Only ever a file in the person's own folder.
alter table public.profiles drop constraint if exists profiles_cover_own_folder;
alter table public.profiles add constraint profiles_cover_own_folder
  check (cover_path is null or split_part(cover_path, '/', 1) = id::text);

grant update (cover_path) on public.profiles to authenticated;
