import { Pool, PoolClient } from 'pg';

export const TENANT_A = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Tenant A Industrial Corp',
  code: 'TENA',
};

export const TENANT_B = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Tenant B Manufacturing Ltd',
  code: 'TENB',
};

export const ROLES = [
  'owner',
  'admin',
  'manager',
  'sales_manager',
  'salesperson',
  'inventory_manager',
  'accounts',
] as const;

export type TenantRole = (typeof ROLES)[number];

// Fixed UUID mapping for predictable tests
export const USERS_A: Record<TenantRole, string> = {
  owner: '11111111-0001-4000-8000-000000000001',
  admin: '11111111-0002-4000-8000-000000000002',
  manager: '11111111-0003-4000-8000-000000000003',
  sales_manager: '11111111-0004-4000-8000-000000000004',
  salesperson: '11111111-0005-4000-8000-000000000005',
  inventory_manager: '11111111-0006-4000-8000-000000000006',
  accounts: '11111111-0007-4000-8000-000000000007',
};

export const USERS_B: Record<TenantRole, string> = {
  owner: '22222222-0001-4000-8000-000000000001',
  admin: '22222222-0002-4000-8000-000000000002',
  manager: '22222222-0003-4000-8000-000000000003',
  sales_manager: '22222222-0004-4000-8000-000000000004',
  salesperson: '22222222-0005-4000-8000-000000000005',
  inventory_manager: '22222222-0006-4000-8000-000000000006',
  accounts: '22222222-0007-4000-8000-000000000007',
};

export const PLATFORM_USERS = {
  owner: '33333333-0001-4000-8000-000000000001',
  manager: '33333333-0002-4000-8000-000000000002',
  support: '33333333-0003-4000-8000-000000000003',
};

export const FIXTURES = {
  leadAId: 'aaaaaaaa-1111-4000-8000-000000000001',
  leadBId: 'bbbbbbbb-2222-4000-8000-000000000001',
  customerAId: 'aaaaaaaa-1111-4000-8000-000000000002',
  customerBId: 'bbbbbbbb-2222-4000-8000-000000000002',
  productAId: 'aaaaaaaa-1111-4000-8000-000000000003',
  productBId: 'bbbbbbbb-2222-4000-8000-000000000003',
};

let pool: Pool | null = null;

export function getTestPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.TEST_DATABASE_URL ||
      'postgresql://pguser@localhost:5432/db_test_baseline';
    pool = new Pool({ connectionString });
  }
  return pool;
}

/**
 * Seed the test database with Tenants A and B, 7 roles each,
 * platform staff, and test entity records.
 */
export async function seedRlsFixtures(): Promise<void> {
  const p = getTestPool();
  const client = await p.connect();

  try {
    await client.query('BEGIN');

    // 1. Ensure Auth users exist
    const allUserIds = [
      ...Object.values(USERS_A),
      ...Object.values(USERS_B),
      ...Object.values(PLATFORM_USERS),
    ];

    for (const uid of allUserIds) {
      await client.query(
        `INSERT INTO auth.users (id, email, created_at)
         VALUES ($1, $2, now())
         ON CONFLICT (id) DO NOTHING`,
        [uid, `user-${uid.slice(0, 8)}@testcorp.internal`]
      );
    }

    // 2. Insert Organizations
    await client.query(
      `INSERT INTO public.organizations (id, name, code, active, data)
       VALUES
         ($1, $2, $3, true, '{"plan": "Professional", "maxUsers": 15, "subscriptionStatus": "active"}'::jsonb),
         ($4, $5, $6, true, '{"plan": "Professional", "maxUsers": 15, "subscriptionStatus": "active"}'::jsonb)
       ON CONFLICT (id) DO UPDATE SET active = true, data = EXCLUDED.data`,
      [TENANT_A.id, TENANT_A.name, TENANT_A.code, TENANT_B.id, TENANT_B.name, TENANT_B.code]
    );

    // 3. Insert Profiles for Tenant A and Tenant B (7 roles each)
    for (const role of ROLES) {
      const uidA = USERS_A[role];
      await client.query(
        `INSERT INTO public.profiles (id, company_id, name, email, role, active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, active = true`,
        [uidA, TENANT_A.id, `Tenant A ${role}`, `user-${role}@tenanta.com`, role]
      );

      const uidB = USERS_B[role];
      await client.query(
        `INSERT INTO public.profiles (id, company_id, name, email, role, active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, active = true`,
        [uidB, TENANT_B.id, `Tenant B ${role}`, `user-${role}@tenantb.com`, role]
      );
    }

    // 4. Insert Platform Staff (owner, manager, support)
    await client.query(
      `INSERT INTO public.platform_admins (user_id, role, name, email, active)
       VALUES
         ($1, 'owner', 'Platform Owner', 'platform-owner@corp.internal', true),
         ($2, 'manager', 'Platform Manager', 'platform-manager@corp.internal', true),
         ($3, 'support', 'Platform Support', 'platform-support@corp.internal', true)
       ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, active = true`,
      [PLATFORM_USERS.owner, PLATFORM_USERS.manager, PLATFORM_USERS.support]
    );

    // 5. Seed Business Data Fixtures
    // Leads
    await client.query(
      `INSERT INTO public.leads (id, company_id, created_by, data)
       VALUES
         ($1, $2, $3, '{"companyName": "Acme Lead A", "requirement": "Machinery"}'::jsonb),
         ($4, $5, $6, '{"companyName": "Beta Lead B", "requirement": "Tools"}'::jsonb)
       ON CONFLICT (company_id, id) DO NOTHING`,
      [FIXTURES.leadAId, TENANT_A.id, USERS_A.salesperson, FIXTURES.leadBId, TENANT_B.id, USERS_B.salesperson]
    );

    // Customers
    await client.query(
      `INSERT INTO public.customers (id, company_id, created_by, data)
       VALUES
         ($1, $2, $3, '{"name": "Customer Corp A", "city": "Delhi"}'::jsonb),
         ($4, $5, $6, '{"name": "Customer Corp B", "city": "Mumbai"}'::jsonb)
       ON CONFLICT (company_id, id) DO NOTHING`,
      [FIXTURES.customerAId, TENANT_A.id, USERS_A.owner, FIXTURES.customerBId, TENANT_B.id, USERS_B.owner]
    );

    // Products
    await client.query(
      `INSERT INTO public.products (id, company_id, created_by, data)
       VALUES
         ($1, $2, $3, '{"name": "Industrial Press A", "stock": 10, "unitPrice": 50000}'::jsonb),
         ($4, $5, $6, '{"name": "Hydraulic Unit B", "stock": 5, "unitPrice": 75000}'::jsonb)
       ON CONFLICT (company_id, id) DO NOTHING`,
      [FIXTURES.productAId, TENANT_A.id, USERS_A.owner, FIXTURES.productBId, TENANT_B.id, USERS_B.owner]
    );

    // Company Settings (PK is company_id)
    await client.query(
      `INSERT INTO public.company_settings (company_id, data)
       VALUES
         ($1, '{"companyName": "Tenant A Corp", "quotationPrefix": "QTA"}'::jsonb),
         ($2, '{"companyName": "Tenant B Corp", "quotationPrefix": "QTB"}'::jsonb)
       ON CONFLICT (company_id) DO NOTHING`,
      [TENANT_A.id, TENANT_B.id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute queries as a specific authenticated user within an RLS transaction.
 */
export async function asUser<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<{ data: T | null; error: Error | null }> {
  const p = getTestPool();
  const client = await p.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query(`SET LOCAL "request.jwt.claim.sub" = '${userId}'`);
    await client.query(`SET LOCAL "request.jwt.claim.role" = 'authenticated'`);

    const result = await fn(client);
    await client.query('COMMIT');
    return { data: result, error: null };
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback err if transaction already aborted
    }
    return { data: null, error: err };
  } finally {
    // Reset session settings before returning to pool
    try {
      await client.query('RESET ROLE');
    } catch {
      // ignore
    }
    client.release();
  }
}
