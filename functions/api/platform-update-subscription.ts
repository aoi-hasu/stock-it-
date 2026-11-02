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
    return jsonResponse({ error: 'Invalid or expired authentication session.' }, 401);
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
    return jsonResponse({ error: 'Invalid JSON request format.' }, 400);
  }

  const organizationId = String(body.organizationId || '').trim();
  if (!organizationId) {
    return jsonResponse({ error: 'organizationId is required.' }, 400);
  }

  const { data: existingOrg, error: fetchErr } = await supabase
    .from('organizations')
    .select('id, data, active, name')
    .eq('id', organizationId)
    .single();

  if (fetchErr || !existingOrg) {
    return jsonResponse({ error: 'Organization not found.' }, 404);
  }

  // Unified plan definitions
  const planName = body.plan ? String(body.plan).trim() : existingOrg.data?.plan || 'Starter';
  const defaultMaxUsers = planName === 'Enterprise' ? 50 : planName === 'Professional' ? 15 : 5;
  const maxUsers = body.maxUsers !== undefined ? Number(body.maxUsers) : existingOrg.data?.maxUsers || defaultMaxUsers;

  const updatedData = {
    ...existingOrg.data,
    plan: planName,
    maxUsers,
    subscriptionStatus: body.subscriptionStatus ? String(body.subscriptionStatus).trim() : existingOrg.data?.subscriptionStatus || 'active',
    subscriptionValidUntil: body.subscriptionValidUntil !== undefined ? (body.subscriptionValidUntil === null ? '' : String(body.subscriptionValidUntil).trim().replace(/^(null|undefined)$/i, '')) : existingOrg.data?.subscriptionValidUntil,
    updatedAt: new Date().toISOString(),
  };

  const updates: Record<string, any> = { data: updatedData };
  if (body.active !== undefined) updates.active = Boolean(body.active);
  if (body.name) updates.name = String(body.name).trim();

  const { data: updated, error: updateErr } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', organizationId)
    .select('*')
    .single();

  if (updateErr) {
    console.error('Failed to update organization subscription:', updateErr);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  // Record audit log
  await supabase.from('audit_logs').insert({
    company_id: organizationId,
    user_id: userData.user.id,
    action: 'Platform Subscription Updated',
    entity: 'organizations',
    entity_id: organizationId,
    details: `Platform admin updated subscription: Plan=${planName}, MaxUsers=${maxUsers}, Status=${updatedData.subscriptionStatus}, ValidUntil=${updatedData.subscriptionValidUntil || 'N/A'}`,
  });

  return jsonResponse({
    success: true,
    organization: updated,
  });
}
