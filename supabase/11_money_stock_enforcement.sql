-- =====================================================================
-- 11_money_stock_enforcement.sql
-- StockItEase - Strict Money & Stock Rules Enforced in Database
-- Idempotent script. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Revoke direct mutations on financial tables from authenticated
-- ---------------------------------------------------------------------
revoke insert, update, delete on public.orders from authenticated, anon, public;
revoke insert, update, delete on public.payments from authenticated, anon, public;
revoke insert, update, delete on public.tax_invoices from authenticated, anon, public;

-- ---------------------------------------------------------------------
-- 2. Guard trigger: Prevent direct modification of product stock levels
-- ---------------------------------------------------------------------
create or replace function public.guard_product_stock_update()
returns trigger
language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_guard_product_stock on public.products;
create trigger trg_guard_product_stock
  before update on public.products
  for each row execute function public.guard_product_stock_update();

-- ---------------------------------------------------------------------
-- 3. inventory_transaction: Support negative/signed Adjustment with reason
-- ---------------------------------------------------------------------
create or replace function public.inventory_transaction(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.inventory_transaction(jsonb) from public, anon;
grant execute on function public.inventory_transaction(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4. create_order: Unified order numbering & server-side financial calculation
-- ---------------------------------------------------------------------
create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.create_order(jsonb) from public, anon;
grant execute on function public.create_order(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. update_order: Allowed fields only, salespeople restricted to own
-- ---------------------------------------------------------------------
create or replace function public.update_order(order_id text, updates jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.update_order(text, jsonb) from public, anon;
grant execute on function public.update_order(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. delete_payment: Admin only, reverses order balance atomically
-- ---------------------------------------------------------------------
create or replace function public.delete_payment(payment_id text, reason text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.delete_payment(text, text) from public, anon;
grant execute on function public.delete_payment(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. cancel_tax_invoice: No deletes, keeps invoice number, records reason
-- ---------------------------------------------------------------------
create or replace function public.cancel_tax_invoice(invoice_id text, reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.cancel_tax_invoice(text, text) from public, anon;
grant execute on function public.cancel_tax_invoice(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. create_tax_invoice: Ensure Indian FY consecutive numbering & max 16 chars
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
revoke all on function public.create_tax_invoice(jsonb) from public, anon;
grant execute on function public.create_tax_invoice(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 8. receive_purchase_order: Atomically add stock & update PO status
-- ---------------------------------------------------------------------
create or replace function public.receive_purchase_order(po_id text, update_inventory boolean default true, notes text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.receive_purchase_order(text, boolean, text) from public, anon;
grant execute on function public.receive_purchase_order(text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. record_purchase_payment: Atomic payment recording for purchase orders
-- ---------------------------------------------------------------------
create or replace function public.record_purchase_payment(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.record_purchase_payment(jsonb) from public, anon;
grant execute on function public.record_purchase_payment(jsonb) to authenticated;
