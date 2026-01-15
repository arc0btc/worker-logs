import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Ok, Err, ErrorCode } from './result'
import type { Env, LogInput, LogBatchInput } from './types'
import * as registry from './services/registry'
import { requireApiKey, requireAdminKey, requireApiKeyOrAdmin } from './middleware/auth'
import { dashboard } from './dashboard/index'

// Re-export AppLogsDO for wrangler to find
export { AppLogsDO } from './durable-objects/app-logs-do'

// Re-export RPC entrypoint for service bindings
export { LogsRPC } from './rpc'

// Re-export types for consumers
export type { LogInput, LogEntry, LogLevel, QueryFilters, DailyStats } from './types'

type Variables = {
  appId: string
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use('*', cors())

// Mount dashboard routes
app.route('/dashboard', dashboard)

/**
 * Get a DO stub for the given app_id
 */
function getAppDO(env: Env, appId: string) {
  const id = env.APP_LOGS_DO.idFromName(appId)
  return env.APP_LOGS_DO.get(id)
}

// Service info
app.get('/', (c) => {
  return c.json(
    Ok({
      service: 'worker-logs',
      version: '0.4.0',
      description: 'Centralized logging service for Cloudflare Workers',
      endpoints: {
        'GET /dashboard': 'Web UI for browsing logs (requires admin key)',
        'POST /logs': 'Write log entries (requires API key)',
        'GET /logs': 'Query log entries (requires API key)',
        'GET /health/:app_id': 'Get health check history (public)',
        'GET /stats/:app_id': 'Get daily stats (requires API key or admin)',
        'POST /apps/:app_id/prune': 'Delete old logs (requires API key)',
        'POST /apps/:app_id/health-urls': 'Set health check URLs (requires API key)',
        'GET /apps': 'List registered apps (requires admin key)',
        'POST /apps': 'Register a new app (requires admin key)',
        'GET /apps/:app_id': 'Get app details (requires API key or admin)',
        'DELETE /apps/:app_id': 'Delete an app (requires API key or admin)',
      },
    })
  )
})

// POST /logs - Write log(s) (requires API key)
app.post('/logs', requireApiKey, async (c) => {
  const appId = c.get('appId')
  const body = await c.req.json<LogInput | LogBatchInput>()
  const stub = getAppDO(c.env, appId)

  // Check if batch or single
  if ('logs' in body) {
    const res = await stub.fetch(new Request('http://do/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    const result = await res.json() as { ok: boolean }

    // Record stats in DO (atomic, no race condition)
    if (result.ok) {
      const counts = body.logs.reduce((acc, log) => {
        const existing = acc.find((c) => c.level === log.level)
        if (existing) {
          existing.count++
        } else {
          acc.push({ level: log.level, count: 1 })
        }
        return acc
      }, [] as { level: string; count: number }[])
      await stub.fetch(new Request('http://do/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counts }),
      }))
    }

    return c.json(result)
  } else {
    const res = await stub.fetch(new Request('http://do/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    const result = await res.json() as { ok: boolean }

    // Record stats in DO (atomic, no race condition)
    if (result.ok) {
      await stub.fetch(new Request('http://do/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: body.level }),
      }))
    }

    return c.json(result)
  }
})

// GET /logs - Query logs (requires API key)
app.get('/logs', requireApiKey, async (c) => {
  const appId = c.get('appId')
  const stub = getAppDO(c.env, appId)
  const url = new URL(c.req.url)

  const res = await stub.fetch(new Request(`http://do/logs${url.search}`, {
    method: 'GET',
  }))
  return c.json(await res.json())
})

// GET /health/:app_id - Get health check history
app.get('/health/:app_id', async (c) => {
  const appId = c.req.param('app_id')
  const stub = getAppDO(c.env, appId)
  const url = new URL(c.req.url)

  const res = await stub.fetch(new Request(`http://do/health${url.search}`, {
    method: 'GET',
  }))
  return c.json(await res.json())
})

// GET /stats/:app_id - Get daily stats (requires API key or admin)
app.get('/stats/:app_id', requireApiKeyOrAdmin, async (c) => {
  const appId = c.req.param('app_id')
  const authenticatedAppId = c.get('appId')

  // If using API key auth, must match the requested app
  if (authenticatedAppId && appId !== authenticatedAppId) {
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'App ID mismatch' }), 403)
  }

  const days = c.req.query('days') ? parseInt(c.req.query('days')!) : 7
  const stub = getAppDO(c.env, appId)

  const res = await stub.fetch(new Request(`http://do/stats?days=${days}`, {
    method: 'GET',
  }))
  return c.json(await res.json())
})

// POST /apps/:app_id/prune - Delete old logs (requires API key)
app.post('/apps/:app_id/prune', requireApiKey, async (c) => {
  const appId = c.req.param('app_id')
  const authenticatedAppId = c.get('appId')

  if (appId !== authenticatedAppId) {
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'App ID mismatch' }), 403)
  }

  const body = await c.req.json<{ before: string }>()

  if (!body.before) {
    return c.json(Err({ code: ErrorCode.BAD_REQUEST, message: '"before" timestamp required' }), 400)
  }

  const stub = getAppDO(c.env, appId)
  const res = await stub.fetch(new Request('http://do/prune', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return c.json(await res.json())
})

// POST /apps/:app_id/health-urls - Set health check URLs (requires API key)
app.post('/apps/:app_id/health-urls', requireApiKey, async (c) => {
  const appId = c.req.param('app_id')
  const authenticatedAppId = c.get('appId')

  if (appId !== authenticatedAppId) {
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'App ID mismatch' }), 403)
  }

  const body = await c.req.json<{ urls: string[] }>()

  if (!body.urls || !Array.isArray(body.urls)) {
    return c.json(Err({ code: ErrorCode.BAD_REQUEST, message: '"urls" array required' }), 400)
  }

  const stub = getAppDO(c.env, appId)
  const res = await stub.fetch(new Request('http://do/health-urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return c.json(await res.json())
})

// GET /apps - List registered apps (admin only)
app.get('/apps', requireAdminKey, async (c) => {
  if (!c.env.LOGS_KV) {
    return c.json(Err({ code: ErrorCode.INTERNAL_ERROR, message: 'KV namespace not configured' }), 500)
  }

  const result = await registry.listApps(c.env.LOGS_KV)
  if (!result.ok) {
    return c.json(result, 500)
  }

  return c.json(Ok(result.data))
})

// POST /apps - Register a new app (requires admin key)
app.post('/apps', requireAdminKey, async (c) => {
  if (!c.env.LOGS_KV) {
    return c.json(Err({ code: ErrorCode.INTERNAL_ERROR, message: 'KV namespace not configured' }), 500)
  }

  const body = await c.req.json<{ app_id: string; name: string; health_urls?: string[] }>()

  if (!body.app_id || !body.name) {
    return c.json(Err({ code: ErrorCode.BAD_REQUEST, message: '"app_id" and "name" required' }), 400)
  }

  const result = await registry.registerApp(c.env.LOGS_KV, body.app_id, body.name, body.health_urls)
  if (!result.ok) {
    return c.json(result, 500)
  }

  return c.json(Ok(result.data), 201)
})

// GET /apps/:app_id - Get app details (requires API key or admin)
app.get('/apps/:app_id', requireApiKeyOrAdmin, async (c) => {
  const appId = c.req.param('app_id')
  const authenticatedAppId = c.get('appId')

  // If using API key auth, must match the requested app
  if (authenticatedAppId && appId !== authenticatedAppId) {
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'App ID mismatch' }), 403)
  }

  if (!c.env.LOGS_KV) {
    return c.json(Err({ code: ErrorCode.INTERNAL_ERROR, message: 'KV namespace not configured' }), 500)
  }

  const result = await registry.getApp(c.env.LOGS_KV, appId)
  if (!result.ok) {
    return c.json(result, 500)
  }

  if (!result.data) {
    return c.json(Err({ code: ErrorCode.NOT_FOUND, message: `App '${appId}' not found` }), 404)
  }

  // Don't expose API key
  const { api_key: _, ...safeData } = result.data
  return c.json(Ok(safeData))
})

// DELETE /apps/:app_id - Delete an app (requires API key or admin)
app.delete('/apps/:app_id', requireApiKeyOrAdmin, async (c) => {
  const appId = c.req.param('app_id')
  const authenticatedAppId = c.get('appId')

  // If using API key auth, must match the requested app
  if (authenticatedAppId && appId !== authenticatedAppId) {
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'App ID mismatch' }), 403)
  }

  if (!c.env.LOGS_KV) {
    return c.json(Err({ code: ErrorCode.INTERNAL_ERROR, message: 'KV namespace not configured' }), 500)
  }

  const result = await registry.deleteApp(c.env.LOGS_KV, appId)
  if (!result.ok) {
    return c.json(result, 500)
  }

  return c.json(Ok(result.data))
})

// Export the Hono app as the default fetch handler
export default app
