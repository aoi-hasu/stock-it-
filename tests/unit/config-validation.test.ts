import { describe, it, expect, vi } from 'vitest';
import {
  isPlaceholderValue,
  getPlaceholderConfigIssues,
  validateEnvironmentConfig,
  timingSafeEqualStr,
  sha256Hex,
  generateSecurePassword,
  generateIntegrationToken,
} from '../../functions/api/_utils';

describe('Configuration Placeholder Validation (Task 6)', () => {
  describe('isPlaceholderValue helper', () => {
    it('detects values starting with your_ or your-', () => {
      expect(isPlaceholderValue('your_secret_key')).toBe(true);
      expect(isPlaceholderValue('YOUR_API_TOKEN')).toBe(true);
      expect(isPlaceholderValue('your-project-id')).toBe(true);
    });

    it('detects all-zero UUIDs', () => {
      expect(isPlaceholderValue('00000000-0000-0000-0000-000000000000')).toBe(true);
    });

    it('detects example.com email addresses and URLs', () => {
      expect(isPlaceholderValue('owner@example.com')).toBe(true);
      expect(isPlaceholderValue('https://example.com/api')).toBe(true);
      expect(isPlaceholderValue('admin@example.com')).toBe(true);
    });

    it('detects template bracket markers and keywords', () => {
      expect(isPlaceholderValue('<YOUR_KEY>')).toBe(true);
      expect(isPlaceholderValue('[PASTE_TOKEN_HERE]')).toBe(true);
      expect(isPlaceholderValue('placeholder')).toBe(true);
      expect(isPlaceholderValue('changeme')).toBe(true);
      expect(isPlaceholderValue('todo')).toBe(true);
    });

    it('accepts legitimate production values', () => {
      expect(isPlaceholderValue('prod_sec_9f81a7b2c938472910')).toBe(false);
      expect(isPlaceholderValue('4ba32e3a-e99d-4876-b6fb-cfa8b8849b38')).toBe(false);
      expect(isPlaceholderValue('dev@mycompany.in')).toBe(false);
      expect(isPlaceholderValue('EAABzb1...whatsappSecret')).toBe(false);
    });
  });

  describe('getPlaceholderConfigIssues', () => {
    it('identifies placeholder in WEBSITE_LEAD_SECRET', () => {
      const issues = getPlaceholderConfigIssues({
        WEBSITE_LEAD_SECRET: 'your_lead_secret',
      });
      expect(issues.some(i => i.key === 'WEBSITE_LEAD_SECRET')).toBe(true);
    });

    it('identifies all-zero UUID in DEFAULT_COMPANY_ID', () => {
      const issues = getPlaceholderConfigIssues({
        DEFAULT_COMPANY_ID: '00000000-0000-0000-0000-000000000000',
      });
      expect(issues.some(i => i.key === 'DEFAULT_COMPANY_ID')).toBe(true);
    });

    it('identifies example.com in PLATFORM_OWNER_EMAILS', () => {
      const issues = getPlaceholderConfigIssues({
        PLATFORM_OWNER_EMAILS: 'real@company.com, admin@example.com',
      });
      expect(issues.some(i => i.key === 'PLATFORM_OWNER_EMAILS')).toBe(true);
    });

    it('identifies placeholder in INDIAMART_CRM_KEY', () => {
      const issues = getPlaceholderConfigIssues({
        INDIAMART_CRM_KEY: 'your_indiamart_key',
      });
      expect(issues.some(i => i.key === 'INDIAMART_CRM_KEY')).toBe(true);
    });

    it('identifies placeholder in WHATSAPP_* variables', () => {
      const issues = getPlaceholderConfigIssues({
        WHATSAPP_APP_SECRET: 'your_meta_secret',
        WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'your_verify_token',
      });
      expect(issues.some(i => i.key === 'WHATSAPP_APP_SECRET')).toBe(true);
      expect(issues.some(i => i.key === 'WHATSAPP_WEBHOOK_VERIFY_TOKEN')).toBe(true);
    });

    it('returns empty array for clean production configuration', () => {
      const issues = getPlaceholderConfigIssues({
        WEBSITE_LEAD_SECRET: 'c4e97298a28f7d98321045a7',
        DEFAULT_COMPANY_ID: '772b163a-7ef9-4089-a2e6-993214da8891',
        PLATFORM_OWNER_EMAILS: 'founder@stockitease.com,ops@stockitease.com',
        INDIAMART_CRM_KEY: 'im_crm_prod_key_77189',
        WHATSAPP_APP_SECRET: '38fa72810cd832f91a',
        WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'prod_verify_8829104',
      });
      expect(issues).toHaveLength(0);
    });
  });

  describe('validateEnvironmentConfig endpoint behavior', () => {
    it('returns HTTP 503 with generic message and logs error when placeholder is detected', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = validateEnvironmentConfig({
        DEFAULT_COMPANY_ID: '00000000-0000-0000-0000-000000000000',
      });

      expect(res).not.toBeNull();
      expect(res!.status).toBe(503);

      const body = await res!.json();
      expect(body).toEqual({ error: 'Service temporarily unavailable' });

      // Ensure reason was logged to server logs
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CRITICAL CONFIG ERROR] Insecure placeholder detected in DEFAULT_COMPANY_ID')
      );

      consoleSpy.mockRestore();
    });

    it('returns null when all configuration is valid', () => {
      const res = validateEnvironmentConfig({
        DEFAULT_COMPANY_ID: '772b163a-7ef9-4089-a2e6-993214da8891',
        PLATFORM_OWNER_EMAILS: 'admin@prodcorp.com',
      });
      expect(res).toBeNull();
    });
  });

  describe('Cryptographic & utility primitives', () => {
    it('timingSafeEqualStr performs timing-safe equality', () => {
      expect(timingSafeEqualStr('secret123', 'secret123')).toBe(true);
      expect(timingSafeEqualStr('secret123', 'secret456')).toBe(false);
      expect(timingSafeEqualStr('secret123', 'secret1234')).toBe(false);
      expect(timingSafeEqualStr(null, 'secret')).toBe(false);
    });

    it('sha256Hex produces valid 64-char lowercase hex hash', async () => {
      const hash = await sha256Hex('test-input');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generateSecurePassword generates requested length string', () => {
      const pwd = generateSecurePassword(20);
      expect(pwd).toHaveLength(20);
    });

    it('generateIntegrationToken generates 64-char hex token', () => {
      const token = generateIntegrationToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
