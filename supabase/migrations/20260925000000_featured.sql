-- Featured apps on the home feed.
--
-- An app is featured while featured_until is in the future. For now it's set
-- by hand (Supabase table editor or SQL); launch days and boosts will set it
-- later. People can't set it on their own apps: the column isn't in any
-- grant to anon/authenticated.
--
--   update public.apps set featured_until = now() + interval '7 days' where slug = 'my-app';

alter table public.apps add column featured_until timestamptz;

create index apps_featured_idx on public.apps (featured_until desc) where featured_until is not null;
