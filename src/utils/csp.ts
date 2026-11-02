/**
 * Generates environment-aware Content-Security-Policy (CSP) headers
 * bound strictly to the target environment's Supabase project URL.
 */
export function buildContentSecurityPolicy(supabaseUrl?: string | null): string {
  if (!supabaseUrl || !supabaseUrl.trim()) {
    throw new Error('VITE_SUPABASE_URL is required to generate Content-Security-Policy');
  }

  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error(`VITE_SUPABASE_URL is not a valid URL: ${supabaseUrl}`);
  }

  const httpOrigin = `${parsed.protocol}//${parsed.host}`;
  const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsOrigin = `${wsProto}//${parsed.host}`;

  return `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' ${httpOrigin} ${wsOrigin} blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';`;
}

export function buildHeadersContent(supabaseUrl?: string | null): string {
  const csp = buildContentSecurityPolicy(supabaseUrl);
  return `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  Content-Security-Policy: ${csp}\n`;
}
