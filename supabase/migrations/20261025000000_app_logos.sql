-- Method V: app logos. A builder can add a square logo to their app; it shows
-- next to the name on cards (over the banner on Home, at the start of each
-- row on Browse). A square JPEG in their own folder of the "drops" bucket
-- (drops/<user id>/applogo-....jpg, which the bucket's policies already
-- allow); logo_path points at it. Empty means the app's first letter on a
-- color, drawn by the site.
--
-- Needs 20261024000000_economy_fixes.sql (schema_version).
-- Safe to run more than once.

alter table public.apps add column if not exists logo_path text;

alter table public.apps drop constraint if exists apps_logo_path_check;
alter table public.apps add constraint apps_logo_path_check
  check (logo_path is null or (char_length(logo_path) <= 200 and logo_path ~ '^[0-9a-f-]{36}/applogo-[0-9]+\.jpg$'));

-- Only ever a file in the builder's own folder.
alter table public.apps drop constraint if exists apps_logo_own_folder;
alter table public.apps add constraint apps_logo_own_folder
  check (logo_path is null or split_part(logo_path, '/', 1) = owner_id::text);

grant insert (logo_path), update (logo_path) on public.apps to authenticated;

-- Which update the database has (read by /api/health).
create or replace function public.schema_version()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20261025
$$;
revoke execute on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated;
