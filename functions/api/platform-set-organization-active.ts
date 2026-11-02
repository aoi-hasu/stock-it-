import { Env, getSupabaseAdmin, jsonResponse, getPlatformRole } from './_utils';

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return jsonResponse({ error: 'Authorization token required.' }, 401);
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin(env);
  } catch {
    return jsonResponse({ error: 'Database service unconfigured.' }, 503);
  }

  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user?.email) {
    return jsonResponse({ error: 'Invalid or expired session.' }, 401);
  }

  const platformRole = await getPlatformRole(supabase, userData.user.id, userData.user.email, env);
  if (!platformRole) {
    return jsonResponse({ error: 'Forbidden: Platform admin authority required.' }, 403);
  }
  if (platformRole === 'support') {
    return jsonResponse({ error: 'Forbidden: Platform support staff cannot create, suspend or change plans of companies.' }, 403);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400);
  }

  const organizationId = body.organizationId;
  const active = Boolean(body.active);

  if (!organizationId) {
    return jsonResponse({ error: 'Organization ID is required.' }, 400);
  }

  const { data, error } = await supabase
    .from('organizations')
    .update({ active })
    .eq('id', organizationId)
    .select('*')
    .single();

  if (error) {
    console.error('Failed to update organization active status:', error);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  // Record platform audit log entry
  await supabase.from('audit_logs').insert({
    company_id: organizationId,
    user_id: userData.user.id,
    action: active ? 'Platform Activate Organization' : 'Platform Suspend Organization',
    entity: 'organizations',
    entity_id: organizationId,
    details: `Platform admin ${userData.user.email} set organization active status to ${active}`,
  });

  return jsonResponse({ success: true, organization: data });
}
