-- =====================================================================
-- StockItEase - FIX: server functions must use the SAME field names as the app screens
-- Problems fixed (all found by testing 03_functions.sql):
--  * create_quotation read "discountPercent" but the app sends "discountPercentage",
--    so every discount was ignored and the customer was over-charged.
--  * It wrote discountAmount/gstAmount, but quotation screens and the PDF read
--    discountTotal/gstTotal, so the PDF would crash ("undefined").
--  * It copied whatever the browser sent into the saved quotation (a user could
--    inject fields such as status or convertedOrderId).
--  * convert_quotation_to_order wrote grandTotal/advanceAmount/status, but the Orders
--    screen reads totalAmount/advancePayment/balancePayment/orderStatus/deliveryStatus,
--    it no longer reserved stock, and any salesperson could convert any quotation.
--  * convert_lead_to_customer: same ownership gap.
-- Run AFTER 04_fix_company_ids.sql. Safe to re-run.
-- =====================================================================

create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select name from public.profiles where id = auth.uid() and active
$$;

-- ---------------- create_quotation ----------------
create or replace function public.create_quotation(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.create_quotation(jsonb) from public, anon;
grant execute on function public.create_quotation(jsonb) to authenticated;

-- ---------------- convert_lead_to_customer ----------------
create or replace function public.convert_lead_to_customer(lead_id text, extra jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cid uuid := public.my_company();
  v_lead jsonb; v_created_by uuid;
  v_exist record; v_cust jsonb; v_cust_id text; v_seq bigint; v_contact_id text;
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
      'customerType', coalesce(extra->>'customerType', 'Manufacturer'),
      'industry', coalesce(extra->>'industry', 'Footwear Manufacturing'),
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

-- ---------------- convert_quotation_to_order ----------------
drop function if exists public.convert_quotation_to_order(text, numeric);
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
  if v_adv > v_grand then raise exception 'Advance payment cannot exceed the grand total.'; end if;

  -- stock check first (nothing is saved if stock is short, unless an admin accepts it)
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

  -- reserve stock
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
