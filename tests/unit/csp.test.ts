import { describe, it, expect } from 'vitest';
import { buildContentSecurityPolicy, buildHeadersContent } from '../../src/utils/csp';

describe('Environment-Agnostic CSP Header Generation (Task 5)', () => {
  it('throws descriptive error if VITE_SUPABASE_URL is missing or empty', () => {
    expect(() => buildContentSecurityPolicy('')).toThrow(
      'VITE_SUPABASE_URL is required to generate Content-Security-Policy'
    );
    expect(() => buildContentSecurityPolicy(undefined)).toThrow(
      'VITE_SUPABASE_URL is required to generate Content-Security-Policy'
    );
    expect(() => buildContentSecurityPolicy('   ')).toThrow(
      'VITE_SUPABASE_URL is required to generate Content-Security-Policy'
    );
  });

  it('throws descriptive error if VITE_SUPABASE_URL is not a valid URL', () => {
    expect(() => buildContentSecurityPolicy('not-a-valid-url')).toThrow(
      'is not a valid URL'
    );
  });

  it('generates strict CSP with exact HTTPS and WSS origins for valid Supabase URL', () => {
    const csp = buildContentSecurityPolicy('https://tearguopksaoqsypggwl.supabase.co');

    expect(csp).toContain('connect-src');
    expect(csp).toContain('https://tearguopksaoqsypggwl.supabase.co');
    expect(csp).toContain('wss://tearguopksaoqsypggwl.supabase.co');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it('buildHeadersContent produces complete _headers format with standard security headers', () => {
    const headers = buildHeadersContent('https://prod-db.supabase.co');

    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(headers).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    expect(headers).toContain('Content-Security-Policy:');
    expect(headers).toContain('https://prod-db.supabase.co');
    expect(headers).toContain('wss://prod-db.supabase.co');
  });
});
