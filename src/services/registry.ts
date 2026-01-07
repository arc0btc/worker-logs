/**
 * App Registry Service - manages app registrations in KV
 */

import { Ok, Err, type Result, ErrorCode } from '../result'
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
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Err({ code: ErrorCode.INTERNAL_ERROR, message })
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
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Err({ code: ErrorCode.INTERNAL_ERROR, message })
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
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Err({ code: ErrorCode.INTERNAL_ERROR, message })
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
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Err({ code: ErrorCode.INTERNAL_ERROR, message })
  }
}

/**
 * Validate an API key and return the associated app ID
 */
export async function validateApiKey(
  kv: KVNamespace,
  apiKey: string
): Promise<Result<string | null>> {
  try {
    // List all apps and check their API keys
    const appsResult = await listApps(kv)
    if (!appsResult.ok) {
      return appsResult
    }

    for (const appId of appsResult.data) {
      const appResult = await getApp(kv, appId)
      if (appResult.ok && appResult.data?.api_key === apiKey) {
        return Ok(appId)
      }
    }

    return Ok(null)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Err({ code: ErrorCode.INTERNAL_ERROR, message })
  }
}

/**
 * Regenerate API key for an app
 */
export async function regenerateApiKey(
  kv: KVNamespace,
  appId: string
): Promise<Result<{ api_key: string }>> {
  try {
    const appResult = await getApp(kv, appId)
    if (!appResult.ok) {
      return appResult
    }
    if (!appResult.data) {
      return Err({ code: ErrorCode.NOT_FOUND, message: `App '${appId}' not found` })
    }

    const newKey = generateApiKey()
    const config: AppConfig = {
      ...appResult.data,
      api_key: newKey,
    }

    await kv.put(`${APP_PREFIX}${appId}`, JSON.stringify(config))

    return Ok({ api_key: newKey })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Err({ code: ErrorCode.INTERNAL_ERROR, message })
  }
}
