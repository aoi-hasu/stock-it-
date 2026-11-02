import { Env, getSupabaseAdmin, jsonResponse, getPlatformRole } from './_utils';

export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return jsonResponse({ isPlatformAdmin: false, error: 'Unauthorized' }, 401);
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin(env);
  } catch {
    return jsonResponse({ isPlatformAdmin: false, error: 'Database unconfigured' }, 503);
  }

  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user) {
    return jsonResponse({ isPlatformAdmin: false }, 401);
  }

  const userId = userData.user.id;
  const email = userData.user.email;

  const platformRole = await getPlatformRole(supabase, userId, email, env);

  return jsonResponse({
    isPlatformAdmin: platformRole !== null,
    platformRole,
    name: (userData.user.user_metadata as any)?.name || null,
    mustChangePassword: (userData.user.user_metadata as any)?.must_change_password === true,
    userId,
    email,
  });
}
