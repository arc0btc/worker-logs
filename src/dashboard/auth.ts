/**
 * Dashboard authentication utilities
 */

import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'
import type { Env } from '../types'

export const SESSION_COOKIE = 'wl_session'

/**
 * Check if request has valid admin session
 */
export async function isAuthenticated(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const session = getCookie(c, SESSION_COOKIE)
  if (!session || !c.env.ADMIN_API_KEY) return false

  const expectedHash = await hashAdminKey(c.env.ADMIN_API_KEY)
  return session === expectedHash
}

/**
 * Create session token from admin key
 */
export async function hashAdminKey(adminKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(adminKey)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Set session cookie after successful login
 */
export function setSessionCookie(c: Context, sessionHash: string) {
  setCookie(c, SESSION_COOKIE, sessionHash, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 60 * 60 * 24 // 24 hours
  })
}

/**
 * Clear session cookie on logout
 */
export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE)
}
