import { Env, getSupabaseAdmin, jsonResponse, isCallerPlatformAdmin } from './_utils';

export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
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

  const isPlatform = await isCallerPlatformAdmin(supabase, userData.user.id, userData.user.email, env);
  if (!isPlatform) {
    return jsonResponse({ error: 'Forbidden: Platform admin authority required.' }, 403);
  }

  // Fetch client organizations
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, code, active, data, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to query organizations:', error);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  // Aggregate platform reporting metrics per organization
  const enrichedOrgs = await Promise.all(
    (orgs || []).map(async org => {
      // User count
      const { count: userCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', org.id)
        .eq('active', true);

      // Last activity from audit logs
      const { data: lastLog } = await supabase
        .from('audit_logs')
        .select('created_at, action, entity')
        .eq('company_id', org.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      return {
        ...org,
        plan: org.data?.plan || 'Starter',
        maxUsers: org.data?.maxUsers || (org.data?.plan === 'Enterprise' ? 50 : org.data?.plan === 'Professional' ? 15 : 5),
        subscriptionStatus: org.data?.subscriptionStatus || (org.active ? 'active' : 'suspended'),
        subscriptionValidUntil: org.data?.subscriptionValidUntil,
        userCount: userCount || 0,
        lastActivity: lastLog ? lastLog.created_at : org.created_at,
        lastActivityDesc: lastLog ? `${lastLog.action} (${lastLog.entity})` : 'Organization Created',
      };
    })
  );

  return jsonResponse({ organizations: enrichedOrgs });
}
