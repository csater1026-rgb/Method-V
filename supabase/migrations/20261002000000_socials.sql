-- Method V: more social handles on profiles, shown under the builder's name.
-- Handles only (no @); the site builds the links.

alter table public.profiles
  add column instagram_handle text check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'),
  add column tiktok_handle text check (tiktok_handle is null or tiktok_handle ~ '^[A-Za-z0-9._]{2,24}$'),
  add column youtube_handle text check (youtube_handle is null or youtube_handle ~ '^[A-Za-z0-9._-]{3,30}$'),
  add column threads_handle text check (threads_handle is null or threads_handle ~ '^[A-Za-z0-9._]{1,30}$');

grant update (instagram_handle, tiktok_handle, youtube_handle, threads_handle) on public.profiles to authenticated;
