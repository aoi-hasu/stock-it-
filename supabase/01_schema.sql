-- =====================================================================
-- StockItEase (a product of aoihasu) - Supabase schema
-- Multi-company: every client business (e.g. Avon Footwear Machines) is one
-- row in "organizations". Locked down with row-level security (RLS).
-- Run this ONCE in Supabase: SQL Editor > New query > paste > Run.
-- Safe to re-run. Nobody can read anything unless they are logged in
-- AND belong to the same company as the data.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- 1. Companies and people ----------
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text unique,
  active     boolean not null default true,
  data       jsonb not null default '{}'::jsonb,   -- plan, GSTIN, address etc.
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  company_id           uuid not null references public.organizations(id) on delete cascade,
  name                 text not null,
  email                text not null,
  role                 text not null default 'salesperson'
    check (role in ('super_admin','owner','admin','manager','sales_manager',
                    'salesperson','inventory_manager','accounts')),
  phone                text,
  department           text,
  active               boolean not null default true,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now()
);
create index if not exists profiles_company_idx on public.profiles(company_id);

-- ---------- 2. Helper functions (used by the rules below) ----------
create or replace function public.my_company() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid() and active
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = any(roles), false)
$$;

-- ---------- 3. Business tables (one pattern, many tables) ----------
-- Each row: id, company_id, data (the record as JSON), who made it, timestamps.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare
  t text;
  admins  text[] := array['super_admin','owner','admin'];
  tables  text[] := array['leads','customers','contacts','products',
    'inventory_transactions','quotations','orders','payments','follow_ups',
    'tasks','communications','documents','tax_invoices','purchase_orders',
    'notifications'];
  write_roles text[];
  del_roles   text[];
  own_only    boolean;
begin
  foreach t in array tables loop
    execute format($f$
      create table if not exists public.%I (
        id         text primary key default gen_random_uuid()::text,
        company_id uuid not null references public.organizations(id) on delete cascade,
        data       jsonb not null default '{}'::jsonb,
        created_by uuid default auth.uid(),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )$f$, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create index if not exists %I on public.%I(company_id)', t||'_company_idx', t);
    execute format('drop trigger if exists %I on public.%I', t||'_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t||'_touch', t);

    -- who may create/edit
    write_roles := case t
      when 'products'                then admins || array['inventory_manager']
      when 'inventory_transactions'  then admins || array['inventory_manager','manager','sales_manager']
      when 'payments'                then admins || array['accounts','manager','sales_manager']
      when 'tax_invoices'            then admins || array['accounts','manager','sales_manager']
      when 'purchase_orders'         then admins || array['accounts','inventory_manager','manager']
      else admins || array['manager','sales_manager','salesperson','inventory_manager','accounts']
    end;
    -- who may delete
    del_roles := case t
      when 'leads'      then admins || array['sales_manager','manager']
      when 'quotations' then admins || array['sales_manager','manager']
      else admins
    end;
    -- salespeople may only edit rows they created or are assigned to
    own_only := t in ('leads','customers','quotations','follow_ups','tasks');

    execute format('drop policy if exists "read own company" on public.%I', t);
    execute format('create policy "read own company" on public.%I for select to authenticated using (company_id = public.my_company())', t);

    execute format('drop policy if exists "insert own company" on public.%I', t);
    execute format('create policy "insert own company" on public.%I for insert to authenticated with check (company_id = public.my_company() and public.has_role(%L))', t, write_roles);

    execute format('drop policy if exists "update own company" on public.%I', t);
    if own_only then
      execute format($p$create policy "update own company" on public.%I for update to authenticated
        using (company_id = public.my_company() and public.has_role(%L) and (
              public.has_role(%L) or created_by = auth.uid()
              or data->>'assignedSalespersonId' = auth.uid()::text))
        with check (company_id = public.my_company())$p$,
        t, write_roles, admins || array['manager','sales_manager']);
    else
      execute format('create policy "update own company" on public.%I for update to authenticated using (company_id = public.my_company() and public.has_role(%L)) with check (company_id = public.my_company())', t, write_roles);
    end if;

    execute format('drop policy if exists "delete own company" on public.%I', t);
    execute format('create policy "delete own company" on public.%I for delete to authenticated using (company_id = public.my_company() and public.has_role(%L))', t, del_roles);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Audit log: everyone logged in can add entries, only admins can read, nobody can edit or delete.
create table if not exists public.audit_logs (
  id         text primary key default gen_random_uuid()::text,
  company_id uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid default auth.uid(),
  action     text not null,
  entity     text,
  entity_id  text,
  details    text,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create index if not exists audit_logs_company_idx on public.audit_logs(company_id, created_at desc);
drop policy if exists "admins read audit" on public.audit_logs;
create policy "admins read audit" on public.audit_logs for select to authenticated
  using (company_id = public.my_company() and public.has_role(array['super_admin','owner','admin']));
drop policy if exists "add audit" on public.audit_logs;
create policy "add audit" on public.audit_logs for insert to authenticated
  with check (company_id = public.my_company() and user_id = auth.uid());
revoke all on public.audit_logs from anon;
grant select, insert on public.audit_logs to authenticated;

-- Company settings (NO secrets here - API keys live in Cloudflare secrets only).
create table if not exists public.company_settings (
  company_id uuid primary key references public.organizations(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.company_settings enable row level security;
drop policy if exists "read settings" on public.company_settings;
create policy "read settings" on public.company_settings for select to authenticated
  using (company_id = public.my_company());
drop policy if exists "admins write settings" on public.company_settings;
create policy "admins write settings" on public.company_settings for all to authenticated
  using (company_id = public.my_company() and public.has_role(array['super_admin','owner','admin']))
  with check (company_id = public.my_company());
revoke all on public.company_settings from anon;
grant select, insert, update on public.company_settings to authenticated;

-- ---------- 4. Invoice / quotation / lead numbering (no duplicates) ----------
create table if not exists public.counters (
  company_id uuid not null references public.organizations(id) on delete cascade,
  kind       text not null,
  value      bigint not null default 0,
  primary key (company_id, kind)
);
alter table public.counters enable row level security;   -- no policies: only next_seq() can touch it
revoke all on public.counters from anon, authenticated;

create or replace function public.next_seq(p_kind text) returns bigint
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_company(); v bigint;
begin
  if c is null then raise exception 'not allowed'; end if;
  insert into public.counters as ct (company_id, kind, value) values (c, p_kind, 1)
  on conflict (company_id, kind) do update set value = ct.value + 1
  returning ct.value into v;
  return v;
end $$;
revoke all on function public.next_seq(text) from public, anon;
grant execute on function public.next_seq(text) to authenticated;

-- ---------- 5. Profiles and organizations rules ----------
alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;

drop policy if exists "see own company" on public.organizations;
create policy "see own company" on public.organizations for select to authenticated
  using (id = public.my_company());
drop policy if exists "owners edit company" on public.organizations;
create policy "owners edit company" on public.organizations for update to authenticated
  using (id = public.my_company() and public.has_role(array['super_admin','owner']))
  with check (id = public.my_company());

drop policy if exists "see company people" on public.profiles;
create policy "see company people" on public.profiles for select to authenticated
  using (company_id = public.my_company() or id = auth.uid());
drop policy if exists "edit people" on public.profiles;
create policy "edit people" on public.profiles for update to authenticated
  using (id = auth.uid() or (company_id = public.my_company() and public.has_role(array['super_admin','owner','admin'])))
  with check (company_id = public.my_company());
-- no insert/delete policies: new users are created only by the secure server function.

-- Stop people changing their own role/company/active flag, and stop admins touching owners.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare caller_role text := public.my_role();
begin
  if auth.uid() is null then return new; end if;          -- server (service role) is allowed
  if new.company_id <> old.company_id then raise exception 'company cannot be changed'; end if;
  if (new.role <> old.role or new.active <> old.active) then
    if caller_role not in ('super_admin','owner') then
      raise exception 'only owners can change role or active status';
    end if;
    if old.id = auth.uid() then raise exception 'you cannot change your own role or status'; end if;
  end if;
  if old.role in ('super_admin','owner') and old.id <> auth.uid() and caller_role not in ('super_admin','owner') then
    raise exception 'cannot edit an owner';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

revoke all on public.organizations, public.profiles from anon;
grant select, update on public.organizations, public.profiles to authenticated;

-- ---------- 6. Private file storage (per-company folders) ----------
insert into storage.buckets (id, name, public) values ('documents','documents', false)
on conflict (id) do nothing;

drop policy if exists "docs read"   on storage.objects;
drop policy if exists "docs upload" on storage.objects;
drop policy if exists "docs delete" on storage.objects;
create policy "docs read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.my_company()::text);
create policy "docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = public.my_company()::text);
create policy "docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.my_company()::text
         and public.has_role(array['super_admin','owner','admin']));
