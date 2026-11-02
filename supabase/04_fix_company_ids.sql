-- =====================================================================
-- 04_fix_company_ids.sql
-- StockItEase - Multi-Tenant Compound Key Alignment
-- Allows different organizations to independently assign IDs (e.g. 'cust-001')
-- by scoping primary keys to (company_id, id).
-- =====================================================================

do $$
declare
  t text;
  tables text[] := array['leads','customers','contacts','products',
    'inventory_transactions','quotations','orders','payments','follow_ups',
    'tasks','communications','documents','tax_invoices','purchase_orders',
    'notifications'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I drop constraint if exists %I_pkey cascade', t, t);
    execute format('alter table public.%I add primary key (company_id, id)', t);
  end loop;
end $$;
