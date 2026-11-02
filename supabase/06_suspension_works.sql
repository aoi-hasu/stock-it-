-- =====================================================================
-- 06_suspension_works.sql
-- StockItEase - Enforce Organization Suspension Across All Business Tables
-- When organizations.active = false, members of that organization see 0 rows.
-- =====================================================================

-- 1. Ensure my_company() verifies active organization status
create or replace function public.my_company() returns uuid
language sql stable security definer set search_path = public as $$
  select p.company_id
  from public.profiles p
  join public.organizations o on o.id = p.company_id
  where p.id = auth.uid()
    and p.active = true
    and o.active = true;
$$;

-- 2. Update organizations select policy
drop policy if exists "see own company" on public.organizations;
create policy "see own company" on public.organizations for select to authenticated
  using (id = public.my_company());

-- 3. Update profiles select policy so suspended companies see no members
drop policy if exists "see company people" on public.profiles;
create policy "see company people" on public.profiles for select to authenticated
  using (company_id = public.my_company());
