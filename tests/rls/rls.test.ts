import { describe, it, expect, beforeAll } from 'vitest';
import {
  seedRlsFixtures,
  asUser,
  USERS_A,
  USERS_B,
  PLATFORM_USERS,
  TENANT_A,
  TENANT_B,
  FIXTURES,
} from './harness';

describe('Row Level Security (RLS) Test Suite', () => {
  beforeAll(async () => {
    await seedRlsFixtures();
  });

  // =========================================================================
  // CATEGORY 1: Cross-Tenant Read
  // =========================================================================
  describe('Category 1: Cross-Tenant Read Isolation', () => {
    it('Tenant A user cannot read Tenant B leads', async () => {
      const { data, error } = await asUser(USERS_A.salesperson, async client => {
        const res = await client.query('SELECT * FROM public.leads WHERE id = $1', [
          FIXTURES.leadBId,
        ]);
        return res.rows;
      });

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('Tenant A owner sees only Tenant A leads, zero Tenant B leads', async () => {
      const { data, error } = await asUser(USERS_A.owner, async client => {
        const res = await client.query('SELECT id, company_id FROM public.leads');
        return res.rows;
      });

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThan(0);
      for (const row of data!) {
        expect(row.company_id).toBe(TENANT_A.id);
        expect(row.company_id).not.toBe(TENANT_B.id);
      }
    });

    it('Tenant B manager cannot read Tenant A customers or products', async () => {
      const { data: custRows, error: custErr } = await asUser(USERS_B.manager, async client => {
        const res = await client.query('SELECT * FROM public.customers WHERE id = $1', [
          FIXTURES.customerAId,
        ]);
        return res.rows;
      });
      expect(custErr).toBeNull();
      expect(custRows).toHaveLength(0);

      const { data: prodRows, error: prodErr } = await asUser(USERS_B.manager, async client => {
        const res = await client.query('SELECT * FROM public.products WHERE id = $1', [
          FIXTURES.productAId,
        ]);
        return res.rows;
      });
      expect(prodErr).toBeNull();
      expect(prodRows).toHaveLength(0);
    });
  });

  // =========================================================================
  // CATEGORY 2: Cross-Tenant Write
  // =========================================================================
  describe('Category 2: Cross-Tenant Write Isolation', () => {
    it('Tenant A owner cannot update Tenant B leads (affects 0 rows)', async () => {
      const { data, error } = await asUser(USERS_A.owner, async client => {
        const res = await client.query(
          "UPDATE public.leads SET data = '{\"hacked\": true}'::jsonb WHERE id = $1",
          [FIXTURES.leadBId]
        );
        return res.rowCount;
      });

      expect(error).toBeNull();
      expect(data).toBe(0);
    });

    it('Tenant A user cannot insert records tagged with Tenant B company_id (RLS check violation)', async () => {
      const { data, error } = await asUser(USERS_A.salesperson, async client => {
        const id = 'ffffffff-0000-4000-8000-000000000001';
        return await client.query(
          `INSERT INTO public.leads (id, company_id, created_by, data)
           VALUES ($1, $2, $3, '{"companyName": "Cross Tenant Exploit"}'::jsonb)`,
          [id, TENANT_B.id, USERS_A.salesperson]
        );
      });

      // Expect an RLS check violation or permission error
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('Tenant A owner cannot delete Tenant B products (affects 0 rows)', async () => {
      const { data, error } = await asUser(USERS_A.owner, async client => {
        const res = await client.query('DELETE FROM public.products WHERE id = $1', [
          FIXTURES.productBId,
        ]);
        return res.rowCount;
      });

      expect(error).toBeNull();
      expect(data).toBe(0);
    });
  });

  // =========================================================================
  // CATEGORY 3: Role-Restricted Write
  // =========================================================================
  describe('Category 3: Role-Restricted Write Enforcement', () => {
    it('Salesperson cannot insert products (restricted to owner/admin/inventory_manager)', async () => {
      const { data, error } = await asUser(USERS_A.salesperson, async client => {
        const id = 'ffffffff-0000-4000-8000-000000000002';
        return await client.query(
          `INSERT INTO public.products (id, company_id, created_by, data)
           VALUES ($1, $2, $3, '{"name": "Unauthorized Product"}'::jsonb)`,
          [id, TENANT_A.id, USERS_A.salesperson]
        );
      });

      // RLS policy prevents salesperson from inserting products
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('Salesperson cannot update company settings (restricted to owner/admin)', async () => {
      const { data, error } = await asUser(USERS_A.salesperson, async client => {
        const res = await client.query(
          "UPDATE public.company_settings SET data = '{\"companyName\": \"Altered by Salesperson\"}'::jsonb WHERE company_id = $1",
          [TENANT_A.id]
        );
        return res.rowCount;
      });

      expect(error).toBeNull();
      expect(data).toBe(0);
    });

    it('Owner CAN update company settings within their own company', async () => {
      const { data, error } = await asUser(USERS_A.owner, async client => {
        const res = await client.query(
          "UPDATE public.company_settings SET data = '{\"companyName\": \"Tenant A Updated\"}'::jsonb WHERE company_id = $1",
          [TENANT_A.id]
        );
        return res.rowCount;
      });

      expect(error).toBeNull();
      expect(data).toBe(1);
    });

    it('Platform Support user CANNOT read tenant business data directly', async () => {
      const { data, error } = await asUser(PLATFORM_USERS.support, async client => {
        const res = await client.query('SELECT * FROM public.leads');
        return res.rows;
      });

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });
});
