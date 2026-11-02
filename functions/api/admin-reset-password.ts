import { Env, authenticateCaller, generateSecurePassword, jsonResponse } from './_utils';

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const authResult = await authenticateCaller(request, env);
  if ('error' in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status);
  }

  const { profile: callerProfile, supabase } = authResult;

  const allowedRoles = ['super_admin', 'owner', 'admin'];
  if (!allowedRoles.includes(callerProfile.role)) {
    return jsonResponse({ error: 'Permission denied: Only administrators can reset user credentials.' }, 403);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON request' }, 400);
  }

  const targetUserId = body.userId;
  if (!targetUserId) {
    return jsonResponse({ error: 'User ID is required.' }, 400);
  }

  // 1. Block resetting your own password via this administrative endpoint
  if (targetUserId === callerProfile.id) {
    return jsonResponse({ error: 'Cannot reset your own password via admin reset. Use the Change Password setting.' }, 400);
  }

  // Load target profile
  const { data: targetProfile, error: targetError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', targetUserId)
    .single();

  if (targetError || !targetProfile) {
    return jsonResponse({ error: 'Target user not found.' }, 404);
  }

  // Ensure target belongs to caller's company
  if (targetProfile.company_id !== callerProfile.company_id) {
    return jsonResponse({ error: 'Permission denied: Cannot manage users from other organizations.' }, 403);
  }

  // 2. Admins cannot reset another admin's password unless caller is an owner or super_admin
  const adminRoles = ['super_admin', 'owner', 'admin'];
  if (adminRoles.includes(targetProfile.role) && !['super_admin', 'owner'].includes(callerProfile.role)) {
    return jsonResponse({ error: 'Permission denied: Only organization owners can reset another administrator credentials.' }, 403);
  }

  const oneTimePassword = generateSecurePassword(16);
  const nowIso = new Date().toISOString();

  // Update password in Supabase Auth
  const { error: updateAuthError } = await supabase.auth.admin.updateUserById(targetUserId, {
    password: oneTimePassword,
  });

  if (updateAuthError) {
    console.error('Failed to update user credentials in auth admin:', updateAuthError);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  // Flag that user must change password upon next login and update password_reset_at
  await supabase
    .from('profiles')
    .update({
      must_change_password: true,
      password_reset_at: nowIso,
    })
    .eq('id', targetUserId);

  // Log audit
  await supabase.from('audit_logs').insert({
    company_id: callerProfile.company_id,
    user_id: callerProfile.id,
    action: 'Password Reset',
    entity: 'User',
    entity_id: targetUserId,
    details: `Admin reset one-time password for ${targetProfile.name}`,
  });

  return jsonResponse({
    success: true,
    message: 'One-time temporary password successfully generated.',
    oneTimePassword,
  });
}
