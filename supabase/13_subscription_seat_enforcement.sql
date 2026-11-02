-- =====================================================================
-- 13_subscription_seat_enforcement.sql
-- StockItEase - Subscription Validity & Database-Enforced Seat Limits
-- Idempotent script. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Subscription-aware my_company() with 7-day grace period
-- ---------------------------------------------------------------------
create or replace function public.my_company() returns uuid
language sql stable security definer set search_path = public as $$
  select p.company_id
  from public.profiles p
  join public.organizations o on o.id = p.company_id
  where p.id = auth.uid()
    and p.active = true
    and o.active = true
    and coalesce(o.data->>'subscriptionStatus', 'active') in ('active', 'trial')
    and (
      o.data->>'subscriptionValidUntil' is null
      or trim(o.data->>'subscriptionValidUntil') = ''
      -- Statutory 7-day grace period after valid_until date
      or (o.data->>'subscriptionValidUntil')::date + interval '7 days' >= (now() at time zone 'Asia/Kolkata')::date
    );
$$;

-- ---------------------------------------------------------------------
-- 2. Single source of truth for plan limits & seat enforcement trigger
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_seat_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org record;
  v_plan text;
  v_max_users int;
  v_current_active int;
begin
  -- Enforce on profile insertion or on reactivation (active: false -> true)
  if new.active and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and not old.active)) then
    if new.company_id is null then
      return new;
    end if;

    select id, data, active into v_org
    from public.organizations
    where id = new.company_id;

    if not found then
      raise exception 'Organization not found';
    end if;

    v_plan := coalesce(v_org.data->>'plan', 'Starter');
    v_max_users := coalesce(
      (v_org.data->>'maxUsers')::int,
      case v_plan
        when 'Enterprise' then 50
        when 'Professional' then 15
        else 5
      end
    );

    select count(*) into v_current_active
    from public.profiles
    where company_id = new.company_id
      and active = true
      and (tg_op = 'INSERT' or id <> new.id);

    if v_current_active >= v_max_users then
      raise exception 'Organization user seat limit reached (% active seats on % plan). Please upgrade the plan to add or reactivate team members.', v_max_users, v_plan;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_profile_seat_limit on public.profiles;
create trigger trg_guard_profile_seat_limit
  before insert or update of active on public.profiles
  for each row execute function public.guard_profile_seat_limit();
