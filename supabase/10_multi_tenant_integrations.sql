-- =====================================================================
-- 10_multi_tenant_integrations.sql
-- StockItEase - Multi-Tenant Integrations & Race-Safe Inbound Lead Deduplication
-- Idempotent script. Safe to re-run.
-- =====================================================================

-- 1. Table: integrations
create table if not exists public.integrations (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.organizations(id) on delete cascade,
  kind                     text not null check (kind in ('indiamart', 'whatsapp', 'website')),
  token_hash               text not null,
  whatsapp_phone_number_id text,
  allowed_origins          text[] not null default '{}'::text[],
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Unique per company and kind
create unique index if not exists integrations_company_kind_idx
  on public.integrations (company_id, kind);

-- Fast lookup for webhook verification by token hash
create index if not exists integrations_token_hash_idx
  on public.integrations (token_hash)
  where active = true;

-- Fast lookup for WhatsApp phone number ID mapping
create index if not exists integrations_wa_phone_idx
  on public.integrations (whatsapp_phone_number_id)
  where kind = 'whatsapp' and active = true;

-- Enable RLS
alter table public.integrations enable row level security;

-- Policies: Owners / Admins can read their company's integration rows
drop policy if exists "owners see own integrations" on public.integrations;
create policy "owners see own integrations" on public.integrations
  for select to authenticated
  using (
    company_id = public.my_company()
    and public.has_role(array['super_admin', 'owner', 'admin'])
  );

-- Revoke all direct mutations from authenticated (writes strictly via service role)
revoke insert, update, delete on public.integrations from authenticated, anon, public;

-- Revoke select on the raw token_hash column from authenticated to ensure hash secrecy
revoke all on public.integrations from public, anon;
grant select (id, company_id, kind, whatsapp_phone_number_id, allowed_origins, active, created_at, updated_at)
  on public.integrations to authenticated;

-- Helper view for frontend queries (omits token_hash)
create or replace view public.company_integrations with (security_invoker = true) as
  select id, company_id, kind, whatsapp_phone_number_id, allowed_origins, active, created_at, updated_at
  from public.integrations;

grant select on public.company_integrations to authenticated;

-- 2. Deduplication Index on leads table for UNIQUE_QUERY_ID
create unique index if not exists leads_company_unique_query_id_idx
  on public.leads (company_id, (data->>'uniqueQueryId'))
  where (data->>'uniqueQueryId') is not null and (data->>'uniqueQueryId') <> '';

-- 3. Atomic, Race-Safe Inbound Lead Ingestion & Deduplication
create or replace function public.record_inbound_lead(p_company uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
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

revoke all on function public.record_inbound_lead(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_inbound_lead(uuid, jsonb) to service_role;
