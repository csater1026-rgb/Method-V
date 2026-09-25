-- Method V: @methodv is Method V's own account, and the website and app draw
-- its handle with the logo's pixel V. Nobody else may take that name: not by
-- changing their username to it, and not when a new profile is made. The
-- account that already has it keeps it (and can save its profile as usual).
--
-- Safe to run more than once.

create or replace function public.reserve_official_handle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.username = 'methodv' and (tg_op = 'INSERT' or old.username is distinct from new.username) then
    raise exception 'That username is reserved.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_reserved_handle on public.profiles;
create trigger profiles_reserved_handle before insert or update of username on public.profiles
  for each row execute function public.reserve_official_handle();
