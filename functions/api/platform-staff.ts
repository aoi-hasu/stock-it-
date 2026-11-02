import { Env, generateSecurePassword, jsonResponse, requirePlatformRole } from './_utils';

// Platform staff management. OWNER only.
//   GET  -> list staff
//   POST -> { action: 'create' | 'update' | 'reset-password', ... }

const STAFF_ROLES = ['manager', 'support'];

export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  const auth = await requirePlatformRole(request, env, ['owner']);
  if ('error' in auth) return jsonResponse({ error: auth.error }, auth.status);
  const { supabase } = auth;

  const { data, error } = await supabase.from('platform_admins').select('*');
  if (error) {
    console.error('platform-staff list failed:', error);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  const staff = (data || []).map((r: any) => ({
    userId: r.user_id,
    name: r.name || '',
    email: r.email || '',
    role: r.role || 'owner',
    active: r.active !== false,
    createdAt: r.created_at,
  }));
  return jsonResponse({ staff });
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const auth = await requirePlatformRole(request, env, ['owner']);
  if ('error' in auth) return jsonResponse({ error: auth.error }, auth.status);
  const { supabase, user } = auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON request.' }, 400);
  }

  const action = String(body.action || '');

  if (action === 'create') {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const role = String(body.role || '').trim();

    if (!name || !email.includes('@')) {
      return jsonResponse({ error: 'Name and a valid email are required.' }, 400);
    }
    if (!STAFF_ROLES.includes(role)) {
      return jsonResponse({ error: 'Role must be "manager" or "support".' }, 400);
    }

    const oneTimePassword = generateSecurePassword(16);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: oneTimePassword,
      email_confirm: true,
      user_metadata: { name, must_change_password: true },
    });
    if (createErr || !created?.user) {
      const msg = String(createErr?.message || '');
      if (/already|registered|exists/i.test(msg)) {
        return jsonResponse({ error: 'A login with this email already exists. Use a different email for platform staff.' }, 409);
      }
      console.error('platform-staff create user failed:', createErr);
      return jsonResponse({ error: 'Request failed.' }, 500);
    }

    const { error: insErr } = await supabase.from('platform_admins').insert({
      user_id: created.user.id,
      role,
      name,
      email,
      active: true,
    });
    if (insErr) {
      console.error('platform-staff insert failed:', insErr);
      await supabase.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: 'Request failed. Make sure supabase/16_platform_roles.sql has been run.' }, 500);
    }

    return jsonResponse({
      success: true,
      staff: { userId: created.user.id, name, email, role, active: true },
      oneTimePassword,
    });
  }

  const targetId = String(body.userId || '');
  if (!targetId) return jsonResponse({ error: 'userId is required.' }, 400);
  if (targetId === user.id) {
    return jsonResponse({ error: 'You cannot change your own platform access here.' }, 400);
  }

  const { data: target } = await supabase
    .from('platform_admins')
    .select('*')
    .eq('user_id', targetId)
    .maybeSingle();
  if (!target) return jsonResponse({ error: 'Platform staff member not found.' }, 404);

  if (action === 'update') {
    const patch: Record<string, unknown> = {};
    if (body.role !== undefined) {
      const role = String(body.role);
      if (!STAFF_ROLES.includes(role)) {
        return jsonResponse({ error: 'Role must be "manager" or "support".' }, 400);
      }
      patch.role = role;
    }
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (Object.keys(patch).length === 0) return jsonResponse({ error: 'Nothing to update.' }, 400);

    const { error: updErr } = await supabase.from('platform_admins').update(patch).eq('user_id', targetId);
    if (updErr) {
      console.error('platform-staff update failed:', updErr);
      return jsonResponse({ error: 'Request failed.' }, 500);
    }
    return jsonResponse({ success: true });
  }

  if (action === 'reset-password') {
    const oneTimePassword = generateSecurePassword(16);
    const { error: pwErr } = await supabase.auth.admin.updateUserById(targetId, {
      password: oneTimePassword,
      user_metadata: { must_change_password: true },
    });
    if (pwErr) {
      console.error('platform-staff reset failed:', pwErr);
      return jsonResponse({ error: 'Request failed.' }, 500);
    }
    return jsonResponse({ success: true, oneTimePassword });
  }

  return jsonResponse({ error: 'Unknown action.' }, 400);
}
