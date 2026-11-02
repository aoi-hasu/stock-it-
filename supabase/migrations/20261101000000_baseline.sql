-- =====================================================================
-- 20261101000000_baseline.sql
-- StockItEase - Squashed baseline schema and functions reflecting the
-- consolidated state of migrations 01-16 (including 15 and 16).
-- Idempotent and safe for initialization of new environments.
--
-- ROLLBACK NOTE:
-- To rollback this baseline migration completely:
--   DROP SCHEMA public CASCADE;
--   CREATE SCHEMA public;
--   GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS public;

--
-- PostgreSQL database dump
--


-- Dumped from database version 15.19 (Debian 15.19-0+deb12u1)
-- Dumped by pg_dump version 15.19 (Debian 15.19-0+deb12u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: ack_password_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ack_password_changed() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: cancel_tax_invoice(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_tax_invoice(invoice_id text, reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cid uuid := public.my_company();
  v_uid uuid := auth.uid();
  v_inv record;
  v_updated jsonb;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;

  if not public.has_role(array['super_admin','owner','admin','accounts']) then
    raise exception 'Permission denied: Only administrators or accounts can cancel tax invoices';
  end if;

  if reason is null or trim(reason) = '' then
    raise exception 'A cancellation reason is required';
  end if;

  select id, data into v_inv
  from public.tax_invoices
  where id = invoice_id and company_id = v_cid
  for update;

  if not found then raise exception 'Tax invoice not found'; end if;

  if v_inv.data->>'status' = 'Cancelled' then
    raise exception 'Tax invoice is already cancelled';
  end if;

  v_updated := jsonb_set(
                 jsonb_set(
                   v_inv.data,
                   '{status}',
                   '"Cancelled"'
                 ),
                 '{cancellationReason}',
                 to_jsonb(trim(reason))
               );
  v_updated := jsonb_set(v_updated, '{cancelledAt}', to_jsonb(now()::text));
  v_updated := jsonb_set(v_updated, '{cancelledBy}', to_jsonb(public.my_name()));

  update public.tax_invoices
  set data = v_updated,
      updated_at = now()
  where id = invoice_id and company_id = v_cid;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (
    v_cid, v_uid, 'Tax Invoice Cancelled', 'TaxInvoice', invoice_id,
    format('Cancelled tax invoice %s. Reason: %s', v_inv.data->>'invoiceNumber', trim(reason))
  );

  return v_updated;
end $$;


--
-- Name: check_duplicate_lead(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_duplicate_lead(p_mobile text, p_email text DEFAULT ''::text, p_exclude text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: convert_lead_to_customer(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convert_lead_to_customer(lead_id text, extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: convert_quotation_to_order(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convert_quotation_to_order(quotation_id text, extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: create_order(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_order(payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cid uuid := public.my_company();
  v_uid uuid := auth.uid();
  v_name text := public.my_name();
  v_settings jsonb;
  v_prefix text := 'ORD';
  v_seq bigint;
  v_ord_num text;
  v_oid text := 'ord-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);
  v_total numeric := coalesce((payload->>'totalAmount')::numeric, (payload->>'grandTotal')::numeric, 0);
  v_adv numeric := greatest(0, coalesce((payload->>'advancePayment')::numeric, (payload->>'advanceAmount')::numeric, 0));
  v_bal numeric;
  v_pstatus text;
  v_order jsonb;
  v_item jsonb;
  v_pid text;
  v_qty numeric;
  v_prod record;
  v_avail numeric;
  v_res numeric;
  v_pay_id text;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;
  if not public.has_role(array['super_admin','owner','admin','manager','sales_manager','salesperson']) then
    raise exception 'Permission denied: cannot create orders';
  end if;

  select data into v_settings from public.company_settings where company_id = v_cid;
  if v_settings is not null and nullif(trim(v_settings->>'orderPrefix'), '') is not null then
    v_prefix := trim(v_settings->>'orderPrefix');
  end if;

  v_seq := public.next_seq('order');
  v_ord_num := v_prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0');
  v_bal := greatest(0, v_total - v_adv);
  v_pstatus := case when v_adv >= v_total and v_total > 0 then 'Paid' when v_adv > 0 then 'Partially Paid' else 'Pending' end;

  v_order := payload || jsonb_build_object(
    'id', v_oid,
    'orderNumber', v_ord_num,
    'totalAmount', v_total,
    'grandTotal', v_total,
    'advancePayment', v_adv,
    'balancePayment', v_bal,
    'orderStatus', coalesce(payload->>'orderStatus', 'Confirmed'),
    'deliveryStatus', coalesce(payload->>'deliveryStatus', 'Pending'),
    'paymentStatus', v_pstatus,
    'createdAt', now()::text,
    'updatedAt', now()::text
  );

  insert into public.orders (id, company_id, data, created_by)
  values (v_oid, v_cid, v_order, v_uid);

  -- Reserve stock if items are present
  for v_item in select * from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb)) loop
    v_pid := v_item->>'productId';
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    if v_pid is not null and v_pid <> '' and v_qty > 0 then
      select id, data into v_prod from public.products where id = v_pid and company_id = v_cid for update;
      if found then
        v_avail := coalesce((v_prod.data->>'availableStock')::numeric, 0) - v_qty;
        v_res := coalesce((v_prod.data->>'reservedStock')::numeric, 0) + v_qty;

        perform set_config('app.inventory_op', 'allowed', true);
        update public.products
        set data = jsonb_set(
                     jsonb_set(v_prod.data, '{availableStock}', to_jsonb(v_avail)),
                     '{reservedStock}', to_jsonb(v_res)
                   ),
            updated_at = now()
        where id = v_pid and company_id = v_cid;
        perform set_config('app.inventory_op', 'disallowed', true);

        insert into public.inventory_transactions (id, company_id, data, created_by)
        values (
          'tx-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6),
          v_cid,
          jsonb_build_object(
            'productId', v_pid,
            'productName', coalesce(v_prod.data->>'name', 'Product'),
            'quantity', v_qty,
            'transactionType', 'Reservation',
            'referenceType', 'Order',
            'referenceId', v_ord_num,
            'date', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
            'userId', v_uid::text,
            'userName', v_name,
            'notes', 'Stock reserved for direct order ' || v_ord_num,
            'createdAt', now()::text
          ),
          v_uid
        );
      end if;
    end if;
  end loop;

  -- Record advance payment if present
  if v_adv > 0 then
    v_pay_id := 'pay-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);
    insert into public.payments (id, company_id, data, created_by)
    values (
      v_pay_id, v_cid,
      jsonb_build_object(
        'id', v_pay_id,
        'orderId', v_oid,
        'orderNumber', v_ord_num,
        'customerId', v_order->>'customerId',
        'customerName', v_order->>'customerName',
        'amount', v_adv,
        'paymentDate', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
        'paymentMethod', coalesce(payload->>'paymentMethod', 'Bank Transfer'),
        'referenceNumber', coalesce(payload->>'referenceNumber', 'ADV-' || v_ord_num),
        'notes', 'Advance payment on direct order creation',
        'recordedBy', v_name,
        'createdAt', now()::text
      ),
      v_uid
    );
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (
    v_cid, v_uid, 'Order Created', 'Order', v_oid,
    format('Created direct order %s for %s (Amount: INR %s)', v_ord_num, coalesce(payload->>'customerName', 'Client'), v_total)
  );

  return v_order;
end $$;


--
-- Name: create_quotation(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_quotation(payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cid uuid := public.my_company();
  v_name text := public.my_name();
  v_settings jsonb;
  v_prefix text;
  v_seq bigint;
  v_number text;
  v_id text;
  v_days int;
  v_items jsonb := coalesce(payload->'items', '[]'::jsonb);
  v_item jsonb;
  v_out_items jsonb := '[]'::jsonb;
  v_idx int := 0;
  v_qty numeric; v_price numeric; v_disc numeric; v_gst numeric;
  v_sub numeric; v_dsc numeric; v_tax numeric; v_gsta numeric; v_tot numeric;
  t_sub numeric := 0; t_dsc numeric := 0; t_tax numeric := 0; t_gst numeric := 0; t_grand numeric := 0;
  v_lead text; v_lead_status text;
  v_result jsonb;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;
  if not public.has_role(array['super_admin','owner','admin','manager','sales_manager','salesperson']) then
    raise exception 'Permission denied: cannot create quotations';
  end if;
  if coalesce(trim(payload->>'customerName'), '') = '' then
    raise exception 'Customer Name is required.';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'At least one quotation line item is required.';
  end if;

  select data into v_settings from public.company_settings where company_id = v_cid;
  v_prefix := coalesce(nullif(trim(v_settings->>'quotationPrefix'), ''), 'QTN');
  v_seq := public.next_seq('quotation');
  v_number := v_prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0');
  v_id := 'qtn-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);
  v_days := greatest(1, coalesce((payload->>'validityDays')::int, (v_settings->>'defaultQuotationValidityDays')::int, 30));

  for v_item in select * from jsonb_array_elements(v_items) loop
    v_idx := v_idx + 1;
    v_qty   := greatest(1, coalesce((v_item->>'quantity')::numeric, 1));
    v_price := greatest(0, coalesce((v_item->>'unitPrice')::numeric, 0));
    v_disc  := least(100, greatest(0, coalesce((v_item->>'discountPercentage')::numeric, (v_item->>'discountPercent')::numeric, 0)));
    v_gst   := least(100, greatest(0, coalesce((v_item->>'gstPercentage')::numeric, 18)));
    v_sub  := round(v_qty * v_price, 2);
    v_dsc  := round(v_sub * v_disc / 100, 2);
    v_tax  := v_sub - v_dsc;
    v_gsta := round(v_tax * v_gst / 100, 2);
    v_tot  := v_tax + v_gsta;
    t_sub := t_sub + v_sub; t_dsc := t_dsc + v_dsc; t_tax := t_tax + v_tax;
    t_gst := t_gst + v_gsta; t_grand := t_grand + v_tot;
    v_out_items := v_out_items || jsonb_build_object(
      'id', 'qi-' || v_idx || '-' || substring(md5(random()::text) from 1 for 6),
      'productId', v_item->>'productId',
      'productName', left(coalesce(v_item->>'productName', 'Item'), 200),
      'modelNumber', left(coalesce(v_item->>'modelNumber', ''), 100),
      'quantity', v_qty, 'unitPrice', v_price, 'discountPercentage', v_disc,
      'taxableAmount', v_tax, 'gstPercentage', v_gst, 'gstAmount', v_gsta, 'totalAmount', v_tot);
  end loop;

  v_result := jsonb_build_object(
    'id', v_id,
    'quotationNumber', v_number,
    'date', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
    'validUntil', to_char((now() at time zone 'Asia/Kolkata')::date + v_days, 'YYYY-MM-DD'),
    'customerId', payload->>'customerId',
    'customerName', left(payload->>'customerName', 200),
    'contactPerson', left(coalesce(payload->>'contactPerson', 'Purchasing Department'), 150),
    'mobile', left(coalesce(payload->>'mobile', ''), 30),
    'email', left(coalesce(payload->>'email', ''), 150),
    'billingAddress', left(coalesce(payload->>'billingAddress', ''), 500),
    'shippingAddress', left(coalesce(payload->>'shippingAddress', payload->>'billingAddress', ''), 500),
    'salespersonId', coalesce(payload->>'salespersonId', auth.uid()::text),
    'salespersonName', coalesce(payload->>'salespersonName', v_name),
    'leadId', payload->>'leadId',
    'items', v_out_items,
    'subtotal', t_sub, 'discountTotal', t_dsc, 'taxableAmount', t_tax,
    'gstTotal', t_gst, 'grandTotal', t_grand,
    'paymentTerms', coalesce(payload->>'paymentTerms', v_settings->>'defaultPaymentTerms', ''),
    'deliveryTerms', coalesce(payload->>'deliveryTerms', v_settings->>'defaultDeliveryTerms', ''),
    'warrantyTerms', coalesce(payload->>'warrantyTerms', v_settings->>'defaultWarrantyTerms', ''),
    'termsAndConditions', coalesce(payload->>'termsAndConditions', v_settings->>'defaultTermsAndConditions', ''),
    'notes', left(coalesce(payload->>'notes', ''), 2000),
    'status', case when payload->>'status' in ('Draft','Sent') then payload->>'status' else 'Sent' end,
    'createdAt', now()::text, 'updatedAt', now()::text
  );

  insert into public.quotations (id, company_id, data, created_by) values (v_id, v_cid, v_result, auth.uid());

  v_lead := payload->>'leadId';
  if v_lead is not null and v_lead <> '' then
    select data->>'status' into v_lead_status from public.leads where id = v_lead and company_id = v_cid for update;
    if v_lead_status in ('New','Contacted','Qualified','Requirement Confirmed') then
      update public.leads set data = jsonb_set(jsonb_set(data, '{status}', '"Quotation Sent"'), '{updatedAt}', to_jsonb(now()::text)), updated_at = now()
      where id = v_lead and company_id = v_cid;
    end if;
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (v_cid, auth.uid(), 'Quotation Created', 'Quotation', v_id,
          'Created quotation ' || v_number || ' for ' || left(payload->>'customerName', 100) || ' (INR ' || t_grand || ')');
  return v_result;
end $$;


--
-- Name: create_tax_invoice(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_tax_invoice(payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  v_fy := v_fy_start::text || '-' || substring(v_fy_end::text from 3 for 2); -- e.g. 2026-27
  v_kind := 'invoice-' || v_fy;

  select data into v_settings from public.company_settings where company_id = v_cid;
  -- Strictly clamp prefix to maximum 3 characters so PREFIX/YYYY-YY/NNNN <= 16 chars (GST rule)
  v_prefix := left(coalesce(nullif(trim(v_settings->>'invoicePrefix'), ''), 'INV'), 3);

  v_seq := public.next_seq(v_kind);
  v_invoice_num := v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 4, '0');

  if length(v_invoice_num) > 16 then
    raise exception 'Generated invoice number % exceeds statutory GST limit of 16 characters', v_invoice_num;
  end if;

  v_id := 'inv-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);

  v_invoice := payload || jsonb_build_object(
    'id', v_id,
    'invoiceNumber', v_invoice_num,
    'financialYear', v_fy,
    'status', coalesce(payload->>'status', 'Issued'),
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


--
-- Name: delete_payment(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_payment(payment_id text, reason text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cid uuid := public.my_company();
  v_uid uuid := auth.uid();
  v_role text := public.my_role();
  v_pay record;
  v_ord record;
  v_ord_id text;
  v_amount numeric;
  v_total numeric;
  v_adv numeric;
  v_new_adv numeric;
  v_new_bal numeric;
  v_new_status text;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;

  if not public.has_role(array['super_admin','owner','admin']) then
    raise exception 'Permission denied: Only administrators can delete payment records';
  end if;

  select id, data into v_pay
  from public.payments
  where id = payment_id and company_id = v_cid
  for update;

  if not found then raise exception 'Payment record not found'; end if;

  v_ord_id := v_pay.data->>'orderId';
  v_amount := coalesce((v_pay.data->>'amount')::numeric, 0);

  -- Atomically adjust order balance if linked to an order
  if v_ord_id is not null and trim(v_ord_id) <> '' then
    select id, data into v_ord
    from public.orders
    where id = v_ord_id and company_id = v_cid
    for update;

    if found then
      v_total := coalesce((v_ord.data->>'totalAmount')::numeric, (v_ord.data->>'grandTotal')::numeric, 0);
      v_adv := coalesce((v_ord.data->>'advancePayment')::numeric, (v_ord.data->>'paidAmount')::numeric, 0);

      v_new_adv := greatest(0, v_adv - v_amount);
      v_new_bal := greatest(0, v_total - v_new_adv);
      v_new_status := case
        when v_new_adv <= 0 then 'Unpaid'
        when v_new_adv < v_total then 'Partially Paid'
        else 'Paid'
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
      where id = v_ord_id and company_id = v_cid;
    end if;
  end if;

  -- Delete payment row
  delete from public.payments
  where id = payment_id and company_id = v_cid;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (
    v_cid, v_uid, 'Payment Deleted', 'Payment', payment_id,
    format('Deleted payment of INR %s (Reason: %s). Order balance reversed.', v_amount, coalesce(nullif(trim(reason),''), 'Administrative reversal'))
  );

  return jsonb_build_object('success', true, 'deletedPaymentId', payment_id, 'reversedAmount', v_amount);
end $$;


--
-- Name: find_lead_by_phone(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_lead_by_phone(p_company uuid, p_phone text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  target_phone text := public.norm_phone_10(p_phone);
  found_row record;
begin
  if target_phone is null or length(target_phone) < 10 then
    return null;
  end if;

  select id, company_id, data, created_at, updated_at
  into found_row
  from public.leads
  where company_id = p_company
    and public.norm_phone_10(data->>'mobile') = target_phone
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'id', found_row.id,
      'company_id', found_row.company_id,
      'data', found_row.data,
      'created_at', found_row.created_at,
      'updated_at', found_row.updated_at
    );
  end if;

  return null;
end $$;


--
-- Name: get_dashboard_metrics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_metrics() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: get_platform_metrics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_platform_metrics() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: guard_product_stock_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_product_stock_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Service role execution allowed
  if auth.uid() is null then
    return new;
  end if;

  if (
    old.data->>'currentStock' is distinct from new.data->>'currentStock'
    or old.data->>'availableStock' is distinct from new.data->>'availableStock'
    or old.data->>'reservedStock' is distinct from new.data->>'reservedStock'
  ) then
    if coalesce(current_setting('app.inventory_op', true), '') <> 'allowed' then
      raise exception 'Direct modification of product stock levels is prohibited. Stock must be adjusted via inventory_transaction or official order/PO functions.';
    end if;
  end if;

  return new;
end $$;


--
-- Name: guard_profile_seat_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_profile_seat_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: guard_profile_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_profile_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_role text := public.my_role();
begin
  if auth.uid() is null then return new; end if; -- service role allowed

  if new.company_id <> old.company_id then
    raise exception 'Company cannot be changed';
  end if;

  if old.must_change_password and not new.must_change_password
     and coalesce(current_setting('app.ack_password', true), '') <> 'on' then
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


--
-- Name: has_role(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(public.my_role() = any(roles), false)
$$;


--
-- Name: import_leads(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.import_leads(rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: inventory_transaction(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_transaction(payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  c_id uuid := public.my_company();
  u_id uuid := auth.uid();
  u_name text := public.my_name();
  p_id text := payload->>'productId';
  tx_type text := payload->>'transactionType';
  qty numeric := abs(coalesce((payload->>'quantity')::numeric, 0));
  direction text := coalesce(payload->>'direction', 'In');
  reason text := coalesce(nullif(trim(payload->>'notes'), ''), nullif(trim(payload->>'reason'), ''));
  allow_neg boolean := coalesce((payload->>'allowNegative')::boolean, false);
  is_admin boolean;
  prod_row record;
  cur_stock numeric := 0;
  avail_stock numeric := 0;
  res_stock numeric := 0;
  tx_id text := 'tx-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);
  tx_data jsonb;
begin
  if c_id is null then raise exception 'Unauthorized: No active company context'; end if;

  if not public.has_role(array['super_admin','owner','admin','inventory_manager','manager','sales_manager']) then
    raise exception 'Unauthorized role for inventory transactions';
  end if;

  if p_id is null or trim(p_id) = '' then raise exception 'Product ID is required'; end if;
  if qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;

  is_admin := public.has_role(array['super_admin','owner','admin']);
  if allow_neg and not is_admin then
    allow_neg := false;
  end if;

  -- Lock product record atomically
  select id, data into prod_row from public.products where id = p_id and company_id = c_id for update;
  if not found then raise exception 'Product not found in company inventory'; end if;

  cur_stock := coalesce((prod_row.data->>'currentStock')::numeric, 0);
  avail_stock := coalesce((prod_row.data->>'availableStock')::numeric, cur_stock);
  res_stock := coalesce((prod_row.data->>'reservedStock')::numeric, 0);

  case tx_type
    when 'Stock In', 'Return' then
      cur_stock := cur_stock + qty;
      avail_stock := avail_stock + qty;

    when 'Stock Out', 'Sale', 'Damage' then
      if not allow_neg and avail_stock < qty then
        raise exception 'Insufficient stock: % available, % requested', avail_stock, qty;
      end if;
      cur_stock := cur_stock - qty;
      avail_stock := avail_stock - qty;

    when 'Reservation' then
      if not allow_neg and avail_stock < qty then
        raise exception 'Insufficient available stock to reserve: % available, % requested', avail_stock, qty;
      end if;
      avail_stock := avail_stock - qty;
      res_stock := res_stock + qty;

    when 'Release Reservation' then
      avail_stock := avail_stock + qty;
      res_stock := greatest(0, res_stock - qty);

    when 'Adjustment' then
      -- Phase 2 requirement: Reason required, only admins/inventory managers, support negative/signed
      if not (is_admin or public.my_role() = 'inventory_manager') then
        raise exception 'Only administrators or inventory managers can perform inventory stock adjustments';
      end if;
      if reason is null or length(reason) < 3 then
        raise exception 'A valid reason (minimum 3 characters) is strictly required for stock adjustments';
      end if;

      if direction in ('Out', 'Decrease', 'Negative') or coalesce((payload->>'quantity')::numeric, 0) < 0 then
        if not allow_neg and (avail_stock < qty or cur_stock < qty) then
          raise exception 'Insufficient stock for adjustment decrease: % available, % current', avail_stock, cur_stock;
        end if;
        cur_stock := cur_stock - qty;
        avail_stock := avail_stock - qty;
      else
        cur_stock := cur_stock + qty;
        avail_stock := avail_stock + qty;
      end if;

    else
      raise exception 'Unknown inventory transaction type: %', tx_type;
  end case;

  -- Allow update trigger for this transaction
  perform set_config('app.inventory_op', 'allowed', true);

  update public.products
  set data = jsonb_set(
               jsonb_set(
                 jsonb_set(data, '{currentStock}', to_jsonb(cur_stock)),
                 '{availableStock}', to_jsonb(avail_stock)
               ),
               '{reservedStock}', to_jsonb(res_stock)
             ),
      updated_at = now()
  where id = p_id and company_id = c_id;

  perform set_config('app.inventory_op', 'disallowed', true);

  tx_data := payload || jsonb_build_object(
    'id', tx_id,
    'productId', p_id,
    'productName', coalesce(payload->>'productName', prod_row.data->>'name', 'Product'),
    'quantity', qty,
    'direction', direction,
    'currentStockAfter', cur_stock,
    'availableStockAfter', avail_stock,
    'date', coalesce(payload->>'date', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD')),
    'userId', u_id::text,
    'userName', coalesce(u_name, 'Staff'),
    'createdAt', now()::text
  );

  insert into public.inventory_transactions (id, company_id, data, created_by)
  values (tx_id, c_id, tx_data, u_id);

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (
    c_id, u_id, 'Inventory ' || tx_type, 'Product', p_id,
    format('%s of %s units on %s. New stock: %s (Avail: %s)', tx_type, qty, prod_row.data->>'name', cur_stock, avail_stock)
  );

  return tx_data;
end $$;


--
-- Name: is_platform_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin(p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.platform_admins where user_id = p_user_id and active = true);
$$;


--
-- Name: log_table_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_table_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: my_company(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_company() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: my_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_name() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select name from public.profiles where id = auth.uid() and active
$$;


--
-- Name: my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from public.profiles where id = auth.uid() and active
$$;


--
-- Name: next_seq(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_seq(p_kind text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: next_seq_for(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_seq_for(p_company uuid, p_kind text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: norm_phone_10(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.norm_phone_10(p text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
$$;


--
-- Name: platform_can_view_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_can_view_data() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(public.platform_role(auth.uid()) in ('owner','manager'), false);
$$;


--
-- Name: platform_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_role(p_user_id uuid DEFAULT auth.uid()) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from public.platform_admins where user_id = p_user_id and active = true;
$$;


--
-- Name: receive_purchase_order(text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.receive_purchase_order(po_id text, update_inventory boolean DEFAULT true, notes text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cid uuid := public.my_company();
  v_uid uuid := auth.uid();
  v_name text := public.my_name();
  v_po record;
  v_item jsonb;
  v_pid text;
  v_qty numeric;
  v_prod record;
  v_cur numeric;
  v_avail numeric;
  v_tx_id text;
  v_today text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_updated jsonb;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;
  if not public.has_role(array['super_admin','owner','admin','inventory_manager','accounts']) then
    raise exception 'Permission denied: cannot receive purchase orders';
  end if;

  select id, data into v_po
  from public.purchase_orders
  where id = po_id and company_id = v_cid
  for update;

  if not found then raise exception 'Purchase order not found'; end if;

  if v_po.data->>'deliveryStatus' = 'Received' then
    raise exception 'Purchase order has already been marked as Received';
  end if;

  -- Add stock to inventory if update_inventory is true
  if update_inventory then
    perform set_config('app.inventory_op', 'allowed', true);

    for v_item in select * from jsonb_array_elements(coalesce(v_po.data->'items', '[]'::jsonb)) loop
      v_pid := v_item->>'productId';
      v_qty := coalesce((v_item->>'quantity')::numeric, 0);

      if v_pid is not null and v_pid <> '' and v_qty > 0 then
        select id, data into v_prod
        from public.products
        where id = v_pid and company_id = v_cid
        for update;

        if found then
          v_cur := coalesce((v_prod.data->>'currentStock')::numeric, 0) + v_qty;
          v_avail := coalesce((v_prod.data->>'availableStock')::numeric, 0) + v_qty;

          update public.products
          set data = jsonb_set(
                       jsonb_set(data, '{currentStock}', to_jsonb(v_cur)),
                       '{availableStock}', to_jsonb(v_avail)
                     ),
              updated_at = now()
          where id = v_pid and company_id = v_cid;

          v_tx_id := 'tx-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);
          insert into public.inventory_transactions (id, company_id, data, created_by)
          values (
            v_tx_id, v_cid,
            jsonb_build_object(
              'id', v_tx_id,
              'productId', v_pid,
              'productName', coalesce(v_prod.data->>'name', 'Product'),
              'quantity', v_qty,
              'transactionType', 'Stock In',
              'referenceType', 'Purchase Order',
              'referenceId', coalesce(v_po.data->>'poNumber', po_id),
              'date', v_today,
              'userId', v_uid::text,
              'userName', coalesce(v_name, 'Staff'),
              'notes', 'Stock In from PO ' || coalesce(v_po.data->>'poNumber', po_id),
              'createdAt', now()::text
            ),
            v_uid
          );
        end if;
      end if;
    end loop;

    perform set_config('app.inventory_op', 'disallowed', true);
  end if;

  v_updated := jsonb_set(
                 jsonb_set(v_po.data, '{deliveryStatus}', '"Received"'),
                 '{receivedDate}', to_jsonb(v_today)
               );
  if notes is not null and trim(notes) <> '' then
    v_updated := jsonb_set(v_updated, '{receiveNotes}', to_jsonb(trim(notes)));
  end if;
  v_updated := jsonb_set(v_updated, '{updatedAt}', to_jsonb(now()::text));

  update public.purchase_orders
  set data = v_updated,
      updated_at = now()
  where id = po_id and company_id = v_cid;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (
    v_cid, v_uid, 'Purchase Order Received', 'PurchaseOrder', po_id,
    format('Received purchase order %s. Stock added: %s', coalesce(v_po.data->>'poNumber', po_id), update_inventory)
  );

  return v_updated;
end $$;


--
-- Name: record_audit_log(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_audit_log(p_action text, p_entity text, p_entity_id text, p_details text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cid uuid := public.my_company();
  v_uid uuid := auth.uid();
begin
  if v_cid is null then return false; end if;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (v_cid, v_uid, p_action, p_entity, p_entity_id, p_details);

  return true;
end $$;


--
-- Name: record_inbound_lead(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_inbound_lead(p_company uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_unique_id text := nullif(trim(p_payload->>'uniqueQueryId'), '');
  v_mobile text := coalesce(p_payload->>'mobile', '');
  v_norm_phone text := public.norm_phone_10(v_mobile);
  v_source text := coalesce(nullif(trim(p_payload->>'source'), ''), 'Inbound Webhook');
  v_prod text := coalesce(nullif(trim(p_payload->>'productInterested'), ''), 'General Machinery Enquiry');
  v_msg text := coalesce(nullif(trim(p_payload->>'requirement'), ''), '');
  v_contact text := coalesce(nullif(trim(p_payload->>'contactPerson'), ''), 'Inbound Prospect');
  v_company_name text := coalesce(nullif(trim(p_payload->>'companyName'), ''), v_contact);
  v_assignee_id text := nullif(trim(p_payload->>'assignedSalespersonId'), '');
  v_assignee_name text := coalesce(nullif(trim(p_payload->>'assignedSalespersonName'), ''), 'Sales Team');
  
  v_existing_by_query record;
  v_existing_lead record;
  v_seq bigint;
  v_lead_id text;
  v_lead_data jsonb;
  v_flw_id text;
  v_flw_data jsonb;
  v_now_iso text := now()::text;
  v_today text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
begin
  if p_company is null then
    raise exception 'Company ID is required';
  end if;

  -- 1. Dedupe on uniqueQueryId (provider retries are idempotent)
  if v_unique_id is not null then
    select id, data into v_existing_by_query
    from public.leads
    where company_id = p_company
      and data->>'uniqueQueryId' = v_unique_id
    limit 1;

    if found then
      return jsonb_build_object(
        'status', 'duplicate_retry',
        'leadId', v_existing_by_query.id,
        'message', 'Inquiry already logged with this provider Query ID'
      );
    end if;
  end if;

  -- 2. Dedupe on normalized 10-digit mobile number
  if v_norm_phone is not null and length(v_norm_phone) >= 10 then
    select id, data into v_existing_lead
    from public.leads
    where company_id = p_company
      and public.norm_phone_10(data->>'mobile') = v_norm_phone
    for update
    limit 1;

    if found then
      -- Add follow-up and note to existing lead without dropping enquiry
      v_flw_id := 'flw-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);
      v_flw_data := jsonb_build_object(
        'id', v_flw_id,
        'leadId', v_existing_lead.id,
        'leadName', coalesce(v_existing_lead.data->>'contactPerson', v_contact),
        'companyName', coalesce(v_existing_lead.data->>'companyName', v_company_name),
        'mobile', v_norm_phone,
        'followUpDate', v_today,
        'followUpType', 'Call',
        'priority', 'High',
        'status', 'Pending',
        'subject', 'New ' || v_source || ' Enquiry: ' || left(v_prod, 60),
        'notes', 'New inquiry received via ' || v_source || '.' || E'\n' ||
                 'Product: ' || v_prod || E'\n' ||
                 'Message: ' || v_msg || E'\n' ||
                 case when v_unique_id is not null then 'Query ID: ' || v_unique_id else '' end,
        'assignedTo', coalesce(v_existing_lead.data->>'assignedSalespersonName', v_assignee_name),
        'assignedToId', coalesce(v_existing_lead.data->>'assignedSalespersonId', v_assignee_id),
        'createdAt', v_now_iso
      );

      insert into public.follow_ups (id, company_id, data, created_by)
      values (v_flw_id, p_company, v_flw_data, null);

      -- Update lead's updatedAt and append to notes
      update public.leads
      set data = jsonb_set(
            jsonb_set(
              data,
              '{notes}',
              to_jsonb(
                coalesce(data->>'notes', '') || E'\n[' || v_today || ' ' || v_source || ' Enquiry]: ' ||
                v_prod || case when v_msg <> '' then ' - ' || v_msg else '' end ||
                case when v_unique_id is not null then ' (Ref: ' || v_unique_id || ')' else '' end
              )
            ),
            '{updatedAt}',
            to_jsonb(v_now_iso)
          ),
          updated_at = now()
      where id = v_existing_lead.id;

      return jsonb_build_object(
        'status', 'appended_to_existing',
        'leadId', v_existing_lead.id,
        'followUpId', v_flw_id,
        'message', 'Enquiry appended to existing lead with new follow-up recorded'
      );
    end if;
  end if;

  -- 3. Create fresh new lead
  v_seq := public.next_seq_for(p_company, 'lead');
  v_lead_id := 'LEAD-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0');

  v_lead_data := p_payload || jsonb_build_object(
    'id', v_lead_id,
    'leadDate', coalesce(p_payload->>'leadDate', v_today),
    'companyName', v_company_name,
    'contactPerson', v_contact,
    'mobile', coalesce(v_norm_phone, v_mobile),
    'whatsapp', coalesce(v_norm_phone, v_mobile),
    'source', v_source,
    'uniqueQueryId', v_unique_id,
    'productInterested', v_prod,
    'requirement', v_msg,
    'status', 'New',
    'priority', coalesce(p_payload->>'priority', 'High'),
    'assignedSalespersonId', v_assignee_id,
    'assignedSalespersonName', v_assignee_name,
    'createdAt', v_now_iso,
    'updatedAt', v_now_iso
  );

  insert into public.leads (id, company_id, data, created_by)
  values (v_lead_id, p_company, v_lead_data, null);

  return jsonb_build_object(
    'status', 'created',
    'leadId', v_lead_id,
    'message', 'New lead captured successfully'
  );
end $$;


--
-- Name: record_password_change_time(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_password_change_time() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  u_id uuid := auth.uid();
begin
  if u_id is null then raise exception 'Unauthorized'; end if;

  update public.profiles
  set password_changed_at = now()
  where id = u_id;

  return true;
end $$;


--
-- Name: record_payment(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_payment(payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: record_platform_support_access(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_platform_support_access(p_company_id uuid, p_what text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if not public.platform_can_view_data() then
    raise exception 'Unauthorized: only platform owner or manager may open Support View';
  end if;
  insert into public.platform_access_logs (admin_id, company_id, what)
  values (v_uid, p_company_id, p_what);
  return jsonb_build_object('success', true, 'companyId', p_company_id, 'what', p_what);
end $$;


--
-- Name: record_purchase_payment(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_purchase_payment(payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cid uuid := public.my_company();
  v_uid uuid := auth.uid();
  v_name text := public.my_name();
  v_po_id text := coalesce(payload->>'purchaseOrderId', payload->>'poId');
  v_amount numeric := coalesce((payload->>'amount')::numeric, 0);
  v_po record;
  v_grand numeric;
  v_paid numeric;
  v_new_paid numeric;
  v_pstatus text;
  v_pay_id text := 'pay-po-' || extract(epoch from now())::bigint || '-' || substring(md5(random()::text) from 1 for 6);
  v_pay_data jsonb;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;
  if not public.has_role(array['super_admin','owner','admin','accounts']) then
    raise exception 'Permission denied: unauthorized to record purchase payments';
  end if;

  if v_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  select id, data into v_po
  from public.purchase_orders
  where id = v_po_id and company_id = v_cid
  for update;

  if not found then raise exception 'Purchase order not found'; end if;

  v_grand := coalesce((v_po.data->>'grandTotal')::numeric, 0);
  v_paid := coalesce((v_po.data->>'paidAmount')::numeric, 0);
  v_new_paid := v_paid + v_amount;

  v_pstatus := case
    when v_new_paid >= v_grand and v_grand > 0 then 'Paid'
    when v_new_paid > 0 then 'Partially Paid'
    else 'Unpaid'
  end;

  update public.purchase_orders
  set data = jsonb_set(
               jsonb_set(data, '{paidAmount}', to_jsonb(v_new_paid)),
               '{paymentStatus}', to_jsonb(v_pstatus)
             ),
      updated_at = now()
  where id = v_po_id and company_id = v_cid;

  v_pay_data := payload || jsonb_build_object(
    'id', v_pay_id,
    'purchaseOrderId', v_po_id,
    'poNumber', v_po.data->>'poNumber',
    'vendorName', v_po.data->>'supplierName',
    'amount', v_amount,
    'paymentDate', coalesce(payload->>'paymentDate', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD')),
    'recordedBy', v_name,
    'createdAt', now()::text
  );

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (
    v_cid, v_uid, 'Purchase Payment Recorded', 'PurchaseOrder', v_po_id,
    format('Recorded payment of INR %s for PO %s (%s)', v_amount, coalesce(v_po.data->>'poNumber', v_po_id), v_po.data->>'supplierName')
  );

  return v_pay_data;
end $$;


--
-- Name: sales_can_see(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sales_can_see(p_created_by uuid, p_data jsonb) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: stamp_password_reset(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_password_reset() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.must_change_password and (tg_op = 'INSERT' or not old.must_change_password
       or new.password_reset_at is distinct from old.password_reset_at) then
    new.password_reset_at := now();
  end if;
  return new;
end $$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at := now(); return new; end $$;


--
-- Name: update_order(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_order(order_id text, updates jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cid uuid := public.my_company();
  v_uid uuid := auth.uid();
  v_role text := public.my_role();
  v_ord record;
  v_updated jsonb;
  v_allowed_keys text[] := array['deliveryStatus','orderStatus','notes','shippingAddress','expectedDeliveryDate','trackingNumber','customerNotes'];
  v_key text;
begin
  if v_cid is null then raise exception 'Unauthorized'; end if;

  select id, data, created_by into v_ord
  from public.orders
  where id = order_id and company_id = v_cid
  for update;

  if not found then raise exception 'Order not found'; end if;

  -- Salesperson restriction: only own orders, and may NEVER touch financial totals or payment status
  if v_role = 'salesperson' then
    if v_ord.created_by <> v_uid and (v_ord.data->>'salespersonId') <> v_uid::text then
      raise exception 'Permission denied: Salespeople may only update orders assigned to them';
    end if;

    if updates ? 'totalAmount' or updates ? 'grandTotal' or updates ? 'subtotal'
       or updates ? 'advancePayment' or updates ? 'balancePayment' or updates ? 'paymentStatus' then
      raise exception 'Permission denied: Salespeople are prohibited from altering financial totals or payment status';
    end if;
  end if;

  -- Filter only allowed keys
  v_updated := v_ord.data;
  for v_key in select * from jsonb_object_keys(updates) loop
    if v_key = any(v_allowed_keys) or (v_role in ('super_admin','owner','admin') and v_key in ('deliveryStatus','orderStatus','notes','shippingAddress','expectedDeliveryDate','trackingNumber','customerNotes')) then
      v_updated := jsonb_set(v_updated, array[v_key], updates->v_key);
    end if;
  end loop;

  v_updated := jsonb_set(v_updated, '{updatedAt}', to_jsonb(now()::text));

  update public.orders
  set data = v_updated,
      updated_at = now()
  where id = order_id and company_id = v_cid;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (
    v_cid, v_uid, 'Order Updated', 'Order', order_id,
    'Updated order ' || coalesce(v_ord.data->>'orderNumber', order_id)
  );

  return v_updated;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid(),
    action text NOT NULL,
    entity text,
    entity_id text,
    details text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: communications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communications (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    kind text NOT NULL,
    token_hash text NOT NULL,
    whatsapp_phone_number_id text,
    allowed_origins text[] DEFAULT '{}'::text[] NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integrations_kind_check CHECK ((kind = ANY (ARRAY['indiamart'::text, 'whatsapp'::text, 'website'::text])))
);


--
-- Name: company_integrations; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.company_integrations WITH (security_invoker='true') AS
 SELECT integrations.id,
    integrations.company_id,
    integrations.kind,
    integrations.whatsapp_phone_number_id,
    integrations.allowed_origins,
    integrations.active,
    integrations.created_at,
    integrations.updated_at
   FROM public.integrations;


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counters (
    company_id uuid NOT NULL,
    kind text NOT NULL,
    value bigint DEFAULT 0 NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_ups (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transactions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_user_id uuid
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    active boolean DEFAULT true NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_access_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_access_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    company_id uuid NOT NULL,
    what text NOT NULL,
    ip_address text,
    accessed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role text DEFAULT 'support'::text NOT NULL,
    name text,
    email text,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT platform_admins_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'support'::text])))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    company_id uuid,
    name text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'salesperson'::text NOT NULL,
    phone text,
    department text,
    active boolean DEFAULT true NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    password_reset_at timestamp with time zone DEFAULT now(),
    password_changed_at timestamp with time zone,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'owner'::text, 'admin'::text, 'manager'::text, 'sales_manager'::text, 'salesperson'::text, 'inventory_manager'::text, 'accounts'::text, 'platform_admin'::text])))
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: quotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotations (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tax_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_invoices (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: communications communications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_pkey PRIMARY KEY (company_id, id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (company_id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (company_id, id);


--
-- Name: counters counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counters
    ADD CONSTRAINT counters_pkey PRIMARY KEY (company_id, kind);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (company_id, id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (company_id, id);


--
-- Name: follow_ups follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (company_id, id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: inventory_transactions inventory_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (company_id, id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (company_id, id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (company_id, id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (company_id, id);


--
-- Name: organizations organizations_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_code_key UNIQUE (code);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (company_id, id);


--
-- Name: platform_access_logs platform_access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_access_logs
    ADD CONSTRAINT platform_access_logs_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (company_id, id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (company_id, id);


--
-- Name: quotations quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_pkey PRIMARY KEY (company_id, id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (company_id, id);


--
-- Name: tax_invoices tax_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_pkey PRIMARY KEY (company_id, id);


--
-- Name: audit_logs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_company_idx ON public.audit_logs USING btree (company_id, created_at DESC);


--
-- Name: communications_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communications_company_idx ON public.communications USING btree (company_id);


--
-- Name: contacts_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_company_idx ON public.contacts USING btree (company_id);


--
-- Name: customers_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_company_idx ON public.customers USING btree (company_id);


--
-- Name: documents_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_company_idx ON public.documents USING btree (company_id);


--
-- Name: follow_ups_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_company_idx ON public.follow_ups USING btree (company_id);


--
-- Name: integrations_company_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integrations_company_kind_idx ON public.integrations USING btree (company_id, kind);


--
-- Name: integrations_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integrations_token_hash_idx ON public.integrations USING btree (token_hash) WHERE (active = true);


--
-- Name: integrations_wa_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integrations_wa_phone_idx ON public.integrations USING btree (whatsapp_phone_number_id) WHERE ((kind = 'whatsapp'::text) AND (active = true));


--
-- Name: inventory_transactions_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_transactions_company_idx ON public.inventory_transactions USING btree (company_id);


--
-- Name: leads_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_company_idx ON public.leads USING btree (company_id);


--
-- Name: leads_company_norm_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_company_norm_phone_idx ON public.leads USING btree (company_id, public.norm_phone_10((data ->> 'mobile'::text)));


--
-- Name: leads_company_unique_query_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leads_company_unique_query_id_idx ON public.leads USING btree (company_id, ((data ->> 'uniqueQueryId'::text))) WHERE (((data ->> 'uniqueQueryId'::text) IS NOT NULL) AND ((data ->> 'uniqueQueryId'::text) <> ''::text));


--
-- Name: notifications_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_company_idx ON public.notifications USING btree (company_id);


--
-- Name: notifications_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_recipient_idx ON public.notifications USING btree (recipient_user_id);


--
-- Name: orders_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_company_idx ON public.orders USING btree (company_id);


--
-- Name: payments_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_company_idx ON public.payments USING btree (company_id);


--
-- Name: platform_access_logs_admin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_access_logs_admin_idx ON public.platform_access_logs USING btree (admin_id);


--
-- Name: platform_access_logs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_access_logs_company_idx ON public.platform_access_logs USING btree (company_id);


--
-- Name: products_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_company_idx ON public.products USING btree (company_id);


--
-- Name: profiles_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_company_idx ON public.profiles USING btree (company_id);


--
-- Name: profiles_lower_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_lower_email_idx ON public.profiles USING btree (lower(email));


--
-- Name: purchase_orders_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_orders_company_idx ON public.purchase_orders USING btree (company_id);


--
-- Name: quotations_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotations_company_idx ON public.quotations USING btree (company_id);


--
-- Name: tasks_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_company_idx ON public.tasks USING btree (company_id);


--
-- Name: tax_invoices_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_invoices_company_idx ON public.tax_invoices USING btree (company_id);


--
-- Name: communications communications_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER communications_touch BEFORE UPDATE ON public.communications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: contacts contacts_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contacts_touch BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: customers customers_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: documents documents_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER documents_touch BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: follow_ups follow_ups_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER follow_ups_touch BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: inventory_transactions inventory_transactions_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_transactions_touch BEFORE UPDATE ON public.inventory_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: leads leads_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: notifications notifications_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notifications_touch BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: orders orders_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: payments payments_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payments_touch BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: products products_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: profiles profiles_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();


--
-- Name: profiles profiles_stamp_reset; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_stamp_reset BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.stamp_password_reset();


--
-- Name: purchase_orders purchase_orders_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER purchase_orders_touch BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: quotations quotations_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER quotations_touch BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: tasks tasks_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tasks_touch BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: tax_invoices tax_invoices_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_invoices_touch BEFORE UPDATE ON public.tax_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: customers trg_audit_customers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_customers AFTER INSERT OR DELETE OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.log_table_change();


--
-- Name: leads trg_audit_leads; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_leads AFTER INSERT OR DELETE OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.log_table_change();


--
-- Name: orders trg_audit_orders; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_orders AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_table_change();


--
-- Name: payments trg_audit_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_payments AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.log_table_change();


--
-- Name: products trg_audit_products; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_products AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.log_table_change();


--
-- Name: purchase_orders trg_audit_purchase_orders; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_purchase_orders AFTER INSERT OR DELETE OR UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.log_table_change();


--
-- Name: quotations trg_audit_quotations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_quotations AFTER INSERT OR DELETE OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.log_table_change();


--
-- Name: tax_invoices trg_audit_tax_invoices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_tax_invoices AFTER INSERT OR DELETE OR UPDATE ON public.tax_invoices FOR EACH ROW EXECUTE FUNCTION public.log_table_change();


--
-- Name: products trg_guard_product_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_product_stock BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.guard_product_stock_update();


--
-- Name: profiles trg_guard_profile_seat_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_profile_seat_limit BEFORE INSERT OR UPDATE OF active ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_seat_limit();


--
-- Name: audit_logs audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: communications communications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: company_settings company_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: counters counters_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counters
    ADD CONSTRAINT counters_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: customers customers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: documents documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: follow_ups follow_ups_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: integrations integrations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: inventory_transactions inventory_transactions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: leads leads_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: orders orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: payments payments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: platform_access_logs platform_access_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_access_logs
    ADD CONSTRAINT platform_access_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: platform_access_logs platform_access_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_access_logs
    ADD CONSTRAINT platform_access_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: platform_admins platform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: products products_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: quotations quotations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tax_invoices tax_invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: audit_logs add audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "add audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND (user_id = auth.uid())));


--
-- Name: audit_logs admins read audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read audit" ON public.audit_logs FOR SELECT TO authenticated USING (((company_id = public.my_company()) AND public.has_role(ARRAY['super_admin'::text, 'owner'::text, 'admin'::text])));


--
-- Name: company_settings admins write settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins write settings" ON public.company_settings TO authenticated USING (((company_id = public.my_company()) AND public.has_role(ARRAY['super_admin'::text, 'owner'::text, 'admin'::text]))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: communications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: communications delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.communications FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: contacts delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.contacts FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: customers delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.customers FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: documents delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.documents FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: follow_ups delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.follow_ups FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: inventory_transactions delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.inventory_transactions FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: leads delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.leads FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,sales_manager,manager}'::text[])));


--
-- Name: notifications delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.notifications FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: orders delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.orders FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: payments delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.payments FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: products delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.products FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: purchase_orders delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.purchase_orders FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: quotations delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.quotations FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,sales_manager,manager}'::text[])));


--
-- Name: tasks delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.tasks FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: tax_invoices delete own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own company" ON public.tax_invoices FOR DELETE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin}'::text[])));


--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles edit people; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "edit people" ON public.profiles FOR UPDATE TO authenticated USING (((id = auth.uid()) OR ((company_id = public.my_company()) AND public.has_role(ARRAY['super_admin'::text, 'owner'::text, 'admin'::text])))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: follow_ups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: communications insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.communications FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[])));


--
-- Name: contacts insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.contacts FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[])));


--
-- Name: customers insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.customers FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[])));


--
-- Name: documents insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.documents FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[])));


--
-- Name: follow_ups insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.follow_ups FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[])));


--
-- Name: inventory_transactions insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.inventory_transactions FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,inventory_manager,manager,sales_manager}'::text[])));


--
-- Name: leads insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.leads FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[])));


--
-- Name: notifications insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.notifications FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[])));


--
-- Name: orders insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.orders FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[])));


--
-- Name: payments insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.payments FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,accounts,manager,sales_manager}'::text[])));


--
-- Name: products insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.products FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,inventory_manager}'::text[])));


--
-- Name: purchase_orders insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,accounts,inventory_manager,manager}'::text[])));


--
-- Name: quotations insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.quotations FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[])));


--
-- Name: tasks insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.tasks FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[])));


--
-- Name: tax_invoices insert own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own company" ON public.tax_invoices FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,accounts,manager,sales_manager}'::text[])));


--
-- Name: integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations owners see own integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owners see own integrations" ON public.integrations FOR SELECT TO authenticated USING (((company_id = public.my_company()) AND public.has_role(ARRAY['super_admin'::text, 'owner'::text, 'admin'::text])));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_access_logs platform admins see access logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform admins see access logs" ON public.platform_access_logs FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: platform_admins platform admins see self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform admins see self" ON public.platform_admins FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: audit_logs platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.audit_logs FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: communications platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.communications FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: company_settings platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.company_settings FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: contacts platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.contacts FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: customers platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.customers FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: documents platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.documents FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: follow_ups platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.follow_ups FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: inventory_transactions platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.inventory_transactions FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: leads platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.leads FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: orders platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.orders FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: organizations platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.organizations FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: payments platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.payments FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: products platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.products FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: profiles platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.profiles FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: purchase_orders platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.purchase_orders FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: quotations platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.quotations FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: tasks platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.tasks FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: tax_invoices platform viewer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform viewer read" ON public.tax_invoices FOR SELECT TO authenticated USING (public.platform_can_view_data());


--
-- Name: platform_access_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_access_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: quotations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

--
-- Name: communications read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.communications FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: contacts read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.contacts FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: customers read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.customers FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: documents read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.documents FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: follow_ups read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.follow_ups FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: inventory_transactions read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.inventory_transactions FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: leads read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.leads FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: notifications read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.notifications FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: orders read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.orders FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: payments read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.payments FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: products read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.products FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: purchase_orders read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.purchase_orders FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: quotations read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.quotations FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: tasks read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.tasks FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: tax_invoices read own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own company" ON public.tax_invoices FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: company_settings read settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read settings" ON public.company_settings FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: customers see company data with visibility; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "see company data with visibility" ON public.customers FOR SELECT TO authenticated USING (((company_id = public.my_company()) AND public.sales_can_see(created_by, data)));


--
-- Name: follow_ups see company data with visibility; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "see company data with visibility" ON public.follow_ups FOR SELECT TO authenticated USING (((company_id = public.my_company()) AND public.sales_can_see(created_by, data)));


--
-- Name: leads see company data with visibility; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "see company data with visibility" ON public.leads FOR SELECT TO authenticated USING (((company_id = public.my_company()) AND public.sales_can_see(created_by, data)));


--
-- Name: orders see company data with visibility; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "see company data with visibility" ON public.orders FOR SELECT TO authenticated USING (((company_id = public.my_company()) AND public.sales_can_see(created_by, data)));


--
-- Name: quotations see company data with visibility; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "see company data with visibility" ON public.quotations FOR SELECT TO authenticated USING (((company_id = public.my_company()) AND public.sales_can_see(created_by, data)));


--
-- Name: tasks see company data with visibility; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "see company data with visibility" ON public.tasks FOR SELECT TO authenticated USING (((company_id = public.my_company()) AND public.sales_can_see(created_by, data)));


--
-- Name: profiles see company people; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "see company people" ON public.profiles FOR SELECT TO authenticated USING ((company_id = public.my_company()));


--
-- Name: organizations see own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "see own company" ON public.organizations FOR SELECT TO authenticated USING ((id = public.my_company()));


--
-- Name: notifications see own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "see own notifications" ON public.notifications FOR SELECT TO authenticated USING (((company_id = public.my_company()) AND ((recipient_user_id = auth.uid()) OR (recipient_user_id IS NULL))));


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: communications update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.communications FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[]))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: contacts update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.contacts FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[]))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: customers update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.customers FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[]) AND (public.has_role('{super_admin,owner,admin,manager,sales_manager}'::text[]) OR (created_by = auth.uid()) OR ((data ->> 'assignedSalespersonId'::text) = (auth.uid())::text)))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: documents update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.documents FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[]))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: follow_ups update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.follow_ups FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[]) AND (public.has_role('{super_admin,owner,admin,manager,sales_manager}'::text[]) OR (created_by = auth.uid()) OR ((data ->> 'assignedSalespersonId'::text) = (auth.uid())::text)))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: inventory_transactions update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.inventory_transactions FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,inventory_manager,manager,sales_manager}'::text[]))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: leads update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.leads FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[]) AND (public.has_role('{super_admin,owner,admin,manager,sales_manager}'::text[]) OR (created_by = auth.uid()) OR ((data ->> 'assignedSalespersonId'::text) = (auth.uid())::text)))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: notifications update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.notifications FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[]))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: orders update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.orders FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[]))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: payments update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.payments FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,accounts,manager,sales_manager}'::text[]))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: products update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.products FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,inventory_manager}'::text[]))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: purchase_orders update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.purchase_orders FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,accounts,inventory_manager,manager}'::text[]))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: quotations update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.quotations FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[]) AND (public.has_role('{super_admin,owner,admin,manager,sales_manager}'::text[]) OR (created_by = auth.uid()) OR ((data ->> 'assignedSalespersonId'::text) = (auth.uid())::text)))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: tasks update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.tasks FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,manager,sales_manager,salesperson,inventory_manager,accounts}'::text[]) AND (public.has_role('{super_admin,owner,admin,manager,sales_manager}'::text[]) OR (created_by = auth.uid()) OR ((data ->> 'assignedSalespersonId'::text) = (auth.uid())::text)))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: tax_invoices update own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own company" ON public.tax_invoices FOR UPDATE TO authenticated USING (((company_id = public.my_company()) AND public.has_role('{super_admin,owner,admin,accounts,manager,sales_manager}'::text[]))) WITH CHECK ((company_id = public.my_company()));


--
-- Name: FUNCTION ack_password_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ack_password_changed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ack_password_changed() TO authenticated;


--
-- Name: FUNCTION cancel_tax_invoice(invoice_id text, reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_tax_invoice(invoice_id text, reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_tax_invoice(invoice_id text, reason text) TO authenticated;


--
-- Name: FUNCTION check_duplicate_lead(p_mobile text, p_email text, p_exclude text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_duplicate_lead(p_mobile text, p_email text, p_exclude text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_duplicate_lead(p_mobile text, p_email text, p_exclude text) TO authenticated;


--
-- Name: FUNCTION convert_lead_to_customer(lead_id text, extra jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.convert_lead_to_customer(lead_id text, extra jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.convert_lead_to_customer(lead_id text, extra jsonb) TO authenticated;


--
-- Name: FUNCTION convert_quotation_to_order(quotation_id text, extra jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.convert_quotation_to_order(quotation_id text, extra jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.convert_quotation_to_order(quotation_id text, extra jsonb) TO authenticated;


--
-- Name: FUNCTION create_order(payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_order(payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_order(payload jsonb) TO authenticated;


--
-- Name: FUNCTION create_quotation(payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_quotation(payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_quotation(payload jsonb) TO authenticated;


--
-- Name: FUNCTION create_tax_invoice(payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_tax_invoice(payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_tax_invoice(payload jsonb) TO authenticated;


--
-- Name: FUNCTION delete_payment(payment_id text, reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_payment(payment_id text, reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_payment(payment_id text, reason text) TO authenticated;


--
-- Name: FUNCTION find_lead_by_phone(p_company uuid, p_phone text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.find_lead_by_phone(p_company uuid, p_phone text) FROM PUBLIC;


--
-- Name: FUNCTION get_dashboard_metrics(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_dashboard_metrics() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_dashboard_metrics() TO authenticated;


--
-- Name: FUNCTION get_platform_metrics(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_platform_metrics() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_platform_metrics() TO authenticated;


--
-- Name: FUNCTION import_leads(rows jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.import_leads(rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_leads(rows jsonb) TO authenticated;


--
-- Name: FUNCTION inventory_transaction(payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.inventory_transaction(payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_transaction(payload jsonb) TO authenticated;


--
-- Name: FUNCTION is_platform_admin(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_platform_admin(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_platform_admin(p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION next_seq(p_kind text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.next_seq(p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.next_seq(p_kind text) TO authenticated;


--
-- Name: FUNCTION next_seq_for(p_company uuid, p_kind text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.next_seq_for(p_company uuid, p_kind text) FROM PUBLIC;


--
-- Name: FUNCTION platform_can_view_data(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.platform_can_view_data() FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_can_view_data() TO authenticated;


--
-- Name: FUNCTION platform_role(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.platform_role(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_role(p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION receive_purchase_order(po_id text, update_inventory boolean, notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.receive_purchase_order(po_id text, update_inventory boolean, notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.receive_purchase_order(po_id text, update_inventory boolean, notes text) TO authenticated;


--
-- Name: FUNCTION record_audit_log(p_action text, p_entity text, p_entity_id text, p_details text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_audit_log(p_action text, p_entity text, p_entity_id text, p_details text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_audit_log(p_action text, p_entity text, p_entity_id text, p_details text) TO authenticated;


--
-- Name: FUNCTION record_inbound_lead(p_company uuid, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_inbound_lead(p_company uuid, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_inbound_lead(p_company uuid, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION record_password_change_time(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_password_change_time() FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_password_change_time() TO authenticated;


--
-- Name: FUNCTION record_payment(payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_payment(payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_payment(payload jsonb) TO authenticated;


--
-- Name: FUNCTION record_platform_support_access(p_company_id uuid, p_what text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_platform_support_access(p_company_id uuid, p_what text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_platform_support_access(p_company_id uuid, p_what text) TO authenticated;


--
-- Name: FUNCTION record_purchase_payment(payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_purchase_payment(payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_purchase_payment(payload jsonb) TO authenticated;


--
-- Name: FUNCTION sales_can_see(p_created_by uuid, p_data jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sales_can_see(p_created_by uuid, p_data jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sales_can_see(p_created_by uuid, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION update_order(order_id text, updates jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_order(order_id text, updates jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_order(order_id text, updates jsonb) TO authenticated;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.audit_logs TO authenticated;


--
-- Name: TABLE communications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.communications TO authenticated;


--
-- Name: COLUMN integrations.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.integrations TO authenticated;


--
-- Name: COLUMN integrations.company_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(company_id) ON TABLE public.integrations TO authenticated;


--
-- Name: COLUMN integrations.kind; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(kind) ON TABLE public.integrations TO authenticated;


--
-- Name: COLUMN integrations.whatsapp_phone_number_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(whatsapp_phone_number_id) ON TABLE public.integrations TO authenticated;


--
-- Name: COLUMN integrations.allowed_origins; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(allowed_origins) ON TABLE public.integrations TO authenticated;


--
-- Name: COLUMN integrations.active; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(active) ON TABLE public.integrations TO authenticated;


--
-- Name: COLUMN integrations.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.integrations TO authenticated;


--
-- Name: COLUMN integrations.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.integrations TO authenticated;


--
-- Name: TABLE company_integrations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.company_integrations TO authenticated;


--
-- Name: TABLE company_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.company_settings TO authenticated;


--
-- Name: TABLE contacts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.contacts TO authenticated;


--
-- Name: TABLE customers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customers TO authenticated;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.documents TO authenticated;


--
-- Name: TABLE follow_ups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.follow_ups TO authenticated;


--
-- Name: TABLE inventory_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_transactions TO authenticated;


--
-- Name: TABLE leads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.leads TO authenticated;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.notifications TO authenticated;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.orders TO authenticated;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,UPDATE ON TABLE public.organizations TO authenticated;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.payments TO authenticated;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.products TO authenticated;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,UPDATE ON TABLE public.profiles TO authenticated;


--
-- Name: TABLE purchase_orders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.purchase_orders TO authenticated;


--
-- Name: TABLE quotations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.quotations TO authenticated;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tasks TO authenticated;


--
-- Name: TABLE tax_invoices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.tax_invoices TO authenticated;


--
-- PostgreSQL database dump complete
--


