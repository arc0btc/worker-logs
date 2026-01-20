/**
 * App Registry Service - manages app registrations in KV
 */

import { Ok, type Result, wrapError } from '../result'
import type { AppConfig } from '../types'

const APPS_KEY = 'apps'
const APP_PREFIX = 'app:'

/**
 * Generate a random API key
 */
function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * List all registered app IDs
 */
export async function listApps(kv: KVNamespace): Promise<Result<string[]>> {
  try {
    const data = await kv.get(APPS_KEY)
    if (!data) {
      return Ok([])
    }
    return Ok(JSON.parse(data) as string[])
  } catch (e) {
    return wrapError(e)
  }
}

/**
 * Get app configuration by ID
 */
export async function getApp(
  kv: KVNamespace,
  appId: string
): Promise<Result<AppConfig | null>> {
  try {
    const data = await kv.get(`${APP_PREFIX}${appId}`)
    if (!data) {
      return Ok(null)
    }
    return Ok(JSON.parse(data) as AppConfig)
  } catch (e) {
    return wrapError(e)
  }
}

/**
 * Register a new app (or update existing)
 */
export async function registerApp(
  kv: KVNamespace,
  appId: string,
  name: string,
  healthUrls: string[] = []
): Promise<Result<AppConfig>> {
  try {
    // Check if app already exists
    const existing = await kv.get(`${APP_PREFIX}${appId}`)

    let config: AppConfig
    if (existing) {
      // Update existing app
      const parsed = JSON.parse(existing) as AppConfig
      config = {
        ...parsed,
        name,
        health_urls: healthUrls,
      }
    } else {
      // Create new app with generated API key
      config = {
        name,
        health_urls: healthUrls,
        created_at: new Date().toISOString(),
        api_key: generateApiKey(),
      }

      // Add to apps list
      const appsResult = await listApps(kv)
      if (!appsResult.ok) {
        return appsResult
      }
      const apps = appsResult.data
      if (!apps.includes(appId)) {
        apps.push(appId)
        await kv.put(APPS_KEY, JSON.stringify(apps))
      }
    }

    // Save app config
    await kv.put(`${APP_PREFIX}${appId}`, JSON.stringify(config))

    return Ok(config)
  } catch (e) {
    return wrapError(e)
  }
}

/**
 * Delete an app registration
 */
export async function deleteApp(
  kv: KVNamespace,
  appId: string
): Promise<Result<{ deleted: boolean }>> {
  try {
    // Remove from apps list
    const appsResult = await listApps(kv)
    if (!appsResult.ok) {
      return appsResult
    }
    const apps = appsResult.data.filter((id) => id !== appId)
    await kv.put(APPS_KEY, JSON.stringify(apps))

    // Delete app config
    await kv.delete(`${APP_PREFIX}${appId}`)

    return Ok({ deleted: true })
  } catch (e) {
    return wrapError(e)
  }
}
