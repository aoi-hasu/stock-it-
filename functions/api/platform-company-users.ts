import { Env, generateSecurePassword, jsonResponse, requirePlatformRole } from './_utils';

// Lets ALL platform staff (owner, manager, support) see the users of a client company
// and issue a one-time password. No leads, quotations or other business data is returned.
//   GET  ?companyId=...                      -> list users
//   POST { companyId, userId }               -> reset that user's password

export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  const auth = await requirePlatformRole(request, env, ['owner', 'manager', 'support']);
  if ('error' in auth) return jsonResponse({ error: auth.error }, auth.status);
  const { supabase } = auth;

  const companyId = new URL(request.url).searchParams.get('companyId') || '';
  if (!companyId) return jsonResponse({ error: 'companyId is required.' }, 400);

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, active, must_change_password, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('platform-company-users failed:', error);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  return jsonResponse({
    users: (data || []).map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      mustChangePassword: u.must_change_password,
      createdAt: u.created_at,
    })),
  });
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const auth = await requirePlatformRole(request, env, ['owner', 'manager', 'support']);
  if ('error' in auth) return jsonResponse({ error: auth.error }, auth.status);
  const { supabase, user, role } = auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON request.' }, 400);
  }

  const companyId = String(body.companyId || '');
  const userId = String(body.userId || '');
  if (!companyId || !userId) return jsonResponse({ error: 'companyId and userId are required.' }, 400);

  const { data: target } = await supabase
    .from('profiles')
    .select('id, name, email, company_id')
    .eq('id', userId)
    .maybeSingle();
  if (!target || target.company_id !== companyId) {
    return jsonResponse({ error: 'User not found in this company.' }, 404);
  }

  const oneTimePassword = generateSecurePassword(16);
  const { error: pwErr } = await supabase.auth.admin.updateUserById(userId, { password: oneTimePassword });
  if (pwErr) {
    console.error('platform password reset failed:', pwErr);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  await supabase
    .from('profiles')
    .update({ must_change_password: true, password_reset_at: new Date().toISOString() })
    .eq('id', userId);

  const what = `Platform ${role} ${user.email} reset the password of ${target.email}`;
  await supabase.from('platform_access_logs').insert({ admin_id: user.id, company_id: companyId, what });
  await supabase.from('audit_logs').insert({
    company_id: companyId,
    user_id: null,
    action: 'Platform Password Reset',
    entity: 'User',
    entity_id: userId,
    details: what,
  });

  return jsonResponse({ success: true, oneTimePassword });
}
