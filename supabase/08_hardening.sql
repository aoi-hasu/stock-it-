-- =====================================================================
-- 08_hardening.sql
-- StockItEase - Production Hardening Migration
-- Idempotent script applying security rules, numbering, RBAC,
-- and gap-free procedures. Run AFTER 01 through 07.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles table updates: password_reset_at & indexes
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists password_reset_at timestamptz default now();

-- Unique index on lowercase email to guarantee uniqueness across authentication
create unique index if not exists profiles_lower_email_idx on public.profiles (lower(email));

-- ---------------------------------------------------------------------
-- 2. next_seq_for (Service Role Only) with strict allow-list
-- ---------------------------------------------------------------------
create or replace function public.next_seq_for(p_company uuid, p_kind text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v bigint;
  allowed_kinds text[] := array['lead','customer','quotation','order','payment','invoice','purchase'];
begin
  if p_company is null then
    raise exception 'Company ID is required for sequence generation';
  end if;
  if not (p_kind = any(allowed_kinds) or p_kind like 'invoice-%') then
    raise exception 'Invalid counter kind: %', p_kind;
  end if;

  insert into public.counters as ct (company_id, kind, value)
  values (p_company, p_kind, 1)
  on conflict (company_id, kind) do update set value = ct.value + 1
  returning ct.value into v;

  return v;
end $$;

-- Revoke execute from public, anon, and authenticated so only service_role can call it
revoke all on function public.next_seq_for(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Restrict next_seq(p_kind text) to allowed kinds and authenticated callers
-- ---------------------------------------------------------------------
create or replace function public.next_seq(p_kind text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  c uuid := public.my_company();
  v bigint;
  allowed_kinds text[] := array['lead','customer','quotation','order','payment','invoice','purchase'];
begin
  if c is null then raise exception 'Unauthorized: No active company context'; end if;
  if not (p_kind = any(allowed_kinds) or p_kind like 'invoice-%') then
    raise exception 'Invalid counter kind: %', p_kind;
  end if;

  insert into public.counters as ct (company_id, kind, value)
  values (c, p_kind, 1)
  on conflict (company_id, kind) do update set value = ct.value + 1
  returning ct.value into v;

  return v;
end $$;
revoke all on function public.next_seq(text) from public, anon;
grant execute on function public.next_seq(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Tenant self-edit restrictions: drop owners edit company policy on organizations
-- ---------------------------------------------------------------------
drop policy if exists "owners edit company" on public.organizations;
-- Only platform functions (service role) can update organizations plan, code, active status, etc.
-- Authenticated users have strictly read-only access to their own organization row
drop policy if exists "see own company" on public.organizations;
create policy "see own company" on public.organizations for select to authenticated
  using (id = public.my_company());

-- ---------------------------------------------------------------------
-- 5. Profile Update Security & ack_password_changed
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  caller_role text := public.my_role();
begin
  if auth.uid() is null then return new; end if; -- service role allowed

  if new.company_id <> old.company_id then
    raise exception 'Company cannot be changed';
  end if;

  -- Users cannot clear must_change_password directly; must call ack_password_changed()
  if old.must_change_password and not new.must_change_password then
    raise exception 'must_change_password cannot be directly unset. Use ack_password_changed()';
  end if;

  if (new.role <> old.role or new.active <> old.active) then
    if caller_role not in ('super_admin','owner') then
      raise exception 'Only owners or super administrators can change user role or active status';
    end if;
    if old.id = auth.uid() then
      raise exception 'You cannot change your own role or active status';
    end if;
  end if;

  if old.role in ('super_admin','owner') and old.id <> auth.uid() and caller_role not in ('super_admin','owner') then
    raise exception 'Cannot edit an owner or super administrator profile';
  end if;

  return new;
end $$;

-- ack_password_changed function: only clears must_change_password after user authenticates and updates password
create or replace function public.ack_password_changed()
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  u_id uuid := auth.uid();
  p_rec record;
  u_updated_at timestamptz;
begin
  if u_id is null then
    raise exception 'Unauthorized';
  end if;

  select id, must_change_password, password_reset_at into p_rec
  from public.profiles
  where id = u_id;

  if not found then
    raise exception 'User profile not found';
  end if;

  -- Verify that auth.users.updated_at is newer than the time must_change_password was set
  select updated_at into u_updated_at from auth.users where id = u_id;
  if u_updated_at is not null and p_rec.password_reset_at is not null and u_updated_at < p_rec.password_reset_at then
    raise exception 'Password has not been updated since reset was requested.';
  end if;

  -- Direct update via security definer bypassing the guard trigger's direct check
  update public.profiles
  set must_change_password = false
  where id = u_id;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (public.my_company(), u_id, 'Password Changed', 'User', u_id::text, 'User successfully acknowledged and changed password');

  return true;
end $$;
revoke all on function public.ack_password_changed() from public, anon;
grant execute on function public.ack_password_changed() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Check duplicate lead RPC with indexed phone lookup
-- ---------------------------------------------------------------------
create or replace function public.check_duplicate_lead(p_mobile text, p_email text default '', p_exclude text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cid uuid := public.my_company();
  v_phone text := public.norm_phone_10(p_mobile);
  found_row record;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;

  if v_phone is not null and length(v_phone) >= 10 then
    select id, data into found_row
    from public.leads
    where company_id = v_cid
      and public.norm_phone_10(data->>'mobile') = v_phone
      and (p_exclude = '' or id <> p_exclude)
    order by created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'isDuplicate', true,
        'matchedBy', 'mobile',
        'leadId', found_row.id,
        'companyName', found_row.data->>'companyName',
        'contactPerson', found_row.data->>'contactPerson'
      );
    end if;
  end if;

  if p_email is not null and trim(p_email) <> '' then
    select id, data into found_row
    from public.leads
    where company_id = v_cid
      and lower(trim(data->>'email')) = lower(trim(p_email))
      and (p_exclude = '' or id <> p_exclude)
    order by created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'isDuplicate', true,
        'matchedBy', 'email',
        'leadId', found_row.id,
        'companyName', found_row.data->>'companyName',
        'contactPerson', found_row.data->>'contactPerson'
      );
    end if;
  end if;

  return jsonb_build_object('isDuplicate', false);
end $$;
revoke all on function public.check_duplicate_lead(text, text, text) from public, anon;
grant execute on function public.check_duplicate_lead(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. convert_quotation_to_order: strict role check on advancePayment
-- ---------------------------------------------------------------------
create or replace function public.convert_quotation_to_order(quotation_id text, extra jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cid uuid := public.my_company();
  v_name text := public.my_name();
  v_is_admin boolean := public.has_role(array['super_admin','owner','admin']);
  v_settings jsonb; v_prefix text; v_seq bigint; v_num text; v_oid text;
  v_q jsonb; v_created_by uuid; v_grand numeric; v_adv numeric; v_pstatus text;
  v_order jsonb; v_item jsonb; v_pid text; v_qty numeric; v_prod record; v_avail numeric; v_res numeric;
  v_pay_id text; v_warn boolean := false;
  v_caller_role text := public.my_role();
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;
  if not public.has_role(array['super_admin','owner','admin','manager','sales_manager','salesperson']) then
    raise exception 'Permission denied: cannot convert quotations';
  end if;

  select data, created_by into v_q, v_created_by from public.quotations where id = quotation_id and company_id = v_cid for update;
  if v_q is null then raise exception 'Quotation not found.'; end if;

  if not (public.has_role(array['super_admin','owner','admin','manager','sales_manager'])
          or v_created_by = auth.uid() or v_q->>'salespersonId' = auth.uid()::text) then
    raise exception 'Permission denied: this quotation belongs to someone else';
  end if;

  if (v_q->>'convertedOrderId') is not null or v_q->>'status' in ('Accepted','Converted') then
    raise exception 'This quotation has already been converted to an order.';
  end if;
  if v_q->>'status' = 'Rejected' then raise exception 'Cannot convert a rejected quotation.'; end if;

  v_grand := coalesce((v_q->>'grandTotal')::numeric, 0);
  v_adv := greatest(0, coalesce((extra->>'advancePayment')::numeric, 0));

  -- Advance-payment bypass guard: only authorized roles can record advance payment on conversion
  if v_adv > 0 and not (v_caller_role in ('super_admin','owner','admin','manager','sales_manager','accounts')) then
    raise exception 'Permission denied: Salespersons cannot record advance payments. An administrator, manager, or accounts role must confirm payments.';
  end if;

  if v_adv > v_grand then raise exception 'Advance payment cannot exceed the grand total.'; end if;

  -- Stock check first
  for v_item in select * from jsonb_array_elements(coalesce(v_q->'items','[]'::jsonb)) loop
    v_pid := v_item->>'productId'; v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    if v_pid is not null and v_pid <> '' and v_qty > 0 then
      select id, data into v_prod from public.products where id = v_pid and company_id = v_cid for update;
      if found and coalesce((v_prod.data->>'availableStock')::numeric, 0) < v_qty then
        if not v_is_admin then
          raise exception 'Insufficient stock for % (available %, needed %). Ask an admin to approve or add stock.',
            coalesce(v_prod.data->>'name', v_pid), coalesce(v_prod.data->>'availableStock','0'), v_qty;
        end if;
        v_warn := true;
      end if;
    end if;
  end loop;

  select data into v_settings from public.company_settings where company_id = v_cid;
  v_prefix := coalesce(nullif(trim(v_settings->>'orderPrefix'), ''), 'ORD');
  v_seq := public.next_seq('order');
  v_num := v_prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 3, '0');
  v_oid := 'ord-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);
  v_pstatus := case when v_adv >= v_grand and v_grand > 0 then 'Paid' when v_adv > 0 then 'Partially Paid' else 'Pending' end;

  v_order := jsonb_build_object(
    'id', v_oid, 'orderNumber', v_num,
    'customerId', coalesce(v_q->>'customerId', ''),
    'customerName', v_q->>'customerName', 'contactPerson', v_q->>'contactPerson', 'mobile', coalesce(v_q->>'mobile',''),
    'quotationId', quotation_id, 'quotationNumber', v_q->>'quotationNumber',
    'orderDate', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
    'salespersonId', v_q->>'salespersonId', 'salespersonName', v_q->>'salespersonName',
    'items', v_q->'items',
    'subtotal', coalesce((v_q->>'taxableAmount')::numeric, (v_q->>'subtotal')::numeric, 0),
    'gstTotal', coalesce((v_q->>'gstTotal')::numeric, 0),
    'totalAmount', v_grand, 'advancePayment', v_adv, 'balancePayment', v_grand - v_adv,
    'deliveryStatus', 'Pending', 'paymentStatus', v_pstatus, 'orderStatus', 'Confirmed',
    'stockWarning', v_warn,
    'notes', 'Generated from quotation ' || coalesce(v_q->>'quotationNumber', ''),
    'createdAt', now()::text, 'updatedAt', now()::text);

  insert into public.orders (id, company_id, data, created_by) values (v_oid, v_cid, v_order, auth.uid());

  -- Reserve stock atomically
  for v_item in select * from jsonb_array_elements(coalesce(v_q->'items','[]'::jsonb)) loop
    v_pid := v_item->>'productId'; v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    if v_pid is not null and v_pid <> '' and v_qty > 0 then
      select id, data into v_prod from public.products where id = v_pid and company_id = v_cid for update;
      if found then
        v_avail := coalesce((v_prod.data->>'availableStock')::numeric, 0) - v_qty;
        v_res := coalesce((v_prod.data->>'reservedStock')::numeric, 0) + v_qty;
        update public.products set data = jsonb_set(jsonb_set(v_prod.data, '{availableStock}', to_jsonb(v_avail)),
               '{reservedStock}', to_jsonb(v_res)), updated_at = now() where id = v_pid and company_id = v_cid;
        insert into public.inventory_transactions (id, company_id, data, created_by) values (
          'tx-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6), v_cid,
          jsonb_build_object('productId', v_pid, 'productName', coalesce(v_prod.data->>'name','Product'),
            'quantity', v_qty, 'transactionType', 'Reservation', 'referenceType', 'Order', 'referenceId', v_num,
            'date', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'), 'userId', auth.uid()::text,
            'userName', v_name, 'notes', 'Stock reserved for ' || v_num, 'createdAt', now()::text), auth.uid());
      end if;
    end if;
  end loop;

  if v_adv > 0 then
    v_pay_id := 'pay-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);
    insert into public.payments (id, company_id, data, created_by) values (v_pay_id, v_cid, jsonb_build_object(
      'id', v_pay_id, 'customerId', v_order->>'customerId', 'customerName', v_order->>'customerName',
      'orderId', v_oid, 'orderNumber', v_num, 'amount', v_adv,
      'paymentDate', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
      'paymentMethod', coalesce(extra->>'paymentMethod', 'Bank Transfer'),
      'referenceNumber', coalesce(extra->>'referenceNumber', 'ADV-' || v_num),
      'notes', 'Advance payment on order confirmation', 'recordedBy', v_name, 'createdAt', now()::text), auth.uid());
  end if;

  update public.quotations set data = jsonb_set(jsonb_set(jsonb_set(data, '{status}', '"Accepted"'),
         '{convertedOrderId}', to_jsonb(v_oid)), '{updatedAt}', to_jsonb(now()::text)), updated_at = now()
   where id = quotation_id and company_id = v_cid;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (v_cid, auth.uid(), 'Quotation Converted', 'Order', v_oid,
          'Converted quotation ' || coalesce(v_q->>'quotationNumber','') || ' to order ' || v_num);
  return jsonb_build_object('success', true, 'order', v_order);
end $$;
revoke all on function public.convert_quotation_to_order(text, jsonb) from public, anon;
grant execute on function public.convert_quotation_to_order(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 8. convert_lead_to_customer: Industry defaults to company_settings
-- ---------------------------------------------------------------------
create or replace function public.convert_lead_to_customer(lead_id text, extra jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cid uuid := public.my_company();
  v_lead jsonb; v_created_by uuid;
  v_exist record; v_cust jsonb; v_cust_id text; v_seq bigint; v_contact_id text;
  v_settings jsonb; v_default_industry text := '';
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;
  if not public.has_role(array['super_admin','owner','admin','manager','sales_manager','salesperson']) then
    raise exception 'Permission denied: cannot convert leads';
  end if;
  select data, created_by into v_lead, v_created_by from public.leads where id = lead_id and company_id = v_cid for update;
  if v_lead is null then raise exception 'Lead not found.'; end if;
  if not (public.has_role(array['super_admin','owner','admin','manager','sales_manager'])
          or v_created_by = auth.uid() or v_lead->>'assignedSalespersonId' = auth.uid()::text) then
    raise exception 'Permission denied: this lead is assigned to someone else';
  end if;

  select data into v_settings from public.company_settings where company_id = v_cid;
  v_default_industry := coalesce(nullif(trim(v_settings->>'defaultIndustry'), ''), '');

  select id, data into v_exist from public.customers
   where company_id = v_cid and (
     lower(data->>'companyName') = lower(coalesce(v_lead->>'companyName',''))
     or (coalesce(data->>'mobile','') <> '' and data->>'mobile' = v_lead->>'mobile')) limit 1;

  if v_exist.id is not null then
    v_cust := v_exist.data || jsonb_build_object('id', v_exist.id);
  else
    v_seq := public.next_seq('customer');
    v_cust_id := 'cust-' || lpad(v_seq::text, 3, '0');
    v_cust := jsonb_build_object(
      'id', v_cust_id,
      'companyName', coalesce(v_lead->>'companyName', 'Customer'),
      'contactPerson', coalesce(v_lead->>'contactPerson', ''),
      'mobile', coalesce(v_lead->>'mobile', ''),
      'whatsapp', coalesce(v_lead->>'whatsapp', v_lead->>'mobile', ''),
      'email', coalesce(v_lead->>'email', ''),
      'address', coalesce(extra->>'address', v_lead->>'address', coalesce(v_lead->>'city','') || ', ' || coalesce(v_lead->>'state','')),
      'city', coalesce(v_lead->>'city', ''), 'state', coalesce(v_lead->>'state', ''),
      'country', coalesce(v_lead->>'country', 'India'),
      'gstNumber', left(coalesce(extra->>'gstNumber', ''), 20), 'pan', left(coalesce(extra->>'pan', ''), 15),
      'customerType', coalesce(extra->>'customerType', 'Client'),
      'industry', coalesce(extra->>'industry', v_default_industry),
      'assignedSalespersonId', v_lead->>'assignedSalespersonId',
      'assignedSalespersonName', v_lead->>'assignedSalespersonName',
      'status', 'Active',
      'notes', 'Converted from lead ' || lead_id || ' on ' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
      'createdAt', now()::text, 'updatedAt', now()::text);
    insert into public.customers (id, company_id, data, created_by) values (v_cust_id, v_cid, v_cust, auth.uid());
    v_contact_id := 'cont-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 4);
    insert into public.contacts (id, company_id, data, created_by) values (v_contact_id, v_cid, jsonb_build_object(
      'id', v_contact_id, 'customerId', v_cust_id, 'customerName', v_cust->>'companyName',
      'name', v_cust->>'contactPerson', 'designation', 'Decision Maker',
      'mobile', v_cust->>'mobile', 'whatsapp', v_cust->>'whatsapp', 'email', v_cust->>'email',
      'department', 'Management', 'isPrimary', true, 'createdAt', now()::text), auth.uid());
  end if;

  update public.leads set data = jsonb_set(jsonb_set(jsonb_set(data, '{status}', '"Won"'),
         '{convertedCustomerId}', to_jsonb(v_cust->>'id')), '{updatedAt}', to_jsonb(now()::text)), updated_at = now()
   where id = lead_id and company_id = v_cid;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (v_cid, auth.uid(), 'Lead Converted', 'Customer', v_cust->>'id', 'Converted lead ' || lead_id);
  return jsonb_build_object('success', true, 'customer', v_cust);
end $$;
revoke all on function public.convert_lead_to_customer(text, jsonb) from public, anon;
grant execute on function public.convert_lead_to_customer(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 9. create_tax_invoice: Gap-free per Indian Financial Year (April-March)
-- ---------------------------------------------------------------------
create or replace function public.create_tax_invoice(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cid uuid := public.my_company();
  v_name text := public.my_name();
  v_settings jsonb;
  v_prefix text;
  v_fy text;
  v_kind text;
  v_seq bigint;
  v_invoice_num text;
  v_id text;
  v_invoice jsonb;
  v_now timestamptz := now() at time zone 'Asia/Kolkata';
  v_year int := extract(year from v_now)::int;
  v_month int := extract(month from v_now)::int;
  v_fy_start int;
  v_fy_end int;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;
  if not public.has_role(array['super_admin','owner','admin','manager','sales_manager','accounts']) then
    raise exception 'Permission denied: cannot create tax invoices';
  end if;

  -- Indian FY calculation (April to March)
  if v_month >= 4 then
    v_fy_start := v_year;
    v_fy_end := v_year + 1;
  else
    v_fy_start := v_year - 1;
    v_fy_end := v_year;
  end if;
  v_fy := v_fy_start::text || '-' || substring(v_fy_end::text from 3 for 2);
  v_kind := 'invoice-' || v_fy;

  select data into v_settings from public.company_settings where company_id = v_cid;
  v_prefix := coalesce(nullif(trim(v_settings->>'invoicePrefix'), ''), 'INV');

  v_seq := public.next_seq(v_kind);
  v_invoice_num := v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 4, '0');
  v_id := 'inv-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);

  v_invoice := payload || jsonb_build_object(
    'id', v_id,
    'invoiceNumber', v_invoice_num,
    'financialYear', v_fy,
    'invoiceDate', coalesce(payload->>'invoiceDate', to_char(v_now, 'YYYY-MM-DD')),
    'createdAt', now()::text,
    'updatedAt', now()::text
  );

  insert into public.tax_invoices (id, company_id, data, created_by)
  values (v_id, v_cid, v_invoice, auth.uid());

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (v_cid, auth.uid(), 'Tax Invoice Generated', 'TaxInvoice', v_id,
          'Generated gap-free tax invoice ' || v_invoice_num || ' for ' || coalesce(payload->>'customerName', 'Client'));

  return v_invoice;
end $$;
revoke all on function public.create_tax_invoice(jsonb) from public, anon;
grant execute on function public.create_tax_invoice(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 10. record_payment: Atomic balance adjustment, role check, and audit
-- ---------------------------------------------------------------------
create or replace function public.record_payment(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cid uuid := public.my_company();
  v_name text := public.my_name();
  v_order_id text := payload->>'orderId';
  v_amount numeric := coalesce((payload->>'amount')::numeric, 0);
  v_ord_row record;
  v_total numeric;
  v_adv numeric;
  v_bal numeric;
  v_new_adv numeric;
  v_new_bal numeric;
  v_new_status text;
  v_pay_id text;
  v_pay_data jsonb;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;
  if not public.has_role(array['super_admin','owner','admin','manager','sales_manager','accounts']) then
    raise exception 'Permission denied: unauthorized to record payments';
  end if;

  if v_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if v_order_id is not null and trim(v_order_id) <> '' then
    select id, data into v_ord_row from public.orders where id = v_order_id and company_id = v_cid for update;
    if not found then raise exception 'Order not found in organization'; end if;

    v_total := coalesce((v_ord_row.data->>'totalAmount')::numeric, (v_ord_row.data->>'grandTotal')::numeric, 0);
    v_adv := coalesce((v_ord_row.data->>'advancePayment')::numeric, (v_ord_row.data->>'paidAmount')::numeric, 0);
    v_bal := coalesce((v_ord_row.data->>'balancePayment')::numeric, v_total - v_adv);

    if v_amount > v_bal then
      raise exception 'Payment amount (INR %) exceeds outstanding balance (INR %)', v_amount, v_bal;
    end if;

    v_new_adv := v_adv + v_amount;
    v_new_bal := v_total - v_new_adv;
    v_new_status := case
      when v_new_adv >= v_total then 'Paid'
      when v_new_adv > 0 then 'Partially Paid'
      else 'Pending'
    end;

    update public.orders
    set data = jsonb_set(
                 jsonb_set(
                   jsonb_set(data, '{advancePayment}', to_jsonb(v_new_adv)),
                   '{balancePayment}', to_jsonb(v_new_bal)
                 ),
                 '{paymentStatus}', to_jsonb(v_new_status)
               ),
        updated_at = now()
    where id = v_order_id and company_id = v_cid;
  end if;

  v_pay_id := 'pay-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);
  v_pay_data := payload || jsonb_build_object(
    'id', v_pay_id,
    'paymentDate', coalesce(payload->>'paymentDate', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD')),
    'recordedBy', v_name,
    'createdAt', now()::text
  );

  insert into public.payments (id, company_id, data, created_by)
  values (v_pay_id, v_cid, v_pay_data, auth.uid());

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (v_cid, auth.uid(), 'Payment Recorded', 'Payment', v_pay_id,
          'Recorded payment of INR ' || v_amount || ' for ' || coalesce(payload->>'customerName', 'Client') || ' against order ' || coalesce(payload->>'orderNumber', v_order_id, 'N/A'));

  return v_pay_data;
end $$;
revoke all on function public.record_payment(jsonb) from public, anon;
grant execute on function public.record_payment(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 11. import_leads RPC: Server-side chunked lead import with audit
-- ---------------------------------------------------------------------
create or replace function public.import_leads(rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cid uuid := public.my_company();
  v_u_id uuid := auth.uid();
  v_name text := public.my_name();
  r jsonb;
  c_name text;
  c_person text;
  c_mobile text;
  c_email text;
  v_seq bigint;
  v_lead_id text;
  v_imported int := 0;
  v_skipped int := 0;
  v_errors text[] := array[]::text[];
  v_existing record;
  v_lead_data jsonb;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;
  if not public.has_role(array['super_admin','owner','admin','manager','sales_manager','salesperson']) then
    raise exception 'Permission denied: cannot import leads';
  end if;

  for r in select * from jsonb_array_elements(rows) loop
    c_name := trim(coalesce(r->>'companyName', r->>'Company Name', ''));
    c_person := trim(coalesce(r->>'contactPerson', r->>'Contact Person', 'Representative'));
    c_mobile := public.norm_phone_10(coalesce(r->>'mobile', r->>'Mobile', r->>'phone', ''));
    c_email := trim(lower(coalesce(r->>'email', r->>'Email', '')));

    if c_name = '' or c_mobile = '' or length(c_mobile) < 10 then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || ('Row skipped: missing valid Company Name or 10-digit mobile number (' || c_name || ')');
      continue;
    end if;

    -- Duplicate check per row
    select id into v_existing from public.leads
    where company_id = v_cid and public.norm_phone_10(data->>'mobile') = c_mobile
    limit 1;

    if found then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || ('Duplicate phone ' || c_mobile || ' for ' || c_name);
      continue;
    end if;

    v_seq := public.next_seq('lead');
    v_lead_id := 'LEAD-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0');

    v_lead_data := jsonb_build_object(
      'id', v_lead_id,
      'leadDate', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
      'companyName', c_name,
      'contactPerson', c_person,
      'mobile', c_mobile,
      'whatsapp', c_mobile,
      'email', c_email,
      'city', coalesce(r->>'city', r->>'City', ''),
      'state', coalesce(r->>'state', r->>'State', ''),
      'country', 'India',
      'source', 'Excel Import',
      'productInterested', coalesce(r->>'productInterested', r->>'Product', 'Industrial Machinery'),
      'requirement', coalesce(r->>'requirement', r->>'Requirement', ''),
      'quantity', 1,
      'status', 'New',
      'priority', 'Medium',
      'assignedSalespersonId', v_u_id::text,
      'assignedSalespersonName', v_name,
      'notes', 'Bulk imported via spreadsheet',
      'createdAt', now()::text,
      'updatedAt', now()::text
    );

    insert into public.leads (id, company_id, data, created_by)
    values (v_lead_id, v_cid, v_lead_data, v_u_id);
    v_imported := v_imported + 1;
  end loop;

  -- Single audit log entry for bulk import
  if v_imported > 0 then
    insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
    values (v_cid, v_u_id, 'Bulk Leads Import', 'Lead', 'batch',
            'Imported ' || v_imported || ' leads (skipped ' || v_skipped || ')');
  end if;

  return jsonb_build_object(
    'total', jsonb_array_length(rows),
    'imported', v_imported,
    'skipped', v_skipped,
    'errors', to_jsonb(v_errors)
  );
end $$;
revoke all on function public.import_leads(jsonb) from public, anon;
grant execute on function public.import_leads(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 12. get_dashboard_metrics RPC: Single round-trip aggregated counts/sums
-- ---------------------------------------------------------------------
create or replace function public.get_dashboard_metrics()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cid uuid := public.my_company();
  leads_count bigint := 0;
  customers_count bigint := 0;
  products_count bigint := 0;
  orders_count bigint := 0;
  quotations_count bigint := 0;
  total_revenue numeric := 0;
  received_payments numeric := 0;
  pending_payments numeric := 0;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;

  select count(*) into leads_count from public.leads where company_id = v_cid;
  select count(*) into customers_count from public.customers where company_id = v_cid;
  select count(*) into products_count from public.products where company_id = v_cid;
  select count(*) into quotations_count from public.quotations where company_id = v_cid;
  select count(*) into orders_count from public.orders where company_id = v_cid;

  select coalesce(sum((data->>'totalAmount')::numeric), sum((data->>'grandTotal')::numeric), 0)
  into total_revenue from public.orders where company_id = v_cid;

  select coalesce(sum((data->>'amount')::numeric), 0)
  into received_payments from public.payments where company_id = v_cid;

  pending_payments := greatest(0, total_revenue - received_payments);

  return jsonb_build_object(
    'leadsCount', leads_count,
    'customersCount', customers_count,
    'productsCount', products_count,
    'ordersCount', orders_count,
    'quotationsCount', quotations_count,
    'totalRevenue', total_revenue,
    'receivedPayments', received_payments,
    'pendingPayments', pending_payments
  );
end $$;
revoke all on function public.get_dashboard_metrics() from public, anon;
grant execute on function public.get_dashboard_metrics() to authenticated;

-- ---------------------------------------------------------------------
-- 13. Storage Bucket Hardening: 10 MB limit & mime types
-- ---------------------------------------------------------------------
update storage.buckets
set file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = array[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain'
    ]
where id = 'documents';
