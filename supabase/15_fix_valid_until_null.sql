-- 15_fix_valid_until_null.sql  (safe to re-run)
-- 1. Clean bad "null" text stored as the subscription end date.
update public.organizations
set data = jsonb_set(data, '{subscriptionValidUntil}', '""'::jsonb)
where lower(trim(coalesce(data->>'subscriptionValidUntil',''))) in ('null','undefined');

-- 2. Make my_company() tolerate any non-date value instead of crashing.
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
      coalesce(trim(o.data->>'subscriptionValidUntil'), '') !~ '^\d{4}-\d{2}-\d{2}'
      or left(trim(o.data->>'subscriptionValidUntil'), 10)::date + interval '7 days'
         >= (now() at time zone 'Asia/Kolkata')::date
    );
$$;
