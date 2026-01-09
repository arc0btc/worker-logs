/**
 * API Key Authentication Middleware
 */

import { createMiddleware } from 'hono/factory'
import { Err, ErrorCode } from '../result'
import * as registry from '../services/registry'
import type { Env } from '../types'

type Variables = {
  appId: string
}

/**
 * Middleware that requires X-App-ID and X-Api-Key headers.
 * Validates the API key against the registered app.
 */
export const requireApiKey = createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
  const appId = c.req.header('X-App-ID')
  const apiKey = c.req.header('X-Api-Key')

  if (!appId) {
    return c.json(Err({ code: ErrorCode.BAD_REQUEST, message: 'X-App-ID header required' }), 400)
  }

  if (!apiKey) {
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'X-Api-Key header required' }), 401)
  }

  if (!c.env.LOGS_KV) {
    return c.json(Err({ code: ErrorCode.INTERNAL_ERROR, message: 'KV namespace not configured' }), 500)
  }

  // Look up the app and validate API key
  const appResult = await registry.getApp(c.env.LOGS_KV, appId)
  if (!appResult.ok) {
    return c.json(appResult, 500)
  }

  if (!appResult.data) {
    return c.json(Err({ code: ErrorCode.NOT_FOUND, message: `App '${appId}' not found` }), 404)
  }

  if (appResult.data.api_key !== apiKey) {
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'Invalid API key' }), 401)
  }

  // Store validated app ID in context for downstream handlers
  c.set('appId', appId)

  await next()
})

/**
 * Middleware that requires X-App-ID header only (no API key validation).
 * Used for read-only endpoints where we just need to identify the app.
 */
export const requireAppId = createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
  const appId = c.req.header('X-App-ID')

  if (!appId) {
    return c.json(Err({ code: ErrorCode.BAD_REQUEST, message: 'X-App-ID header required' }), 400)
  }

  c.set('appId', appId)

  await next()
})

/**
 * Middleware that requires X-Admin-Key header for admin operations.
 * Used to protect app registration and other administrative endpoints.
 */
export const requireAdminKey = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const adminKey = c.req.header('X-Admin-Key')

  if (!c.env.ADMIN_API_KEY) {
    return c.json(Err({ code: ErrorCode.SERVICE_UNAVAILABLE, message: 'Admin authentication not configured' }), 503)
  }

  if (!adminKey) {
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'X-Admin-Key header required' }), 401)
  }

  if (adminKey !== c.env.ADMIN_API_KEY) {
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'Invalid admin key' }), 401)
  }

  await next()
})

/**
 * Middleware that accepts either admin key OR API key authentication.
 * Admin key grants access to any resource.
 * API key grants access only to the authenticated app's resources.
 * Sets appId in context if API key auth is used (null for admin auth).
 */
export const requireApiKeyOrAdmin = createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
  const adminKey = c.req.header('X-Admin-Key')
  const apiKey = c.req.header('X-Api-Key')
  const appId = c.req.header('X-App-ID')

  // Try admin auth first
  if (adminKey) {
    if (!c.env.ADMIN_API_KEY) {
      return c.json(Err({ code: ErrorCode.SERVICE_UNAVAILABLE, message: 'Admin authentication not configured' }), 503)
    }
    if (adminKey === c.env.ADMIN_API_KEY) {
      // Admin auth successful - no appId restriction
      await next()
      return
    }
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'Invalid admin key' }), 401)
  }

  // Fall back to API key auth
  if (!appId) {
    return c.json(Err({ code: ErrorCode.BAD_REQUEST, message: 'X-App-ID header required (or use X-Admin-Key)' }), 400)
  }

  if (!apiKey) {
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'X-Api-Key header required (or use X-Admin-Key)' }), 401)
  }

  if (!c.env.LOGS_KV) {
    return c.json(Err({ code: ErrorCode.INTERNAL_ERROR, message: 'KV namespace not configured' }), 500)
  }

  // Look up the app and validate API key
  const appResult = await registry.getApp(c.env.LOGS_KV, appId)
  if (!appResult.ok) {
    return c.json(appResult, 500)
  }

  if (!appResult.data) {
    return c.json(Err({ code: ErrorCode.NOT_FOUND, message: `App '${appId}' not found` }), 404)
  }

  if (appResult.data.api_key !== apiKey) {
    return c.json(Err({ code: ErrorCode.UNAUTHORIZED, message: 'Invalid API key' }), 401)
  }

  // Store validated app ID in context for downstream handlers
  c.set('appId', appId)

  await next()
})
