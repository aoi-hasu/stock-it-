# Environment Management & Secrets Specification

This document defines the environment matrix, secrets management, and configuration security guardrails for StockItEase across **Preview**, **Staging**, and **Production**.

---

## 1. Environments Overview

| Environment | Purpose | Hosting Platform | Database Instance | KV Rate Limit Binding |
| :--- | :--- | :--- | :--- | :--- |
| **Preview** | Pull Request previews, branch validations | Cloudflare Pages Preview | Isolated Supabase project / local | `stockitease-ratelimit-preview` |
| **Staging** | Pre-production testing, QA, release staging | Cloudflare Pages Staging | Staging Supabase project | `stockitease-ratelimit-staging` |
| **Production** | Live production serving tenant businesses | Cloudflare Pages Production | High-availability Supabase project | `stockitease-ratelimit-prod` |

---

## 2. Configuration & Secrets Matrix

### A. Frontend Build-Time Variables (Browser Exposed)
Configured under **Cloudflare Pages Dashboard > Settings > Environment variables** (or `.env` locally):

| Variable | Required In | Exposure | Purpose / Validation |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | All | Public / Client Bundle | Supabase Project API URL. **Enforced at build time**: Vite extracts the HTTPS and WSS origins to dynamically generate `dist/_headers` with a strict `Content-Security-Policy`. Fails the build if missing or set to a placeholder. |
| `VITE_SUPABASE_ANON_KEY` | All | Public / Client Bundle | Supabase public/anonymous API key for browser client authentication. |

### B. Server-Side Runtime Secrets (Pages Functions)
Configured under **Cloudflare Pages Dashboard > Settings > Environment variables (Server)** or `.dev.vars` for local Wrangler:

| Secret / Variable | Required In | Sensitivity | Purpose & Guardrails |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | All | High | Server-side Supabase API endpoint. |
| `SUPABASE_SERVICE_ROLE_KEY` | All | **CRITICAL** | Supabase Service Role Secret Key. Bypasses RLS. **MUST NEVER** be placed in frontend `.env` or client bundle. |
| `PLATFORM_OWNER_EMAILS` | All | High | Comma-separated list of platform super-administrators. Reject if containing `example.com` or `your_...`. |
| `WEBSITE_LEAD_SECRET` | Staging / Prod | High | Secret token for inbound website lead ingestion. Validated against placeholders. |
| `INDIAMART_CRM_KEY` | Staging / Prod | High | Inbound push webhook authentication token for IndiaMART leads. Validated against placeholders. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Staging / Prod | High | Token verified during Meta WhatsApp GET webhook challenge handshake. |
| `WHATSAPP_APP_SECRET` | Staging / Prod | **CRITICAL** | Meta App Secret used for HMAC-SHA256 signature verification. Fails closed (HTTP 503) if missing. |
| `DEFAULT_COMPANY_ID` | Optional | Medium | Fallback tenant UUID for unmapped incoming webhooks. Rejects all-zero UUIDs or placeholders. |
| `DEFAULT_LEAD_ASSIGNEE_ID` | Optional | Medium | Fallback salesperson profile UUID for lead auto-assignment. |
| `LEAD_ALLOWED_ORIGINS` | Optional | Medium | Comma-separated origins allowed for CORS in website lead capture. |

### C. Cloudflare KV Bindings
Configured in Cloudflare Dashboard under **Settings > Functions > KV namespace bindings**:

| Binding Name | Variable Name | Bound Namespace |
| :--- | :--- | :--- |
| `RATE_LIMIT` | `RATE_LIMIT` | `stockitease-ratelimit-prod` (Prod) / `stockitease-ratelimit-staging` (Staging) |

---

## 3. Configuration Security Guardrails (Fail-Closed Enforcement)

1. **Placeholder Rejection (SEC- / Task 6)**:
   Any request hitting `/functions/api/*` checks configured environment variables against known placeholders:
   - Strings starting with `your_` or `your-` or containing `your-project`
   - All-zero UUIDs (`00000000-0000-0000-0000-000000000000`)
   - Values containing `example.com`
   - Bracketed tokens (`<...>`, `[...]`) or default strings (`placeholder`, `changeme`, `todo`)

   **Action on detection**: Immediately terminates execution and returns HTTP 503 with a generic message (`{"error": "Service temporarily unavailable"}`). The exact offending variable and reason are logged to server logs (`console.error`), never leaked to the client.

2. **Dynamic Build-Time CSP (`_headers`)**:
   `public/_headers` contains no hardcoded project URLs. During `npm run build`, the custom Vite plugin reads `VITE_SUPABASE_URL`, computes the HTTPS and WSS origins, and generates `dist/_headers`. If `VITE_SUPABASE_URL` is missing or a placeholder, the build immediately aborts with exit code 1.

---

## 4. Setting Up a New Environment

1. **Provision Supabase**:
   - Create a fresh Supabase project.
   - Run `supabase/migrations/20261101000000_baseline.sql` in SQL Editor.
   - Run `supabase/02_first_admin.sql` with the real owner UID from Authentication.
2. **Configure Cloudflare Pages**:
   - Link git repository to Cloudflare Pages.
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build environment variables.
   - Add server environment variables (`SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_APP_SECRET`, etc.).
   - Bind `RATE_LIMIT` KV namespace.
3. **Verify Deployment**:
   - Run `npm run verify:baseline` and `npm run test:all`.
