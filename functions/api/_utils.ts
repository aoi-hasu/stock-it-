import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  WEBSITE_LEAD_SECRET?: string;
  INDIAMART_CRM_KEY?: string;
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  DEFAULT_COMPANY_ID?: string;
  DEFAULT_LEAD_ASSIGNEE_ID?: string;
  PLATFORM_OWNER_EMAILS?: string;
  LEAD_ALLOWED_ORIGINS?: string;
  RATE_LIMIT?: any; // Cloudflare KV or Rate Limiter binding
}

/**
 * Constant-time comparison between two strings to prevent timing attacks.
 */
export function timingSafeEqualStr(a?: string | null, b?: string | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

/**
 * Computes SHA-256 hash in lowercase hex format using standard Web Crypto API.
 */
export async function sha256Hex(data: string): Promise<string> {
  const enc = new TextEncoder();
  const digestBytes = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return Array.from(new Uint8Array(digestBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a cryptographically strong integration token (32 bytes = 64 hex characters).
 */
export function generateIntegrationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a cryptographically strong one-time random password.
 */
export function generateSecurePassword(length = 16): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

/**
 * Detects known insecure placeholder values:
 * - Starts with 'your_' or 'your-' or contains 'your-project' or 'your_project'
 * - All-zero UUID: '00000000-0000-0000-0000-000000000000'
 * - Contains 'example.com'
 * - Bracketed placeholders like '<...>' or '[...]'
 * - Known dummy strings like 'placeholder', 'changeme', 'todo'
 */
export function isPlaceholderValue(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const s = val.trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (
    lower.startsWith('your_') ||
    lower.startsWith('your-') ||
    lower.includes('your-project') ||
    lower.includes('your_project')
  ) {
    return true;
  }
  if (lower === '00000000-0000-0000-0000-000000000000') {
    return true;
  }
  if (lower.includes('example.com')) {
    return true;
  }
  if (['placeholder', 'changeme', 'todo'].includes(lower)) {
    return true;
  }
  if ((s.startsWith('<') && s.endsWith('>')) || (s.startsWith('[') && s.endsWith(']'))) {
    return true;
  }
  return false;
}

export interface PlaceholderConfigIssue {
  key: string;
  value: string;
  reason: string;
}

/**
 * Validates environment variables against known placeholders.
 * Checks WEBSITE_LEAD_SECRET, DEFAULT_COMPANY_ID, PLATFORM_OWNER_EMAILS, INDIAMART_CRM_KEY, and WHATSAPP_*
 */
export function getPlaceholderConfigIssues(env: Env, keysToCheck?: string[]): PlaceholderConfigIssue[] {
  const issues: PlaceholderConfigIssue[] = [];
  const envObj = env as Record<string, any>;

  const defaultKeys = [
    'WEBSITE_LEAD_SECRET',
    'DEFAULT_COMPANY_ID',
    'PLATFORM_OWNER_EMAILS',
    'INDIAMART_CRM_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const candidateKeys = new Set<string>(keysToCheck || defaultKeys);

  // If no explicit keys given, also gather all WHATSAPP_* keys from env
  if (!keysToCheck) {
    for (const k of Object.keys(envObj)) {
      if (k.startsWith('WHATSAPP_')) {
        candidateKeys.add(k);
      }
    }
    candidateKeys.add('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    candidateKeys.add('WHATSAPP_APP_SECRET');
  }

  for (const key of candidateKeys) {
    const val = envObj[key];
    if (val === undefined || val === null || val === '') {
      continue; // Unset optional variables are handled separately by caller if required
    }
    if (typeof val === 'string') {
      if (key === 'PLATFORM_OWNER_EMAILS') {
        const emails = val.split(',').map(e => e.trim());
        for (const e of emails) {
          if (isPlaceholderValue(e)) {
            issues.push({
              key,
              value: val,
              reason: `Email "${e}" contains forbidden placeholder or domain (e.g. example.com, your_...)`,
            });
            break;
          }
        }
      } else if (isPlaceholderValue(val)) {
        issues.push({
          key,
          value: val,
          reason: `Value for ${key} contains forbidden placeholder pattern (e.g. your_..., 00000000-..., example.com)`,
        });
      }
    }
  }

  return issues;
}

/**
 * Validates that environment variables do not use insecure placeholder values.
 * If placeholders are found, logs the exact error details to server logs and returns
 * HTTP 503 with a generic safe error message to prevent leaking internal configuration.
 */
export function validateEnvironmentConfig(env: Env, keysToCheck?: string[]): Response | null {
  const issues = getPlaceholderConfigIssues(env, keysToCheck);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`[CRITICAL CONFIG ERROR] Insecure placeholder detected in ${issue.key}: ${issue.reason}`);
    }
    return jsonResponse(
      { error: 'Service temporarily unavailable' },
      503
    );
  }
  return null;
}

/**
 * Get Supabase client using Service Role Key. Fails closed (throws error) if missing or placeholder.
 */
export function getSupabaseAdmin(env: Env): SupabaseClient {
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || isPlaceholderValue(url) || isPlaceholderValue(serviceKey)) {
    throw new Error('Supabase service role configuration is missing or invalid.');
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Standard security headers applied to all API responses.
 */
export const STANDARD_SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Helper to respond with JSON with standard security headers.
 */
export function jsonResponse(data: any, status = 200, additionalHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...STANDARD_SECURITY_HEADERS,
      ...additionalHeaders,
    },
  });
}

/**
 * Authenticate caller's JWT and retrieve their profile.
 */
export async function authenticateCaller(request: Request, env: Env) {
  const configErr = validateEnvironmentConfig(env);
  if (configErr) {
    return { error: 'Service temporarily unavailable', status: 503 };
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return { error: 'Missing or malformed Authorization header', status: 401 };
  }

  let supabase: SupabaseClient;
  try {
    supabase = getSupabaseAdmin(env);
  } catch {
    return { error: 'Service temporarily unavailable', status: 503 };
  }
  const { data: userData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !userData?.user) {
    return { error: 'Invalid or expired session token', status: 401 };
  }

  const { data: profile, error: profError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .single();

  if (profError || !profile) {
    return { error: 'User profile not found', status: 403 };
  }

  if (!profile.active) {
    return { error: 'Account has been deactivated', status: 403 };
  }

  return { user: userData.user, profile, supabase };
}

/**
 * Look up integration record and verify company by kind and raw token.
 */
export async function lookupIntegrationByToken(
  supabase: SupabaseClient,
  kind: 'indiamart' | 'whatsapp' | 'website',
  rawToken: string
): Promise<{ companyId: string; integrationId: string; allowedOrigins: string[]; whatsappPhoneNumberId?: string } | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const hash = await sha256Hex(rawToken.trim());

  const { data, error } = await supabase
    .from('integrations')
    .select('id, company_id, allowed_origins, whatsapp_phone_number_id, active')
    .eq('token_hash', hash)
    .eq('kind', kind)
    .eq('active', true)
    .single();

  if (error || !data || !data.active) {
    return null;
  }

  // Also ensure company is active
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, active')
    .eq('id', data.company_id)
    .single();

  if (orgErr || !org || !org.active) {
    return null;
  }

  return {
    companyId: data.company_id,
    integrationId: data.id,
    allowedOrigins: data.allowed_origins || [],
    whatsappPhoneNumberId: data.whatsapp_phone_number_id,
  };
}

/**
 * Look up company by WhatsApp phone number ID (for incoming Meta webhooks)
 */
export async function lookupCompanyByWhatsAppPhoneId(
  supabase: SupabaseClient,
  phoneNumberId: string
): Promise<{ companyId: string; integrationId: string } | null> {
  if (!phoneNumberId) return null;

  const { data, error } = await supabase
    .from('integrations')
    .select('id, company_id, active')
    .eq('whatsapp_phone_number_id', phoneNumberId.trim())
    .eq('kind', 'whatsapp')
    .eq('active', true)
    .single();

  if (error || !data || !data.active) {
    return null;
  }

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, active')
    .eq('id', data.company_id)
    .single();

  if (orgErr || !org || !org.active) {
    return null;
  }

  return { companyId: data.company_id, integrationId: data.id };
}

/**
 * Check if a caller is a platform admin using the platform_admins table.
 * Uses PLATFORM_OWNER_EMAILS as a one-time bootstrap seed if the table row is not yet populated.
 */
export type PlatformRole = 'owner' | 'manager' | 'support';

/**
 * Returns the caller's platform role, or null if they are not (an active) platform staff member.
 * owner   : everything, manages platform staff
 * manager : create/suspend companies, plans, read-only view of company data
 * support : view companies and their users, reset a client's password (no business data)
 */
export async function getPlatformRole(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string,
  env?: Env
): Promise<PlatformRole | null> {
  if (!userId) return null;

  // 1. Primary check: platform_admins table lookup (requires supabase/16_platform_roles.sql)
  const { data: adminRow, error: adminErr } = await supabase
    .from('platform_admins')
    .select('user_id, role, active')
    .eq('user_id', userId)
    .maybeSingle();

  if (!adminErr && adminRow?.user_id) {
    if (adminRow.active === false) return null;
    const r = String(adminRow.role || 'owner');
    return r === 'manager' || r === 'support' ? r : 'owner';
  }

  // Older database without the role columns: fall back to the plain lookup (treated as owner)
  if (adminErr) {
    const { data: legacyRow } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (legacyRow?.user_id) return 'owner';
  }

  // 2. One-time bootstrap seed from PLATFORM_OWNER_EMAILS (always an owner)
  if (userEmail && env?.PLATFORM_OWNER_EMAILS) {
    const allowed = env.PLATFORM_OWNER_EMAILS.split(',').map(e => e.trim().toLowerCase());
    if (allowed.includes(userEmail.toLowerCase())) {
      try {
        await supabase.from('platform_admins').insert({ user_id: userId, role: 'owner', email: userEmail });
        console.log('[Platform Admin] Auto-seeded platform owner.');
      } catch (err) {
        console.warn('Failed to seed platform admin:', err);
      }
      return 'owner';
    }
  }

  return null;
}

export async function isCallerPlatformAdmin(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string,
  env?: Env
): Promise<boolean> {
  return (await getPlatformRole(supabase, userId, userEmail, env)) !== null;
}

/**
 * Authenticates the bearer token and requires one of the given platform roles.
 * Returns { supabase, user, role } or { error, status }.
 */
export async function requirePlatformRole(
  request: Request,
  env: Env,
  allowed: PlatformRole[]
): Promise<
  | { supabase: SupabaseClient; user: { id: string; email: string }; role: PlatformRole }
  | { error: string; status: number }
> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return { error: 'Authorization token required.', status: 401 };

  const configErr = validateEnvironmentConfig(env);
  if (configErr) return { error: 'Service temporarily unavailable', status: 503 };

  let supabase: SupabaseClient;
  try {
    supabase = getSupabaseAdmin(env);
  } catch {
    return { error: 'Database service unconfigured.', status: 503 };
  }

  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user?.email) {
    return { error: 'Invalid or expired session.', status: 401 };
  }

  const role = await getPlatformRole(supabase, userData.user.id, userData.user.email, env);
  if (!role) return { error: 'Forbidden: Platform admin authority required.', status: 403 };
  if (!allowed.includes(role)) {
    return { error: `Forbidden: your platform role (${role}) cannot do this.`, status: 403 };
  }
  return { supabase, user: { id: userData.user.id, email: userData.user.email }, role };
}

