/**
 * Dashboard router - combines all dashboard routes
 */

import { Hono } from 'hono'
import type { Env, DailyStats, HealthCheck } from '../types'
import {
  isAuthenticated,
  hashAdminKey,
  setSessionCookie,
  clearSessionCookie,
} from './auth'
import { loginPage } from './pages/login'
import { overviewPage } from './pages/overview'
import { appDetailPage, type AppDetailData } from './pages/app-detail'
import { getOverview } from './api/overview'
import { getAppList, getAppName, getHealthUrls } from './helpers'

const dashboard = new Hono<{ Bindings: Env }>()

// Main dashboard entry - shows overview or login
dashboard.get('/', async (c) => {
  if (!await isAuthenticated(c)) {
    return c.html(loginPage())
  }

  const apps = await getAppList(c)
  const overviewData = await getOverview(c)
  return c.html(overviewPage(overviewData, apps))
})

// App detail page
dashboard.get('/app/:app_id', async (c) => {
  if (!await isAuthenticated(c)) {
    return c.html(loginPage())
  }

  const appId = c.req.param('app_id')
  const apps = await getAppList(c)

  // Check if app exists
  if (!apps.includes(appId)) {
    return c.redirect('/dashboard')
  }

  // Get app data
  const id = c.env.APP_LOGS_DO.idFromName(appId)
  const stub = c.env.APP_LOGS_DO.get(id)

  const [statsRes, healthRes, appName, healthUrls] = await Promise.all([
    stub.fetch(new Request('http://do/stats?days=7')),
    stub.fetch(new Request('http://do/health?limit=50')),
    getAppName(c, appId),
    getHealthUrls(c, appId),
  ])

  const statsData = await statsRes.json() as { ok: boolean; data: DailyStats[] }
  const healthData = await healthRes.json() as { ok: boolean; data: HealthCheck[] }

  const data: AppDetailData = {
    appId,
    appName,
    stats: statsData.ok ? (statsData.data || []) : [],
    healthChecks: healthData.ok ? (healthData.data || []) : [],
    healthUrls,
  }

  return c.html(appDetailPage(data, apps))
})

// Login handler
dashboard.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const adminKey = body.admin_key as string

  if (!adminKey || adminKey !== c.env.ADMIN_API_KEY) {
    return c.html(loginPage('Invalid admin key'))
  }

  const sessionHash = await hashAdminKey(adminKey)
  setSessionCookie(c, sessionHash)
  return c.redirect('/dashboard')
})

// Logout handler
dashboard.get('/logout', (c) => {
  clearSessionCookie(c)
  return c.redirect('/dashboard')
})

// API: Get overview data
dashboard.get('/api/overview', async (c) => {
  if (!await isAuthenticated(c)) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const data = await getOverview(c)
  return c.json({ ok: true, data })
})

// API: List apps
dashboard.get('/api/apps', async (c) => {
  if (!await isAuthenticated(c)) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const apps = await getAppList(c)
  return c.json({ ok: true, data: apps })
})

// API: Get logs for an app
dashboard.get('/api/logs/:app_id', async (c) => {
  if (!await isAuthenticated(c)) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const appId = c.req.param('app_id')
  const url = new URL(c.req.url)

  const id = c.env.APP_LOGS_DO.idFromName(appId)
  const stub = c.env.APP_LOGS_DO.get(id)

  const res = await stub.fetch(new Request(`http://do/logs${url.search}`, {
    method: 'GET',
  }))

  return c.json(await res.json())
})

// API: Get stats for an app
dashboard.get('/api/stats/:app_id', async (c) => {
  if (!await isAuthenticated(c)) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const appId = c.req.param('app_id')
  const days = c.req.query('days') || '7'

  const id = c.env.APP_LOGS_DO.idFromName(appId)
  const stub = c.env.APP_LOGS_DO.get(id)

  const res = await stub.fetch(new Request(`http://do/stats?days=${days}`, {
    method: 'GET',
  }))

  return c.json(await res.json())
})

// API: Get health checks for an app
dashboard.get('/api/health/:app_id', async (c) => {
  if (!await isAuthenticated(c)) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const appId = c.req.param('app_id')
  const url = new URL(c.req.url)

  const id = c.env.APP_LOGS_DO.idFromName(appId)
  const stub = c.env.APP_LOGS_DO.get(id)

  const res = await stub.fetch(new Request(`http://do/health${url.search}`, {
    method: 'GET',
  }))

  return c.json(await res.json())
})

export { dashboard }
