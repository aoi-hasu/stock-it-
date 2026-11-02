import { Env, authenticateCaller, generateSecurePassword, jsonResponse } from './_utils';

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const authResult = await authenticateCaller(request, env);
  if ('error' in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status);
  }

  const { profile: callerProfile, supabase } = authResult;

  // Caller must be super_admin, owner, or admin
  const allowedRoles = ['super_admin', 'owner', 'admin'];
  if (!allowedRoles.includes(callerProfile.role)) {
    return jsonResponse({ error: 'Permission denied: Only administrators can create users.' }, 403);
  }

  // 1. Verify organization subscription status and max users limit
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select('id, active, data')
    .eq('id', callerProfile.company_id)
    .single();

  if (orgError || !orgData) {
    return jsonResponse({ error: 'Unable to verify organization subscription.' }, 403);
  }

  if (!orgData.active) {
    return jsonResponse({ error: 'Forbidden: Organization is suspended.' }, 403);
  }

  const subscriptionStatus = orgData.data?.subscriptionStatus || 'active';
  if (subscriptionStatus !== 'active') {
    return jsonResponse({ error: 'Payment Required: Organization subscription is inactive or expired.' }, 402);
  }

  const subscriptionValidUntil = orgData.data?.subscriptionValidUntil;
  if (subscriptionValidUntil) {
    const validUntilDate = new Date(subscriptionValidUntil);
    const gracePeriodEnd = new Date(validUntilDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (new Date() > gracePeriodEnd) {
      return jsonResponse({ error: 'Payment Required: Subscription has expired and grace period has ended. Please renew your plan.' }, 402);
    }
  }

  // Check user limit against maxUsers (Enterprise: 50, Professional: 15, Starter: 5)
  const defaultMaxUsers = orgData.data?.plan === 'Enterprise' ? 50 : orgData.data?.plan === 'Professional' ? 15 : 5;
  const maxUsers = Number(orgData.data?.maxUsers || defaultMaxUsers);
  const { count: currentUserCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', callerProfile.company_id)
    .eq('active', true);

  if (currentUserCount !== null && currentUserCount >= maxUsers) {
    return jsonResponse({
      error: `Payment Required: Reached maximum active user limit (${maxUsers} users) for your organization's ${orgData.data?.plan || 'Starter'} plan. Upgrade your plan to add more team members.`,
    }, 402);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON request' }, 400);
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const requestedRole = String(body.role || 'salesperson').trim();
  const phone = String(body.phone || '').trim();
  const department = String(body.department || 'Operations').trim();

  if (!name || !email || !email.includes('@')) {
    return jsonResponse({ error: 'Valid Name and Email address are required.' }, 400);
  }

  const validRoles = [
    'owner',
    'admin',
    'manager',
    'sales_manager',
    'salesperson',
    'inventory_manager',
    'accounts',
  ];

  if (!validRoles.includes(requestedRole)) {
    return jsonResponse({ error: `Invalid role specified: ${requestedRole}. super_admin is reserved for platform use.` }, 400);
  }

  // Privilege escalation check: only company owner can create another owner
  if (requestedRole === 'owner' && callerProfile.role !== 'owner') {
    return jsonResponse({ error: 'Only the company owner can create an owner account.' }, 403);
  }

  // Check if profile with email already exists
  const { data: existingProfiles } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', email);

  if (existingProfiles && existingProfiles.length > 0) {
    return jsonResponse({ error: 'A user with this email address already exists.' }, 409);
  }

  // Generate cryptographically secure one-time password
  const oneTimePassword = generateSecurePassword(16);

  // Create Auth user via Supabase Admin
  const { data: createdAuth, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: oneTimePassword,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createError || !createdAuth.user) {
    console.error('Failed to create user auth account:', createError);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  const newUserId = createdAuth.user.id;
  const nowIso = new Date().toISOString();

  // Insert profile row tied strictly to the CALLER's company with password_reset_at
  const { error: profileError } = await supabase.from('profiles').insert({
    id: newUserId,
    company_id: callerProfile.company_id,
    name,
    email,
    role: requestedRole,
    phone,
    department,
    active: true,
    must_change_password: true,
    password_reset_at: nowIso,
  });

  if (profileError) {
    console.error('Failed to create profile:', profileError);
    // Cleanup auth user on profile insertion failure
    await supabase.auth.admin.deleteUser(newUserId);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  // Record audit log
  await supabase.from('audit_logs').insert({
    company_id: callerProfile.company_id,
    user_id: callerProfile.id,
    action: 'User Created',
    entity: 'User',
    entity_id: newUserId,
    details: `Created team member ${name} (${requestedRole})`,
  });

  return jsonResponse({
    success: true,
    message: 'User created successfully.',
    oneTimePassword,
    user: {
      id: newUserId,
      name,
      email,
      role: requestedRole,
      phone,
      department,
      active: true,
      mustChangePassword: true,
      companyId: callerProfile.company_id,
      createdAt: nowIso,
    },
  });
}
