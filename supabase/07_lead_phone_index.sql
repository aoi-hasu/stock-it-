-- =====================================================================
-- StockItEase - Fast Indexed Phone Lookup for Lead Capture & Webhooks
-- Expression index on (company_id, right(regexp_replace(data->>'mobile','\D','','g'),10))
-- RPC function find_lead_by_phone (Service Role Only)
-- =====================================================================

-- Helper immutable function to ensure index can be created reliably
create or replace function public.norm_phone_10(p text) returns text
language sql immutable parallel safe as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
$$;

-- Expression index on leads table
create index if not exists leads_company_norm_phone_idx
on public.leads (company_id, (public.norm_phone_10(data->>'mobile')));

-- RPC function: find_lead_by_phone
create or replace function public.find_lead_by_phone(p_company uuid, p_phone text)
returns jsonb
language plpgsql security definer set search_path = public as $$
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

-- Revoke execute from public, anon, and authenticated (service role only)
revoke all on function public.find_lead_by_phone(uuid, text) from public, anon, authenticated;
