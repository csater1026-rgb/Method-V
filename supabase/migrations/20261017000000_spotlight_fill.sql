-- Method V: Today's picks on the Spotlight stage. While this promotion runs,
-- Spotlight spots nobody paid for are filled with different unpaid apps each
-- day (see src/lib/spotlight-stage.ts). Paid Spotlights always come first.
--
-- To stop it: in the Supabase table editor, set ends_at on the
-- "spotlight_fill" row of public.promotions to a time in the past (or delete
-- the row). To start it again, set ends_at in the future. amount and per_day
-- aren't used for this one.
--
-- Needs 20261016000000_drop_bonus.sql (it creates public.promotions).
-- Safe to run more than once.

insert into public.promotions (slug, amount, starts_at, ends_at, per_day)
values ('spotlight_fill', 1, now(), '2100-01-01 00:00:00+00', 1)
on conflict (slug) do nothing;
