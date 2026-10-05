-- Method V: up to 3 new apps per person every 30 days.
--
-- Keeps the feed and the Spotlight fair: nobody can flood Method V with
-- apps. It counts apps posted in the last 30 days (so the next one opens 30
-- days after the oldest of the 3). Adding a new Drop to an app you already
-- posted is never limited. Mirrors APP_LIMIT in src/lib/constants.ts.
--
-- Only people posting for themselves are limited (the site and the phone
-- app); the server's own key and the Supabase dashboard aren't.
--
-- Safe to run more than once.

create index if not exists apps_owner_created_idx on public.apps (owner_id, created_at desc);

create or replace function public.limit_new_apps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
  oldest timestamptz;
begin
  if auth.uid() is null then
    return new;
  end if;
  select count(*), min(created_at) into recent, oldest
  from public.apps
  where owner_id = new.owner_id and created_at > now() - interval '30 days';
  if recent >= 3 then
    raise exception 'You can post 3 apps every 30 days. Your next one opens on %. You can still add new Drops to the apps you''ve posted.',
      to_char((oldest + interval '30 days') at time zone 'America/Los_Angeles', 'FMMon FMDD')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.limit_new_apps() from public, anon, authenticated;

drop trigger if exists apps_limit_new on public.apps;
create trigger apps_limit_new before insert on public.apps
  for each row execute function public.limit_new_apps();
