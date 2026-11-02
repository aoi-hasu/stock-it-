import { Env, getSupabaseAdmin, generateSecurePassword, jsonResponse, getPlatformRole } from './_utils';

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

  const organizationName = String(body.organizationName || body.name || '').trim();
  const organizationCode = String(body.organizationCode || body.code || '').trim().toUpperCase();
  const ownerName = String(body.ownerName || '').trim();
  const ownerEmail = String(body.ownerEmail || '').trim().toLowerCase();
  const plan = String(body.plan || 'Professional').trim();

  if (!organizationName || !ownerName || !ownerEmail || !ownerEmail.includes('@')) {
    return jsonResponse({ error: 'Organization Name, Client Owner Name, and a valid Owner Email are required.' }, 400);
  }

  // 1. Create client organization
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: organizationName,
      code: organizationCode || null,
      active: true,
      data: { plan, createdAt: new Date().toISOString() },
    })
    .select('*')
    .single();

  if (orgError || !orgData) {
    console.error('Failed to create organization:', orgError);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  // 2. Generate random one-time password
  const oneTimePassword = generateSecurePassword(16);

  // 3. Create initial Owner in Supabase Auth
  const { data: createdAuth, error: userError } = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password: oneTimePassword,
    email_confirm: true,
    user_metadata: { name: ownerName },
  });

  if (userError || !createdAuth.user) {
    console.error('Failed to create owner user:', userError);
    // Rollback organization
    await supabase.from('organizations').delete().eq('id', orgData.id);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  const ownerUserId = createdAuth.user.id;

  // 4. Create owner profile in profiles table
  const { error: profileError } = await supabase.from('profiles').insert({
    id: ownerUserId,
    company_id: orgData.id,
    name: ownerName,
    email: ownerEmail,
    role: 'owner',
    active: true,
    must_change_password: true,
    password_reset_at: new Date().toISOString(),
  });

  if (profileError) {
    console.error('Failed to initialize owner profile:', profileError);
    await supabase.auth.admin.deleteUser(ownerUserId);
    await supabase.from('organizations').delete().eq('id', orgData.id);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  // 5. Initialize company_settings row for the new client
  await supabase.from('company_settings').insert({
    company_id: orgData.id,
    data: {
      companyName: organizationName,
      defaultQuotationValidityDays: 30,
      quotationPrefix: 'QTN',
      orderPrefix: 'ORD',
      invoicePrefix: 'INV',
    },
  });

  // 6. Record platform audit log entry
  await supabase.from('audit_logs').insert({
    company_id: orgData.id,
    user_id: userData.user.id,
    action: 'Platform Create Organization',
    entity: 'organizations',
    entity_id: orgData.id,
    details: `Platform admin ${userData.user.email} created client organization "${organizationName}" (${orgData.id}) with initial owner ${ownerEmail}`,
  });

  return jsonResponse({
    success: true,
    organization: orgData,
    owner: {
      id: ownerUserId,
      name: ownerName,
      email: ownerEmail,
      role: 'owner',
    },
    oneTimePassword,
  });
}
