-- =====================================================================
-- 12_platform_admin_and_support.sql
-- StockItEase - Platform Admin Model & Audited Support View
-- Idempotent script. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table: platform_admins (Distinct platform developer identity)
-- ---------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

drop policy if exists "platform admins see self" on public.platform_admins;
create policy "platform admins see self" on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid());

-- Helper: Check if current caller is a platform admin
create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins where user_id = p_user_id
  );
$$;

revoke all on function public.is_platform_admin(uuid) from public, anon;
grant execute on function public.is_platform_admin(uuid) to authenticated;

-- Allow platform developers to exist in profiles without being bound to a client company
alter table public.profiles alter column company_id drop not null;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin','owner','admin','manager','sales_manager','salesperson','inventory_manager','accounts','platform_admin'));

-- ---------------------------------------------------------------------
-- 2. Table: platform_access_logs (Audited Support View)
-- ---------------------------------------------------------------------
create table if not exists public.platform_access_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references auth.users(id) on delete cascade,
  company_id  uuid not null references public.organizations(id) on delete cascade,
  what        text not null,
  ip_address  text,
  accessed_at timestamptz not null default now()
);

create index if not exists platform_access_logs_admin_idx on public.platform_access_logs (admin_id);
create index if not exists platform_access_logs_company_idx on public.platform_access_logs (company_id);

alter table public.platform_access_logs enable row level security;

drop policy if exists "platform admins see access logs" on public.platform_access_logs;
create policy "platform admins see access logs" on public.platform_access_logs
  for select to authenticated
  using (public.is_platform_admin());

-- RPC to record support mode access
create or replace function public.record_platform_support_access(p_company_id uuid, p_what text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_platform_admin(v_uid) then
    raise exception 'Unauthorized: Caller is not a platform administrator';
  end if;

  insert into public.platform_access_logs (admin_id, company_id, what)
  values (v_uid, p_company_id, p_what);

  return jsonb_build_object('success', true, 'companyId', p_company_id, 'what', p_what);
end $$;

revoke all on function public.record_platform_support_access(uuid, text) from public, anon;
grant execute on function public.record_platform_support_access(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. platform_metrics: Per-client reporting
-- ---------------------------------------------------------------------
create or replace function public.get_platform_metrics()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb := '[]'::jsonb;
  org record;
  user_cnt bigint;
  last_act text;
begin
  if not public.is_platform_admin(v_uid) then
    raise exception 'Unauthorized: Caller is not a platform administrator';
  end if;

  for org in
    select id, name, code, active, data, created_at
    from public.organizations
    order by created_at desc
  loop
    -- Active user count
    select count(*) into user_cnt
    from public.profiles
    where company_id = org.id and active = true;

    -- Last activity timestamp from audit logs
    select created_at::text into last_act
    from public.audit_logs
    where company_id = org.id
    order by created_at desc
    limit 1;

    v_result := v_result || jsonb_build_object(
      'id', org.id,
      'name', org.name,
      'code', org.code,
      'active', org.active,
      'plan', coalesce(org.data->>'plan', 'Starter'),
      'maxUsers', coalesce((org.data->>'maxUsers')::numeric, 5),
      'subscriptionStatus', coalesce(org.data->>'subscriptionStatus', case when org.active then 'active' else 'suspended' end),
      'subscriptionValidUntil', org.data->>'subscriptionValidUntil',
      'userCount', user_cnt,
      'lastActivity', last_act,
      'createdAt', org.created_at
    );
  end loop;

  return v_result;
end $$;

revoke all on function public.get_platform_metrics() from public, anon;
grant execute on function public.get_platform_metrics() to authenticated;
