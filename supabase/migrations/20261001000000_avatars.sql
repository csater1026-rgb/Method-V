-- Method V: profile photos. A photo is a small square JPEG the builder uploads
-- into their own folder in the "drops" bucket (drops/<user id>/avatar-....jpg,
-- which the bucket's policies already allow); avatar_path points at it. Empty
-- means the colored letter avatar.
--
-- Safe to run more than once.

alter table public.profiles add column if not exists avatar_path text;

alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles add constraint profiles_avatar_path_check
  check (avatar_path is null or (char_length(avatar_path) <= 200 and avatar_path ~ '^[0-9a-f-]{36}/avatar-[0-9]+\.jpg$'));

-- Only ever a file in the person's own folder.
alter table public.profiles drop constraint if exists profiles_avatar_own_folder;
alter table public.profiles add constraint profiles_avatar_own_folder
  check (avatar_path is null or split_part(avatar_path, '/', 1) = id::text);

grant update (avatar_path) on public.profiles to authenticated;
