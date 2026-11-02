-- =====================================================================
-- 09_fix_password_ack.sql   (StockItEase, a product of aoihasu)
-- Run AFTER 08_hardening.sql. Safe to re-run.
-- Fixes: ack_password_changed() always failed, so a new team member was
-- asked to change their password again on every login.
-- =====================================================================

-- 1. The guard trigger accepts the un-flagging only when it comes from
--    ack_password_changed() (which sets a flag valid for this transaction only).
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
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

-- 2. ack_password_changed(): same checks as before, but raises the flag first.
create or replace function public.ack_password_changed()
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  u_id uuid := auth.uid();
  p_rec record;
  u_updated_at timestamptz;
begin
  if u_id is null then raise exception 'Unauthorized'; end if;

  select id, must_change_password, password_reset_at into p_rec
  from public.profiles where id = u_id;
  if not found then raise exception 'User profile not found'; end if;

  -- Nothing to do if the user is not flagged
  if not p_rec.must_change_password then return true; end if;

  select updated_at into u_updated_at from auth.users where id = u_id;
  if u_updated_at is not null and p_rec.password_reset_at is not null
     and u_updated_at < p_rec.password_reset_at then
    raise exception 'Password has not been updated since reset was requested.';
  end if;

  perform set_config('app.ack_password', 'on', true);   -- true = this transaction only
  update public.profiles set must_change_password = false where id = u_id;
  perform set_config('app.ack_password', 'off', true);

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, details)
  values (public.my_company(), u_id, 'Password Changed', 'User', u_id::text,
          'User changed their one-time password');
  return true;
end $$;
revoke all on function public.ack_password_changed() from public, anon;
grant execute on function public.ack_password_changed() to authenticated;

-- 3. Make the "password changed since reset" check meaningful: whenever the
--    server flags a user, stamp the time AFTER the password was set.
create or replace function public.stamp_password_reset() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.must_change_password and (tg_op = 'INSERT' or not old.must_change_password
       or new.password_reset_at is distinct from old.password_reset_at) then
    new.password_reset_at := now();
  end if;
  return new;
end $$;
drop trigger if exists profiles_stamp_reset on public.profiles;
create trigger profiles_stamp_reset before insert or update on public.profiles
  for each row execute function public.stamp_password_reset();
