# worker-logs

Centralized logging service for Cloudflare Workers using SQLite-backed Durable Objects.

## Architecture

- **Hono.js** - HTTP routing framework
- **Durable Objects (DO)** - Per-app isolated SQLite storage for logs and stats
- **KV Namespace** - App registry (app_id -> metadata + hashed API key)
- **RPC Entrypoint** - `LogsRPC` for service bindings between workers

## Key Files

| Path | Purpose |
|------|---------|
| `src/index.ts` | HTTP API routes, main worker entry |
| `src/rpc.ts` | `LogsRPC` WorkerEntrypoint for service bindings |
| `src/durable-objects/app-logs-do.ts` | Durable Object with SQLite for logs + stats |
| `src/services/registry.ts` | App registration, API key management |
| `src/middleware/auth.ts` | API key + admin key authentication |
| `src/utils/result.ts` | Ok/Err result type utilities |

## Testing

```bash
npm test           # Run vitest with Cloudflare pool
npm run test:watch # Watch mode
```

Tests use `@cloudflare/vitest-pool-workers` with `isolatedStorage: false` (required for SQLite DOs).

## Authentication

### API Endpoints

| Endpoint | Auth Required |
|----------|---------------|
| `POST /logs`, `GET /logs` | API Key |
| `POST /apps/:id/prune`, `POST /apps/:id/health-urls` | API Key (matching app) |
| `DELETE /apps/:id` | API Key (matching app) |
| `GET /apps` | Admin Key |
| `POST /apps` | Admin Key |
| `GET /apps/:id`, `GET /stats/:id` | API Key (own app) OR Admin Key |
| `GET /health/:id` | Public (for monitoring) |
| `GET /` | Public (service info) |

### Headers

- **Admin Key**: `X-Admin-Key` header
- **API Key**: `X-Api-Key` + `X-App-ID` headers

### Dashboard

The web dashboard (`/dashboard`) uses cookie-based session auth with the admin key. For production, consider adding Cloudflare Access for zero-trust protection.

### Cloudflare Access Setup (Optional)

To add identity-based access to the dashboard:

1. Go to Cloudflare Dashboard > Zero Trust > Access > Applications
2. Click "Add an application" > Self-hosted
3. Configure:
   - Application name: `worker-logs-dashboard`
   - Session duration: 24 hours
   - Application domain: `logs.wbd.host`
   - Path: `/dashboard*`
4. Add a policy:
   - Policy name: `Admin Access`
   - Action: Allow
   - Include: Email (your email) or Identity Provider group
5. Save and deploy

This adds SSO/MFA before requests reach the worker, without code changes.

## Development Commands

```bash
npm run dev        # Local dev server
npm run cf-typegen # Generate types from wrangler.jsonc
npm run deploy     # Deploy to Cloudflare (prefer CI/CD)
```

## Secrets

Set via `wrangler secret put`:
- `ADMIN_API_KEY` - Admin authentication for app registration

## Data Model

### logs table (per-DO SQLite)
```sql
id TEXT PRIMARY KEY,
level TEXT,      -- DEBUG | INFO | WARN | ERROR
message TEXT,
context TEXT,    -- JSON
request_id TEXT,
timestamp TEXT
```

### daily_stats table (per-DO SQLite)
```sql
date TEXT PRIMARY KEY,  -- YYYY-MM-DD
debug INTEGER DEFAULT 0,
info INTEGER DEFAULT 0,
warn INTEGER DEFAULT 0,
error INTEGER DEFAULT 0
```

### KV Registry
- Key: `app:{app_id}` -> `{ name, api_key_hash, created_at, updated_at }`
- Key: `apps:index` -> `string[]` (list of app IDs)
