# StockItEase

**StockItEase** is a production-ready, multi-tenant enterprise business management, CRM, inventory management, automated GST quotation, and sales pipeline platform built by aoihasu.

It is designed for industrial, manufacturing, and distribution businesses to manage multiple independent client organizations with strict tenant isolation, role-based access control (RBAC), end-to-end sales pipelines, GST-compliant invoice generation with manual e-Way bill tracking, WhatsApp/IndiaMART lead webhooks, and platform administration.

---

## 🛠 Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Motion, Lucide React
- **Document & Spreadsheet Generation**: jsPDF, jspdf-autotable, ExcelJS
- **Backend & Database**: Supabase (PostgreSQL 15+, Row Level Security, Supabase Auth)
- **Serverless API Gateway**: Cloudflare Pages Functions (`/functions/api`), Cloudflare KV (`RATE_LIMIT`)

---

## 🔐 Environment Variables & Secrets

### 1. Frontend (Browser / Client-Side)

Configure in `.env` (or `.env.local` for local development, and in Cloudflare Pages build environment variables):

| Variable | Description | Exposure |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xyz.supabase.co`) | Public / Browser |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon/Public API Key | Public / Browser |

> **SECURITY NOTICE**: Never place the `SUPABASE_SERVICE_ROLE_KEY` or any administrative secrets into frontend environment variables or client-side code. The service role key bypasses Row Level Security and must remain exclusively on the server.

---

### 2. Cloudflare Server-Side (Pages Functions)

Configure in `.dev.vars` (for local Wrangler development) and under **Cloudflare Pages Dashboard > Your Project > Settings > Environment variables**:

| Variable | Description |
| :--- | :--- |
| `SUPABASE_URL` | Supabase project API URL (e.g. `https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Secret Key (**NEVER expose to browser**) |
| `PLATFORM_OWNER_EMAILS` | Comma-separated list of platform developer/super-admin emails |
| `WEBSITE_LEAD_SECRET` | Fallback secret token for website lead form ingestion |
| `INDIAMART_CRM_KEY` | Fallback CRM key for IndiaMART push webhook |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Verification token for Meta WhatsApp Webhook GET handshake |
| `WHATSAPP_APP_SECRET` | Meta App Secret for fail-closed HMAC-SHA256 signature verification |
| `DEFAULT_COMPANY_ID` | Fallback Organization UUID for unmapped incoming webhooks |
| `DEFAULT_LEAD_ASSIGNEE_ID` | Fallback profile UUID for lead auto-assignment |
| `LEAD_ALLOWED_ORIGINS` | Comma-separated origins allowed to submit leads from web forms |

### 3. Distributed Rate Limiting (Cloudflare KV Binding)

To protect inbound webhook and lead capture endpoints from brute-force or denial-of-service abuse:
1. In the Cloudflare Dashboard, navigate to **Storage & Databases > KV**.
2. Create a KV namespace named `stockitease-ratelimit`.
3. In your Cloudflare Pages project, go to **Settings > Functions > KV namespace bindings**.
4. Add a binding with:
   - **Variable name**: `RATE_LIMIT`
   - **KV namespace**: `stockitease-ratelimit`

*(If the `RATE_LIMIT` KV binding is not configured, the application falls back safely to in-memory rate limiting and logs a warning.)*

---

## 🔌 Inbound Webhook Specifications

### IndiaMART Webhook Gateway (`/api/webhooks-indiamart`)
- **Preferred Authentication**: Send the token via header:
  - `X-API-Key: <your_token>` or `Authorization: Bearer <your_token>`
  - *Query parameter compatibility (`?token=<your_token>`)* is supported for legacy IndiaMART push setups, but HTTP headers are recommended.
- **Privacy & Audit**: Webhook URLs and raw security tokens are never printed to server logs.

### WhatsApp Meta Cloud Webhook (`/api/webhooks-whatsapp`)
- **GET Handshake**: Verifies `hub.challenge` using your configured token.
- **POST Notifications**: Fails closed. If `WHATSAPP_APP_SECRET` is missing, returns HTTP 503. If the Meta `x-hub-signature-256` HMAC-SHA256 signature header is missing or does not match, returns HTTP 401 using constant-time comparison.

### Website Lead Capture Gateway (`/api/leads-capture`)
- Validates the incoming browser `Origin` against the integration's `allowed_origins` list configured per company.
- Only permitted origins receive CORS `Access-Control-Allow-Origin`.
- If no origins are configured, only direct server-to-server calls (with no `Origin` header) are permitted.
- Emits `Vary: Origin` on all responses.

---

## 🗄️ Database Setup & Migration Order

### Recommended: Squashed Baseline Migration
For new environments, execute the squashed baseline in the Supabase SQL Editor:
- `supabase/migrations/20261101000000_baseline.sql` — Complete consolidated schema, indexes, functions, and RLS policies equivalent to migrations 01–16.

### Alternative: Incremental Migration Sequence
If executing individual migration files incrementally, execute them in this exact sequence:

1. `supabase/01_schema.sql` — Base tables, RLS policies, role helpers, and touch triggers.
2. `supabase/03_functions.sql` — Business logic functions and sequence generators.
3. `supabase/04_fix_company_ids.sql` — Multi-tenant company ID data integrity validations.
4. `supabase/05_fix_functions.sql` — Atomic number generation and schema fixes.
5. `supabase/06_suspension_works.sql` — Organization status suspension enforcement.
6. `supabase/07_lead_phone_index.sql` — Phone normalization and indexing for fast deduplication.
7. `supabase/08_hardening.sql` — Input validation hardening, storage policies, and audit triggers.
8. `supabase/09_fix_password_ack.sql` — Forced password reset state machine.
9. `supabase/10_multi_tenant_integrations.sql` — Per-company integration tokens and origin allowlists.
10. `supabase/11_money_stock_enforcement.sql` — Strict financial calculation rules and inventory ledger.
11. `supabase/12_platform_admin_and_support.sql` — Platform admin table, support access logging, and developer decoupling.
12. `supabase/13_subscription_seat_enforcement.sql` — Plan seat limits and subscription grace period triggers.
13. `supabase/14_access_control_and_audit_triggers.sql` — Fine-grained salesperson scoping and audit triggers.
14. `supabase/15_fix_valid_until_null.sql` — Subscription date handling resilience and my_company() safety.
15. `supabase/16_platform_roles.sql` — Platform staff roles (owner, manager, support), Support View audit logs, and viewer read policies.

*(Note: `02_first_admin.sql` is a post-migration seed template, NOT a schema migration, and must be executed only after all migrations above complete).*

### Post-Migration Initial Admin Setup (`02_first_admin.sql`)
After running migrations 01 through 16 (or the baseline migration):
1. In the Supabase Dashboard, navigate to **Authentication > Users > Add user**.
2. Enter the business owner email and a temporary strong password. Check **Auto Confirm User**.
3. Copy the newly created user's UUID.
4. Open `supabase/02_first_admin.sql`, replace `[PASTE_CLIENT_OWNER_UID_HERE]` with the real UUID, and execute it to create your initial client company and owner profile.
5. To configure your platform developer account, insert your user UID into `public.platform_admins`:
   ```sql
   insert into public.platform_admins (user_id, role, name, email)
   values ('[YOUR_DEVELOPER_AUTH_UID]'::uuid, 'owner', 'Platform Developer', 'developer@yourcompany.com');
   ```

---

## 🚀 Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase URL and anon key
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Run TypeScript validation**:
   ```bash
   npm run lint
   ```

5. **Test production build**:
   ```bash
   npm run build
   ```

---

## 🌐 Cloudflare Pages Deployment

1. Connect your repository to **Cloudflare Pages**.
2. Configure build settings:
   - **Framework preset**: `None` / `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
3. In **Settings > Environment variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - Plus your integration secrets (`PLATFORM_OWNER_EMAILS`, `WHATSAPP_APP_SECRET`, etc.)
4. In **Settings > Functions > KV namespace bindings**, bind `RATE_LIMIT` to your KV namespace.
5. In `public/_headers`, verify that `connect-src` contains your exact Supabase project origin:
   ```
   connect-src 'self' https://YOUR-PROJECT.supabase.co wss://YOUR-PROJECT.supabase.co blob: data:;
   ```
6. Deploy!
