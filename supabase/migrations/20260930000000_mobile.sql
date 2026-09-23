-- The mobile app records its "Try it" taps as their own source, so builders
-- can see how many tries come from the app. Must match TRY_SOURCES in
-- src/lib/constants.ts.

alter table public.try_clicks drop constraint try_clicks_source_check;
alter table public.try_clicks add constraint try_clicks_source_check
  check (source in ('feed', 'page', 'card', 'embed', 'sponsor', 'api', 'share', 'app', 'direct'));
