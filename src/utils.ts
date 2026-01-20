/**
 * Shared utility functions
 */

import type { Env } from './types'

/**
 * Get a Durable Object stub for the given app_id
 */
export function getAppDO(env: Env, appId: string) {
  const id = env.APP_LOGS_DO.idFromName(appId)
  return env.APP_LOGS_DO.get(id)
}

/**
 * Count log entries by level using an efficient Map-based approach
 */
export function countByLevel(logs: { level: string }[]): { level: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const log of logs) {
    counts.set(log.level, (counts.get(log.level) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([level, count]) => ({ level, count }))
}
