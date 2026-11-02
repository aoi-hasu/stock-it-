# Testing Strategy & Verification Guide

This document describes the test suites, verification scripts, and automated CI quality gates implemented for StockItEase.

---

## 1. Quick Command Reference

| Command | Target | Description |
| :--- | :--- | :--- |
| `npm run typecheck` | TypeScript | Strict verification across root, functions (`functions/tsconfig.json`), and tests (`tests/tsconfig.json`). |
| `npm run test:unit` | Unit Tests | Fast unit tests for configuration placeholder validation, CSP generation, and crypto utilities. |
| `npm run test:rls` | PostgreSQL RLS | Executes the multi-tenant Row Level Security harness against PostgreSQL. |
| `npm run test:all` | All Suites | Executes both unit and RLS test suites in Vitest. |
| `npm run verify:baseline`| Schema Diff | Builds one database from migrations 01–16 and one from baseline, proving 0-diff equivalence. |
| `npm run build` | Production Build | Verifies Vite SPA production bundle and dynamic `_headers` CSP generation. |

---

## 2. Row Level Security (RLS) Test Harness (`tests/rls/`)

The RLS test harness validates database-level multi-tenant isolation and role-based permissions directly against PostgreSQL using real session contexts.

### Architecture
- **Tenants Under Test**:
  - `Tenant A` (`11111111-1111-4111-8111-111111111111`): Acme Industrial Solutions
  - `Tenant B` (`22222222-2222-4222-8222-222222222222`): Beta Manufacturing Ltd
- **Roles Tested Per Tenant (7 roles)**:
  - `owner`
  - `admin`
  - `manager`
  - `sales_manager`
  - `salesperson`
  - `inventory_manager`
  - `accounts`
- **Platform Staff Roles (3 roles)**:
  - `owner`
  - `manager`
  - `support`

### Context Switching Helper (`asUser`)
Supabase RLS is simulated by running queries within an explicit PostgreSQL transaction:
```ts
await client.query('BEGIN');
await client.query('SET LOCAL ROLE authenticated');
await client.query(`SET LOCAL "request.jwt.claim.sub" = '${userId}'`);
await client.query(`SET LOCAL "request.jwt.claim.role" = 'authenticated'`);
// Execute query under strict RLS
await client.query('COMMIT');
```

### Covered Test Categories
1. **Category 1: Cross-Tenant Read Isolation**:
   - Asserts that Tenant A users cannot query or receive Tenant B leads, customers, or products.
   - Asserts that selecting company-scoped tables returns strictly Tenant A rows.
2. **Category 2: Cross-Tenant Write Isolation**:
   - Asserts that Tenant A users cannot update Tenant B records (affects 0 rows).
   - Asserts that attempting to insert a row tagged with another tenant's `company_id` throws an RLS `with check` violation.
   - Asserts that Tenant A users cannot delete Tenant B products (affects 0 rows).
3. **Category 3: Role-Restricted Write Enforcement**:
   - Asserts that `salesperson` cannot insert products (restricted to owner/admin/inventory_manager).
   - Asserts that `salesperson` cannot modify `company_settings` (restricted to owner/admin).
   - Asserts that `owner` CAN update `company_settings` within their own company.
   - Asserts that `support` platform staff cannot directly read tenant business records (fail closed).

---

## 3. Schema Equivalence Verification (`scripts/verify-baseline-diff.sh`)

To eliminate migration drift and verify that the squashed baseline (`supabase/migrations/20261101000000_baseline.sql`) is 100% equivalent to running sequential migrations 01 through 16:
1. Spawns two clean databases: `db_test_01_16` and `db_test_baseline`.
2. Applies incremental migrations 01, 03–16 to `db_test_01_16`.
3. Applies `20261101000000_baseline.sql` to `db_test_baseline`.
4. Dumps the `public` schema for both using `pg_dump --schema-only --schema=public --no-owner`.
5. Compares both dumps using `diff -u`.
6. Passes ONLY if the diff is 100% empty.

---

## 4. Continuous Integration (GitHub Actions)

Configured in `.github/workflows/ci.yml`:
- **Triggers**: On every push and pull request.
- **Concurrency**: Cancels stale workflow runs automatically.
- **Steps**:
  1. `npm ci` (clean installation with cached node_modules).
  2. `npm run typecheck` (verifies zero TS errors across all directories).
  3. `npm run test:unit` (runs unit tests).
  4. `npm run build` (verifies production build and dynamic CSP generation).
  5. `scripts/verify-baseline-diff.sh` (validates schema equivalence against a PostgreSQL service).
  6. `npm run test:rls` (runs RLS isolation test suite).
- **Rule**: All steps must pass to allow merge.
