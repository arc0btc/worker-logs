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
| `src/dashboard.ts` | Web dashboard UI for browsing logs |
| `src/durable-objects/app-logs-do.ts` | Durable Object with SQLite for logs + stats |
| `src/services/registry.ts` | App registration, API key management |
| `src/services/stats.ts` | KV-based daily stats aggregation (legacy) |
| `src/middleware/auth.ts` | API key + admin key authentication |
| `src/result.ts` | Ok/Err result type utilities |
| `src/types.ts` | TypeScript type definitions |

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
| `DELETE /apps/:id` | API Key (matching app) OR Admin Key |
| `GET /apps` | Admin Key |
| `POST /apps` | Admin Key |
| `GET /apps/:id`, `GET /stats/:id` | API Key (own app) OR Admin Key |
| `GET /health/:id` | Public (for monitoring) |
| `GET /` | Public (service info) |

### Headers

- **Admin Key**: `X-Admin-Key` header
- **API Key**: `X-Api-Key` + `X-App-ID` headers

### Dashboard

The web dashboard (`/dashboard`) uses cookie-based session auth with the admin key.

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
timestamp TEXT NOT NULL,
level TEXT NOT NULL,  -- DEBUG | INFO | WARN | ERROR
message TEXT NOT NULL,
context TEXT,         -- JSON
request_id TEXT
```

### daily_stats table (per-DO SQLite)
```sql
date TEXT PRIMARY KEY,  -- YYYY-MM-DD
debug INTEGER DEFAULT 0,
info INTEGER DEFAULT 0,
warn INTEGER DEFAULT 0,
error INTEGER DEFAULT 0
```

### health_checks table (per-DO SQLite)
```sql
id TEXT PRIMARY KEY,
url TEXT NOT NULL,
status INTEGER,       -- HTTP status code (0 = failed)
latency_ms INTEGER,
checked_at TEXT NOT NULL
```

### config table (per-DO SQLite)
```sql
key TEXT PRIMARY KEY,
value TEXT NOT NULL   -- JSON (e.g., health_urls array)
```

### KV Registry
- Key: `app:{app_id}` -> `{ name, api_key_hash, created_at, updated_at }`
- Key: `apps` -> `string[]` (list of app IDs)
