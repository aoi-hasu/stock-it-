-- =====================================================================
-- StockItEase (a product of aoihasu) - Server-side Business Functions
-- Security: SECURITY DEFINER with search_path = public.
-- Enforces row-locking, atomic updates, and role/company restrictions.
-- =====================================================================

-- 1. Atomic Quotation Creation with Server-side Totals Calculation
create or replace function public.create_quotation(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_id uuid := public.my_company();
  u_id uuid := auth.uid();
  q_seq bigint;
  q_prefix text := 'QTN';
  q_number text;
  q_id text := gen_random_uuid()::text;
  settings_row record;
  items_arr jsonb := coalesce(payload->'items', '[]'::jsonb);
  item jsonb;
  recalculated_items jsonb := '[]'::jsonb;
  v_qty numeric;
  v_unit_price numeric;
  v_discount_pct numeric;
  v_gst_pct numeric;
  v_line_subtotal numeric;
  v_line_discount numeric;
  v_line_taxable numeric;
  v_line_gst numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_total_discount numeric := 0;
  v_taxable_amount numeric := 0;
  v_total_gst numeric := 0;
  v_grand_total numeric := 0;
  quotation_data jsonb;
  lead_id text;
  lead_row record;
begin
  if c_id is null then raise exception 'Unauthorized: No active company context'; end if;
  if not public.has_role(array['super_admin','owner','admin','manager','sales_manager','salesperson','inventory_manager','accounts']) then
    raise exception 'Unauthorized role for creating quotations';
  end if;

  -- Get quotation prefix from company_settings if configured
  select data into settings_row from public.company_settings where company_id = c_id;
  if found and settings_row.data->>'quotationPrefix' is not null and trim(settings_row.data->>'quotationPrefix') <> '' then
    q_prefix := trim(settings_row.data->>'quotationPrefix');
  end if;

  -- Generate gap-free sequence number
  q_seq := public.next_seq('quotation');
  q_number := format('%s-%s-%s', q_prefix, to_char(now(), 'YYYY'), lpad(q_seq::text, 4, '0'));

  -- Recalculate each item's financial values strictly on server
  for item in select * from jsonb_array_elements(items_arr) loop
    v_qty := greatest(1, coalesce((item->>'quantity')::numeric, 1));
    v_unit_price := greatest(0, coalesce((item->>'unitPrice')::numeric, 0));
    v_discount_pct := least(100, greatest(0, coalesce((item->>'discountPercent')::numeric, 0)));
    v_gst_pct := coalesce((item->>'gstPercentage')::numeric, 18);

    v_line_subtotal := v_qty * v_unit_price;
    v_line_discount := (v_line_subtotal * v_discount_pct) / 100.0;
    v_line_taxable := v_line_subtotal - v_line_discount;
    v_line_gst := (v_line_taxable * v_gst_pct) / 100.0;
    v_line_total := v_line_taxable + v_line_gst;

    v_subtotal := v_subtotal + v_line_subtotal;
    v_total_discount := v_total_discount + v_line_discount;
    v_taxable_amount := v_taxable_amount + v_line_taxable;
    v_total_gst := v_total_gst + v_line_gst;
    v_grand_total := v_grand_total + v_line_total;

    recalculated_items := recalculated_items || jsonb_build_array(
      item || jsonb_build_object(
        'quantity', v_qty,
        'unitPrice', v_unit_price,
        'discountPercent', v_discount_pct,
        'gstPercentage', v_gst_pct,
        'totalPrice', round(v_line_subtotal, 2),
        'taxableAmount', round(v_line_taxable, 2),
        'gstAmount', round(v_line_gst, 2),
        'grandTotal', round(v_line_total, 2)
      )
    );
  end loop;

  -- Build complete quotation payload
  quotation_data := payload || jsonb_build_object(
    'id', q_id,
    'quotationNumber', q_number,
    'items', recalculated_items,
    'subtotal', round(v_subtotal, 2),
    'discountAmount', round(v_total_discount, 2),
    'taxableAmount', round(v_taxable_amount, 2),
    'gstAmount', round(v_total_gst, 2),
    'grandTotal', round(v_grand_total, 2),
    'status', coalesce(payload->>'status', 'Draft'),
    'quotationDate', coalesce(payload->>'quotationDate', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD')),
    'createdAt', now()::text,
    'updatedAt', now()::text
  );

  insert into public.quotations (id, company_id, data, created_by)
  values (q_id, c_id, quotation_data, u_id);

  -- Update associated lead stage to "Quotation Sent" if applicable
  lead_id := payload->>'leadId';
  if lead_id is not null and lead_id <> '' then
    select id, data into lead_row from public.leads where id = lead_id and company_id = c_id for update;
    if found then
      if lead_row.data->>'status' in ('New', 'Contacted', 'Requirement Identified') then
        update public.leads
        set data = jsonb_set(data, '{status}', '"Quotation Sent"'),
            updated_at = now()
        where id = lead_id and company_id = c_id;
      end if;
    end if;
  end if;

  return quotation_data;
end;
$$;
revoke all on function public.create_quotation(jsonb) from public, anon;
grant execute on function public.create_quotation(jsonb) to authenticated;


-- 2. Atomic Inventory Transaction with Row Locking
create or replace function public.inventory_transaction(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_id uuid := public.my_company();
  u_id uuid := auth.uid();
  p_id text := payload->>'productId';
  tx_type text := payload->>'transactionType';
  qty numeric := coalesce((payload->>'quantity')::numeric, 0);
  allow_neg boolean := coalesce((payload->>'allowNegative')::boolean, false);
  is_admin boolean;
  prod_row record;
  cur_stock numeric := 0;
  avail_stock numeric := 0;
  res_stock numeric := 0;
  tx_id text := gen_random_uuid()::text;
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
    allow_neg := false; -- non-admins cannot bypass negative stock check
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
      cur_stock := cur_stock + qty;
      avail_stock := avail_stock + qty;

    else
      raise exception 'Unknown inventory transaction type: %', tx_type;
  end case;

  -- Atomic update of product stock levels
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

  tx_data := payload || jsonb_build_object(
    'id', tx_id,
    'productId', p_id,
    'productName', coalesce(payload->>'productName', prod_row.data->>'name'),
    'quantity', qty,
    'currentStockAfter', cur_stock,
    'availableStockAfter', avail_stock,
    'date', coalesce(payload->>'date', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD')),
    'userId', u_id::text,
    'createdAt', now()::text
  );

  insert into public.inventory_transactions (id, company_id, data, created_by)
  values (tx_id, c_id, tx_data, u_id);

  return tx_data;
end;
$$;
revoke all on function public.inventory_transaction(jsonb) from public, anon;
grant execute on function public.inventory_transaction(jsonb) to authenticated;


-- 3. Lead to Customer Conversion (Prevents duplicate conversion)
create or replace function public.convert_lead_to_customer(lead_id text, extra jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_id uuid := public.my_company();
  u_id uuid := auth.uid();
  lead_row record;
  cust_seq bigint;
  cust_id text;
  contact_id text := gen_random_uuid()::text;
  cust_data jsonb;
  contact_data jsonb;
begin
  if c_id is null then raise exception 'Unauthorized: No active company context'; end if;
  if not public.has_role(array['super_admin','owner','admin','manager','sales_manager','salesperson']) then
    raise exception 'Unauthorized role for converting leads';
  end if;

  select id, data into lead_row from public.leads where id = lead_id and company_id = c_id for update;
  if not found then raise exception 'Lead not found'; end if;

  if lead_row.data->>'status' = 'Won' or lead_row.data->>'convertedCustomerId' is not null then
    raise exception 'Lead has already been converted to a customer';
  end if;

  cust_seq := public.next_seq('customer');
  cust_id := format('CUST-%s-%s', to_char(now(), 'YYYY'), lpad(cust_seq::text, 4, '0'));

  cust_data := jsonb_build_object(
    'id', cust_id,
    'companyName', coalesce(lead_row.data->>'companyName', 'Unknown Company'),
    'contactPerson', coalesce(lead_row.data->>'contactPerson', 'Authorized Representative'),
    'mobile', coalesce(lead_row.data->>'mobile', ''),
    'whatsapp', coalesce(lead_row.data->>'whatsapp', lead_row.data->>'mobile', ''),
    'email', coalesce(lead_row.data->>'email', ''),
    'city', coalesce(lead_row.data->>'city', ''),
    'state', coalesce(lead_row.data->>'state', ''),
    'country', coalesce(lead_row.data->>'country', 'India'),
    'address', coalesce(extra->>'address', lead_row.data->>'address', ''),
    'gstNumber', coalesce(extra->>'gstNumber', ''),
    'pan', coalesce(extra->>'pan', ''),
    'customerType', coalesce(extra->>'customerType', 'Manufacturer'),
    'industry', coalesce(extra->>'industry', lead_row.data->>'productInterested', 'Manufacturing'),
    'assignedSalespersonId', lead_row.data->>'assignedSalespersonId',
    'assignedSalespersonName', lead_row.data->>'assignedSalespersonName',
    'status', 'Active',
    'convertedFromLeadId', lead_id,
    'notes', coalesce(extra->>'notes', format('Converted from Lead %s on %s', lead_id, to_char(now(), 'YYYY-MM-DD'))),
    'createdAt', now()::text,
    'updatedAt', now()::text
  );

  insert into public.customers (id, company_id, data, created_by)
  values (cust_id, c_id, cust_data, u_id);

  -- Create primary contact
  contact_data := jsonb_build_object(
    'id', contact_id,
    'customerId', cust_id,
    'customerName', cust_data->>'companyName',
    'name', cust_data->>'contactPerson',
    'designation', 'Primary Contact',
    'mobile', cust_data->>'mobile',
    'whatsapp', cust_data->>'whatsapp',
    'email', cust_data->>'email',
    'department', 'Management',
    'isPrimary', true,
    'createdAt', now()::text
  );

  insert into public.contacts (id, company_id, data, created_by)
  values (contact_id, c_id, contact_data, u_id);

  -- Mark lead won
  update public.leads
  set data = jsonb_set(
               jsonb_set(data, '{status}', '"Won"'),
               '{convertedCustomerId}', to_jsonb(cust_id)
             ),
      updated_at = now()
  where id = lead_id and company_id = c_id;

  return jsonb_build_object('success', true, 'customer', cust_data, 'leadId', lead_id);
end;
$$;
revoke all on function public.convert_lead_to_customer(text, jsonb) from public, anon;
grant execute on function public.convert_lead_to_customer(text, jsonb) to authenticated;


-- 4. Quotation to Order Conversion (Prevents duplicate conversion)
create or replace function public.convert_quotation_to_order(quotation_id text, extra jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_id uuid := public.my_company();
  u_id uuid := auth.uid();
  q_row record;
  settings_row record;
  ord_prefix text := 'ORD';
  ord_seq bigint;
  ord_id text := gen_random_uuid()::text;
  ord_number text;
  advance_amt numeric := coalesce((extra->>'advancePayment')::numeric, 0);
  order_data jsonb;
  pay_seq bigint;
  pay_id text;
  pay_data jsonb;
begin
  if c_id is null then raise exception 'Unauthorized: No active company context'; end if;
  if not public.has_role(array['super_admin','owner','admin','manager','sales_manager','salesperson']) then
    raise exception 'Unauthorized role for converting quotations';
  end if;

  select id, data into q_row from public.quotations where id = quotation_id and company_id = c_id for update;
  if not found then raise exception 'Quotation not found'; end if;

  if q_row.data->>'status' = 'Converted' or q_row.data->>'convertedOrderId' is not null then
    raise exception 'Quotation has already been converted to an order';
  end if;

  select data into settings_row from public.company_settings where company_id = c_id;
  if found and settings_row.data->>'orderPrefix' is not null and trim(settings_row.data->>'orderPrefix') <> '' then
    ord_prefix := trim(settings_row.data->>'orderPrefix');
  end if;

  ord_seq := public.next_seq('order');
  ord_number := format('%s-%s-%s', ord_prefix, to_char(now(), 'YYYY'), lpad(ord_seq::text, 4, '0'));

  order_data := jsonb_build_object(
    'id', ord_id,
    'orderNumber', ord_number,
    'quotationId', quotation_id,
    'quotationNumber', q_row.data->>'quotationNumber',
    'customerId', q_row.data->>'customerId',
    'customerName', q_row.data->>'customerName',
    'contactPerson', q_row.data->>'contactPerson',
    'orderDate', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
    'items', q_row.data->'items',
    'subtotal', q_row.data->'subtotal',
    'discountAmount', q_row.data->'discountAmount',
    'taxableAmount', q_row.data->'taxableAmount',
    'gstAmount', q_row.data->'gstAmount',
    'grandTotal', q_row.data->'grandTotal',
    'advanceAmount', advance_amt,
    'paidAmount', advance_amt,
    'status', case when advance_amt > 0 then 'Confirmed' else 'Pending Payment' end,
    'paymentStatus', case
                       when advance_amt >= coalesce((q_row.data->>'grandTotal')::numeric, 0) then 'Paid'
                       when advance_amt > 0 then 'Partially Paid'
                       else 'Unpaid'
                     end,
    'assignedSalespersonId', q_row.data->>'assignedSalespersonId',
    'assignedSalespersonName', q_row.data->>'assignedSalespersonName',
    'createdAt', now()::text,
    'updatedAt', now()::text
  );

  insert into public.orders (id, company_id, data, created_by)
  values (ord_id, c_id, order_data, u_id);

  -- Record advance payment if present
  if advance_amt > 0 then
    pay_seq := public.next_seq('payment');
    pay_id := format('PAY-%s-%s', to_char(now(), 'YYYY'), lpad(pay_seq::text, 4, '0'));
    pay_data := jsonb_build_object(
      'id', pay_id,
      'orderId', ord_id,
      'orderNumber', ord_number,
      'customerId', order_data->>'customerId',
      'customerName', order_data->>'customerName',
      'amount', advance_amt,
      'paymentDate', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
      'paymentMode', coalesce(extra->>'paymentMode', 'Bank Transfer (NEFT/RTGS)'),
      'referenceNumber', coalesce(extra->>'referenceNumber', ''),
      'notes', 'Advance payment against Order confirmation',
      'status', 'Received',
      'createdAt', now()::text
    );
    insert into public.payments (id, company_id, data, created_by)
    values (pay_id, c_id, pay_data, u_id);
  end if;

  -- Update quotation status
  update public.quotations
  set data = jsonb_set(
               jsonb_set(data, '{status}', '"Converted"'),
               '{convertedOrderId}', to_jsonb(ord_id)
             ),
      updated_at = now()
  where id = quotation_id and company_id = c_id;

  return jsonb_build_object('success', true, 'order', order_data);
end;
$$;
revoke all on function public.convert_quotation_to_order(text, jsonb) from public, anon;
grant execute on function public.convert_quotation_to_order(text, jsonb) to authenticated;
