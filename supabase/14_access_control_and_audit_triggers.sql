-- =====================================================================
-- 14_access_control_and_audit_triggers.sql
-- StockItEase - Company Access Control, Scoped Notifications, Database Audit Triggers & Secure Password Acknowledgment
-- Idempotent script. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Helper function for sales visibility (setting 'all' vs 'own')
-- ---------------------------------------------------------------------
create or replace function public.sales_can_see(p_created_by uuid, p_data jsonb)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := public.my_role();
  v_cid uuid := public.my_company();
  v_visibility text;
begin
  if v_cid is null then return false; end if;

  -- Owners, admins, and managers see all records in their organization
  if v_role in ('super_admin', 'owner', 'admin', 'manager', 'sales_manager', 'inventory_manager', 'accounts') then
    return true;
  end if;

  -- If role is salesperson, check company setting salesVisibility
  select coalesce(data->>'salesVisibility', 'all') into v_visibility
  from public.company_settings
  where company_id = v_cid;

  if coalesce(v_visibility, 'all') = 'all' then
    return true;
  end if;

  -- If 'own', salesperson can only access records created by them or assigned to them
  if p_created_by = auth.uid()
     or (p_data->>'assignedSalespersonId') = auth.uid()::text
     or (p_data->>'salespersonId') = auth.uid()::text
     or (p_data->>'assignedToId') = auth.uid()::text
     or (p_data->>'userId') = auth.uid()::text then
    return true;
  end if;

  return false;
end $$;

revoke all on function public.sales_can_see(uuid, jsonb) from public, anon;
grant execute on function public.sales_can_see(uuid, jsonb) to authenticated;

-- Apply sales_can_see to SELECT policies on business tables
do $$
declare
  t text;
  business_tables text[] := array['leads', 'customers', 'quotations', 'orders', 'follow_ups', 'tasks'];
begin
  foreach t in array business_tables loop
    execute format('drop policy if exists "see company data" on public.%I;', t);
    execute format('drop policy if exists "see company data with visibility" on public.%I;', t);
    execute format(
      'create policy "see company data with visibility" on public.%I for select to authenticated using (company_id = public.my_company() and public.sales_can_see(created_by, data));',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Scope notifications by recipient_user_id
-- ---------------------------------------------------------------------
alter table public.notifications add column if not exists recipient_user_id uuid references auth.users(id) on delete cascade;
create index if not exists notifications_recipient_idx on public.notifications (recipient_user_id);

drop policy if exists "see company notifications" on public.notifications;
drop policy if exists "see own notifications" on public.notifications;
create policy "see own notifications" on public.notifications
  for select to authenticated
  using (
    company_id = public.my_company()
    and (recipient_user_id = auth.uid() or recipient_user_id is null)
  );

-- ---------------------------------------------------------------------
-- 3. Database Audit Triggers & Secure Server Audit Function
-- ---------------------------------------------------------------------
create or replace function public.log_table_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cid uuid;
  v_uid uuid := auth.uid();
  v_entity text := tg_table_name;
  v_eid text;
  v_details text;
begin
  if tg_op = 'DELETE' then
    v_cid := old.company_id;
    v_eid := old.id;
    v_details := format('Deleted record in %s (ID: %s)', v_entity, old.id);
  elsif tg_op = 'INSERT' then
    v_cid := new.company_id;
    v_eid := new.id;
    v_details := format('Created %s record %s', v_entity, coalesce(new.data->>'invoiceNumber', new.data->>'orderNumber', new.data->>'quotationNumber', new.data->>'name', new.data->>'companyName', new.id));
  elsif tg_op = 'UPDATE' then
    v_cid := new.company_id;
    v_eid := new.id;
    v_details := format('Updated %s record %s', v_entity, coalesce(new.data->>'invoiceNumber', new.data->>'orderNumber', new.data->>'quotationNumber', new.data->>'name', new.data->>'companyName', new.id));
  end if;

  if v_cid is not null then
    insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
    values (v_cid, v_uid, format('%s %s', v_entity, tg_op), v_entity, coalesce(v_eid, 'N/A'), v_details);
  end if;

  return null;
end $$;

-- Attach audit trigger to key business tables
do $$
declare
  t text;
  monitored_tables text[] := array[
    'leads', 'customers', 'products', 'quotations', 'orders',
    'tax_invoices', 'payments', 'purchase_orders'
  ];
begin
  foreach t in array monitored_tables loop
    execute format('drop trigger if exists trg_audit_%I on public.%I;', t, t);
    execute format('create trigger trg_audit_%I after insert or update or delete on public.%I for each row execute function public.log_table_change();', t, t);
  end loop;
end $$;

-- Revoke direct INSERT on audit_logs from authenticated
revoke insert, update, delete on public.audit_logs from authenticated, anon, public;

-- Server-side function for custom audit events
create or replace function public.record_audit_log(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_details text
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_cid uuid := public.my_company();
  v_uid uuid := auth.uid();
begin
  if v_cid is null then return false; end if;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (v_cid, v_uid, p_action, p_entity, p_entity_id, p_details);

  return true;
end $$;

revoke all on function public.record_audit_log(text, text, text, text) from public, anon;
grant execute on function public.record_audit_log(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Fix forced-password-change bypass
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists password_changed_at timestamptz;

-- Record password change timestamp when user updates their password
create or replace function public.record_password_change_time()
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  u_id uuid := auth.uid();
begin
  if u_id is null then raise exception 'Unauthorized'; end if;

  update public.profiles
  set password_changed_at = now()
  where id = u_id;

  return true;
end $$;

revoke all on function public.record_password_change_time() from public, anon;
grant execute on function public.record_password_change_time() to authenticated;

-- ack_password_changed verifies that password_changed_at is newer than password_reset_at
create or replace function public.ack_password_changed()
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  u_id uuid := auth.uid();
  p_rec record;
begin
  if u_id is null then raise exception 'Unauthorized'; end if;

  select id, must_change_password, password_reset_at, password_changed_at into p_rec
  from public.profiles where id = u_id;

  if not found then raise exception 'User profile not found'; end if;

  if not p_rec.must_change_password then return true; end if;

  -- Ensure user actually changed password
  if p_rec.password_changed_at is null or (p_rec.password_reset_at is not null and p_rec.password_changed_at < p_rec.password_reset_at) then
    raise exception 'Password has not been changed since reset was initiated. Please submit a new password first.';
  end if;

  perform set_config('app.ack_password', 'on', true);
  update public.profiles set must_change_password = false where id = u_id;
  perform set_config('app.ack_password', 'off', true);

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (public.my_company(), u_id, 'Password Changed', 'User', u_id::text,
          'User changed temporary password and acknowledged credentials');

  return true;
end $$;

revoke all on function public.ack_password_changed() from public, anon;
grant execute on function public.ack_password_changed() to authenticated;
