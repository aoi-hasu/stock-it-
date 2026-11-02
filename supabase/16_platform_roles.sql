-- =====================================================================
-- 16_platform_roles.sql
-- StockItEase - Platform staff roles: owner / manager / support
--   owner   : everything, manages platform staff
--   manager : create/suspend companies, plans, READ-ONLY view of company data
--   support : view companies, view company users, reset a client's password
-- Idempotent. Safe to re-run. Run AFTER 12, 13, 14, 15.
-- =====================================================================

-- 1. Extend platform_admins
alter table public.platform_admins add column if not exists role   text;
alter table public.platform_admins add column if not exists name   text;
alter table public.platform_admins add column if not exists email  text;
alter table public.platform_admins add column if not exists active boolean not null default true;

-- every row that existed before this script is the founder -> owner
update public.platform_admins set role = 'owner' where role is null;
alter table public.platform_admins alter column role set default 'support';
alter table public.platform_admins alter column role set not null;
alter table public.platform_admins drop constraint if exists platform_admins_role_check;
alter table public.platform_admins add constraint platform_admins_role_check
  check (role in ('owner','manager','support'));

-- 2. Helpers
create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = p_user_id and active = true);
$$;

create or replace function public.platform_role(p_user_id uuid default auth.uid())
returns text
language sql stable security definer set search_path = public as $$
  select role from public.platform_admins where user_id = p_user_id and active = true;
$$;

-- who may READ client business data (owner + manager only, never support)
create or replace function public.platform_can_view_data()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.platform_role(auth.uid()) in ('owner','manager'), false);
$$;

revoke all on function public.platform_role(uuid) from public, anon;
revoke all on function public.platform_can_view_data() from public, anon;
grant execute on function public.platform_role(uuid) to authenticated;
grant execute on function public.platform_can_view_data() to authenticated;

-- 3. Support View recording: owner/manager only
create or replace function public.record_platform_support_access(p_company_id uuid, p_what text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if not public.platform_can_view_data() then
    raise exception 'Unauthorized: only platform owner or manager may open Support View';
  end if;
  insert into public.platform_access_logs (admin_id, company_id, what)
  values (v_uid, p_company_id, p_what);
  return jsonb_build_object('success', true, 'companyId', p_company_id, 'what', p_what);
end $$;

-- 4. READ-ONLY access to client data for owner/manager (Support View).
--    Select only. No insert/update/delete is granted, so Support View cannot change client data.
do $$
declare t text;
begin
  foreach t in array array[
    'leads','customers','contacts','products','inventory_transactions','quotations',
    'orders','payments','follow_ups','tasks','communications','documents',
    'tax_invoices','purchase_orders','company_settings','profiles','organizations','audit_logs'
  ] loop
    execute format('drop policy if exists "platform viewer read" on public.%I', t);
    execute format(
      'create policy "platform viewer read" on public.%I for select to authenticated using (public.platform_can_view_data())', t);
  end loop;
end $$;

-- 5. Platform access log is visible to owner + manager only
drop policy if exists "platform admins see access logs" on public.platform_access_logs;
create policy "platform admins see access logs" on public.platform_access_logs
  for select to authenticated using (public.platform_can_view_data());
