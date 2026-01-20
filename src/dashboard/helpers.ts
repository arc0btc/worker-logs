/**
 * Shared helper functions for dashboard routes
 */

import type { Context } from 'hono'
import type { Env } from '../types'

type DashboardContext = Context<{ Bindings: Env }>

/**
 * Get list of registered app IDs from KV
 */
export async function getAppList(c: DashboardContext): Promise<string[]> {
  if (!c.env.LOGS_KV) return []
  const data = await c.env.LOGS_KV.get('apps')
  if (!data) return []
  return JSON.parse(data)
}

/**
 * Get app name from KV config
 */
export async function getAppName(c: DashboardContext, appId: string): Promise<string> {
  if (!c.env.LOGS_KV) return appId
  const data = await c.env.LOGS_KV.get(`app:${appId}`)
  if (!data) return appId
  const config = JSON.parse(data)
  return config.name || appId
}

/**
 * Get health URLs from KV config
 */
export async function getHealthUrls(c: DashboardContext, appId: string): Promise<string[]> {
  if (!c.env.LOGS_KV) return []
  const data = await c.env.LOGS_KV.get(`app:${appId}`)
  if (!data) return []
  const config = JSON.parse(data)
  return config.health_urls || []
}
