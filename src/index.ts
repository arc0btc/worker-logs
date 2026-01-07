import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Ok, Err, ErrorCode } from './result'
import type { Env, LogInput, LogBatchInput } from './types'
import * as registry from './services/registry'
import * as stats from './services/stats'

// Re-export AppLogsDO for wrangler to find
export { AppLogsDO } from './durable-objects/app-logs-do'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

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
      version: '0.3.0',
      description: 'Centralized logging service for Cloudflare Workers',
      endpoints: {
        'POST /logs': 'Write log entries (requires X-App-ID header)',
        'GET /logs': 'Query log entries (requires X-App-ID header)',
        'GET /health/:app_id': 'Get health check history',
        'GET /stats/:app_id': 'Get daily stats (last 7 days)',
        'POST /apps/:app_id/prune': 'Delete old logs',
        'POST /apps/:app_id/health-urls': 'Set health check URLs',
        'GET /apps': 'List registered apps',
        'POST /apps': 'Register a new app',
        'GET /apps/:app_id': 'Get app details',
        'DELETE /apps/:app_id': 'Delete an app',
      },
    })
  )
})

// POST /logs - Write log(s)
app.post('/logs', async (c) => {
  const appId = c.req.header('X-App-ID')
  if (!appId) {
    return c.json(Err({ code: ErrorCode.BAD_REQUEST, message: 'X-App-ID header required' }), 400)
  }

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

    // Record stats for batch
    if (result.ok && c.env.LOGS_KV) {
      const counts = body.logs.reduce((acc, log) => {
        const existing = acc.find((c) => c.level === log.level)
        if (existing) {
          existing.count++
        } else {
          acc.push({ level: log.level, count: 1 })
        }
        return acc
      }, [] as { level: string; count: number }[])
      await stats.incrementStatsBatch(c.env.LOGS_KV, appId, counts as any)
    }

    return c.json(result)
  } else {
    const res = await stub.fetch(new Request('http://do/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    const result = await res.json() as { ok: boolean }

    // Record stats for single log
    if (result.ok && c.env.LOGS_KV) {
      await stats.incrementStats(c.env.LOGS_KV, appId, body.level)
    }

    return c.json(result)
  }
})

// GET /logs - Query logs
app.get('/logs', async (c) => {
  const appId = c.req.header('X-App-ID')
  if (!appId) {
    return c.json(Err({ code: ErrorCode.BAD_REQUEST, message: 'X-App-ID header required' }), 400)
  }

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

// GET /stats/:app_id - Get daily stats (last 7 days)
app.get('/stats/:app_id', async (c) => {
  const appId = c.req.param('app_id')
  const days = c.req.query('days') ? parseInt(c.req.query('days')!) : 7

  if (!c.env.LOGS_KV) {
    return c.json(Err({ code: ErrorCode.INTERNAL_ERROR, message: 'KV namespace not configured' }), 500)
  }

  const result = await stats.getStatsRange(c.env.LOGS_KV, appId, days)
  if (!result.ok) {
    return c.json(result, 500)
  }

  return c.json(Ok(result.data))
})

// POST /apps/:app_id/prune - Delete old logs
app.post('/apps/:app_id/prune', async (c) => {
  const appId = c.req.param('app_id')
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

// POST /apps/:app_id/health-urls - Set health check URLs
app.post('/apps/:app_id/health-urls', async (c) => {
  const appId = c.req.param('app_id')
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

// GET /apps - List registered apps
app.get('/apps', async (c) => {
  if (!c.env.LOGS_KV) {
    return c.json(Err({ code: ErrorCode.INTERNAL_ERROR, message: 'KV namespace not configured' }), 500)
  }

  const result = await registry.listApps(c.env.LOGS_KV)
  if (!result.ok) {
    return c.json(result, 500)
  }

  return c.json(Ok(result.data))
})

// POST /apps - Register a new app
app.post('/apps', async (c) => {
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

// GET /apps/:app_id - Get app details
app.get('/apps/:app_id', async (c) => {
  const appId = c.req.param('app_id')

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

  return c.json(Ok(result.data))
})

// DELETE /apps/:app_id - Delete an app
app.delete('/apps/:app_id', async (c) => {
  const appId = c.req.param('app_id')

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
