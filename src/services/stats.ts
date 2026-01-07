/**
 * Stats Service - manages daily log aggregations in KV
 */

import { Ok, Err, type Result, ErrorCode } from '../result'
import type { DailyStats, LogLevel } from '../types'

const STATS_PREFIX = 'stats:'

/**
 * Get the date string for today (or a specific date)
 */
function getDateKey(date?: Date): string {
  const d = date ?? new Date()
  return d.toISOString().split('T')[0] // YYYY-MM-DD
}

/**
 * Get the KV key for stats
 */
function getStatsKey(appId: string, date: string): string {
  return `${STATS_PREFIX}${appId}:${date}`
}

/**
 * Get stats for a specific app and date
 */
export async function getStats(
  kv: KVNamespace,
  appId: string,
  date?: string
): Promise<Result<DailyStats>> {
  try {
    const dateKey = date ?? getDateKey()
    const key = getStatsKey(appId, dateKey)
    const data = await kv.get(key)

    if (!data) {
      // Return empty stats for the date
      return Ok({
        date: dateKey,
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
      })
    }

    return Ok(JSON.parse(data) as DailyStats)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Err({ code: ErrorCode.INTERNAL_ERROR, message })
  }
}

/**
 * Get stats for multiple days
 */
export async function getStatsRange(
  kv: KVNamespace,
  appId: string,
  days: number = 7
): Promise<Result<DailyStats[]>> {
  try {
    const stats: DailyStats[] = []
    const today = new Date()

    for (let i = 0; i < days; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateKey = getDateKey(date)

      const result = await getStats(kv, appId, dateKey)
      if (result.ok) {
        stats.push(result.data)
      }
    }

    return Ok(stats)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Err({ code: ErrorCode.INTERNAL_ERROR, message })
  }
}

/**
 * Increment stats for a log level
 */
export async function incrementStats(
  kv: KVNamespace,
  appId: string,
  level: LogLevel,
  count: number = 1
): Promise<Result<DailyStats>> {
  try {
    const dateKey = getDateKey()
    const key = getStatsKey(appId, dateKey)

    // Get current stats
    const data = await kv.get(key)
    let stats: DailyStats

    if (data) {
      stats = JSON.parse(data) as DailyStats
    } else {
      stats = {
        date: dateKey,
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
      }
    }

    // Increment the appropriate counter
    switch (level) {
      case 'DEBUG':
        stats.debug += count
        break
      case 'INFO':
        stats.info += count
        break
      case 'WARN':
        stats.warn += count
        break
      case 'ERROR':
        stats.error += count
        break
    }

    // Save updated stats with 30-day TTL
    await kv.put(key, JSON.stringify(stats), {
      expirationTtl: 30 * 24 * 60 * 60, // 30 days
    })

    return Ok(stats)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Err({ code: ErrorCode.INTERNAL_ERROR, message })
  }
}

/**
 * Increment stats for multiple log levels (batch)
 */
export async function incrementStatsBatch(
  kv: KVNamespace,
  appId: string,
  counts: { level: LogLevel; count: number }[]
): Promise<Result<DailyStats>> {
  try {
    const dateKey = getDateKey()
    const key = getStatsKey(appId, dateKey)

    // Get current stats
    const data = await kv.get(key)
    let stats: DailyStats

    if (data) {
      stats = JSON.parse(data) as DailyStats
    } else {
      stats = {
        date: dateKey,
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
      }
    }

    // Increment all counters
    for (const { level, count } of counts) {
      switch (level) {
        case 'DEBUG':
          stats.debug += count
          break
        case 'INFO':
          stats.info += count
          break
        case 'WARN':
          stats.warn += count
          break
        case 'ERROR':
          stats.error += count
          break
      }
    }

    // Save updated stats with 30-day TTL
    await kv.put(key, JSON.stringify(stats), {
      expirationTtl: 30 * 24 * 60 * 60, // 30 days
    })

    return Ok(stats)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Err({ code: ErrorCode.INTERNAL_ERROR, message })
  }
}

/**
 * Get total stats across all time (sum of all days)
 */
export async function getTotalStats(
  kv: KVNamespace,
  appId: string,
  days: number = 30
): Promise<Result<{ total: number; by_level: Record<string, number> }>> {
  try {
    const rangeResult = await getStatsRange(kv, appId, days)
    if (!rangeResult.ok) {
      return rangeResult
    }

    const totals = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    }

    for (const day of rangeResult.data) {
      totals.debug += day.debug
      totals.info += day.info
      totals.warn += day.warn
      totals.error += day.error
    }

    return Ok({
      total: totals.debug + totals.info + totals.warn + totals.error,
      by_level: totals,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Err({ code: ErrorCode.INTERNAL_ERROR, message })
  }
}
