-- Method V: an extra app post in the V Store now costs 15 Methodium (was
-- 30). Still up to 2 every 30 days. Pro stays 50.
--
-- Mirrors V_STORE in src/lib/constants.ts.
--
-- Needs 20261021000000_v_store.sql.
-- Safe to run more than once.

-- Buy something. Returns nothing; errors explain what's wrong.
create or replace function public.buy_store_item(p_item text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  bought integer;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  -- One purchase at a time per person, so two taps can't both get through.
  perform 1 from public.profiles where id = uid for update;

  if p_item = 'pro' then
    perform public.require_credits(uid, 50);
    insert into public.store_purchases (user_id, item, cost) values (uid, 'pro', 50);
    insert into public.credit_events (user_id, delta, reason) values (uid, -50, 'store_pro');
    update public.profiles
      set pro_until = greatest(coalesce(pro_until, now()), now()) + interval '30 days'
      where id = uid;
  elsif p_item = 'app_post' then
    select count(*) into bought
    from public.store_purchases
    where user_id = uid and item = 'app_post' and created_at > now() - interval '30 days';
    if bought >= 2 then
      raise exception 'You can buy 2 extra app posts every 30 days.' using errcode = 'P0001';
    end if;
    perform public.require_credits(uid, 15);
    insert into public.store_purchases (user_id, item, cost) values (uid, 'app_post', 15);
    insert into public.credit_events (user_id, delta, reason) values (uid, -15, 'store_app_post');
    update public.profiles set extra_app_posts = extra_app_posts + 1 where id = uid;
  else
    raise exception 'That isn''t in the V Store.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.buy_store_item(text) from public, anon;
grant execute on function public.buy_store_item(text) to authenticated;
