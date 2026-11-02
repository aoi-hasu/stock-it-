-- =====================================================================
-- WARNING: DO NOT RUN THIS SCRIPT WITHOUT REPLACING PLACEHOLDER VALUES!
-- Replace [PASTE_CLIENT_OWNER_UID_HERE] with the real auth user UUID
-- from your Supabase Authentication > Users dashboard before running.
-- =====================================================================
-- StockItEase (a product of aoihasu) - FIRST CLIENT ADMIN GUIDANCE
-- Run this AFTER running 01_schema.sql through 14_access_control_and_audit_triggers.sql.
-- 
-- IMPORTANT ARCHITECTURAL NOTE:
-- The platform developer is NOT a member of any client company.
-- To grant yourself platform developer administration, insert your auth user UID into:
--   insert into public.platform_admins (user_id) values ('[YOUR_PLATFORM_DEVELOPER_AUTH_UID]'::uuid);
--
-- This script creates your FIRST CLIENT COMPANY (e.g. Acme Industries) and its client owner.
-- For later clients, use the platform "Client Companies" dashboard view in the app.
--
-- 1) In Supabase: Authentication > Users > Add user > Create new user.
--    Enter the client owner's email (e.g. client.owner@example.com) and a strong password.
--    Check "Auto Confirm User".
-- 2) Copy that user's UID (UUID shown in the Users list).
-- 3) Replace the placeholders below, then run this in the Supabase SQL Editor.
-- =====================================================================

with org as (
  insert into public.organizations (name, code, data)
  values (
    'Acme Industrial Solutions',                        -- Place client business name
    'ACME',                                             -- Place client unique short code
    '{"plan": "Professional", "maxUsers": 15, "subscriptionStatus": "active"}'::jsonb
  )
  returning id
)
insert into public.profiles (id, company_id, name, email, role, active, must_change_password)
select
  '[PASTE_CLIENT_OWNER_UID_HERE]'::uuid,                -- Place client owner UID from Supabase Auth
  org.id,
  'Client Business Owner',                              -- Place client owner full name
  'owner@example.com',                                  -- Place client owner email
  'owner',                                              -- Client owner role
  true,
  true
from org;
