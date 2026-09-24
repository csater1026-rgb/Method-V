-- Method V: more social handles on profiles, shown under the builder's name.
-- Handles only (no @); the site builds the links.
--
-- Safe to run more than once.

alter table public.profiles add column if not exists instagram_handle text;
alter table public.profiles add column if not exists tiktok_handle text;
alter table public.profiles add column if not exists youtube_handle text;
alter table public.profiles add column if not exists threads_handle text;

alter table public.profiles drop constraint if exists profiles_instagram_handle_check;
alter table public.profiles add constraint profiles_instagram_handle_check
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');
alter table public.profiles drop constraint if exists profiles_tiktok_handle_check;
alter table public.profiles add constraint profiles_tiktok_handle_check
  check (tiktok_handle is null or tiktok_handle ~ '^[A-Za-z0-9._]{2,24}$');
alter table public.profiles drop constraint if exists profiles_youtube_handle_check;
alter table public.profiles add constraint profiles_youtube_handle_check
  check (youtube_handle is null or youtube_handle ~ '^[A-Za-z0-9._-]{3,30}$');
alter table public.profiles drop constraint if exists profiles_threads_handle_check;
alter table public.profiles add constraint profiles_threads_handle_check
  check (threads_handle is null or threads_handle ~ '^[A-Za-z0-9._]{1,30}$');

grant update (instagram_handle, tiktok_handle, youtube_handle, threads_handle) on public.profiles to authenticated;
