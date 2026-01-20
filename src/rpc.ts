/**
 * RPC Entrypoint for Service Bindings
 *
 * Provides type-safe RPC methods for same-account workers.
 * No auth required - service binding = trusted caller.
 */

import { WorkerEntrypoint } from 'cloudflare:workers'
import type { Env, LogInput, LogEntry, QueryFilters, DailyStats } from './types'
import { getAppDO, countByLevel } from './utils'

/**
 * RPC interface for worker-logs service binding.
 *
 * Usage in other workers:
 * ```ts
 * // wrangler.jsonc: "services": [{ "binding": "LOGS", "service": "worker-logs" }]
 * await env.LOGS.log('my-app', { level: 'INFO', message: 'Hello' })
 * ```
 */
export class LogsRPC extends WorkerEntrypoint<Env> {
  /**
   * Get a Durable Object stub for the given app
   */
  private getStub(appId: string) {
    return getAppDO(this.env, appId)
  }

  /**
   * Write a single log entry
   */
  async log(appId: string, entry: LogInput): Promise<LogEntry> {
    const stub = this.getStub(appId)

    const res = await stub.fetch(new Request('http://do/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }))

    const result = await res.json() as { ok: boolean; data: LogEntry }

    // Record stats in DO (atomic, no race condition)
    if (result.ok) {
      await stub.fetch(new Request('http://do/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: entry.level }),
      }))
    }

    return result.data
  }

  /**
   * Write multiple log entries in a batch
   */
  async logBatch(appId: string, entries: LogInput[]): Promise<{ count: number }> {
    const stub = this.getStub(appId)

    const res = await stub.fetch(new Request('http://do/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: entries }),
    }))

    const result = await res.json() as { ok: boolean; data: { count: number } }

    // Record stats in DO (atomic, no race condition)
    if (result.ok) {
      const counts = countByLevel(entries)
      await stub.fetch(new Request('http://do/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counts }),
      }))
    }

    return result.data
  }

  /**
   * Query logs with optional filters
   */
  async query(appId: string, filters?: QueryFilters): Promise<LogEntry[]> {
    const stub = this.getStub(appId)

    const params = new URLSearchParams()
    if (filters?.level) params.set('level', filters.level)
    if (filters?.since) params.set('since', filters.since)
    if (filters?.until) params.set('until', filters.until)
    if (filters?.request_id) params.set('request_id', filters.request_id)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const search = params.toString() ? `?${params.toString()}` : ''
    const res = await stub.fetch(new Request(`http://do/logs${search}`, {
      method: 'GET',
    }))

    const result = await res.json() as { ok: boolean; data: LogEntry[] }
    return result.data
  }

  /**
   * Get daily stats for an app
   */
  async getStats(appId: string, days: number = 7): Promise<DailyStats[]> {
    const stub = this.getStub(appId)

    const res = await stub.fetch(new Request(`http://do/stats?days=${days}`, {
      method: 'GET',
    }))

    const result = await res.json() as { ok: boolean; data: DailyStats[] }
    return result.ok ? result.data : []
  }

  /**
   * Convenience method: log an info message
   */
  async info(appId: string, message: string, context?: Record<string, unknown>): Promise<LogEntry> {
    return this.log(appId, { level: 'INFO', message, context })
  }

  /**
   * Convenience method: log a warning
   */
  async warn(appId: string, message: string, context?: Record<string, unknown>): Promise<LogEntry> {
    return this.log(appId, { level: 'WARN', message, context })
  }

  /**
   * Convenience method: log an error
   */
  async error(appId: string, message: string, context?: Record<string, unknown>): Promise<LogEntry> {
    return this.log(appId, { level: 'ERROR', message, context })
  }

  /**
   * Convenience method: log a debug message
   */
  async debug(appId: string, message: string, context?: Record<string, unknown>): Promise<LogEntry> {
    return this.log(appId, { level: 'DEBUG', message, context })
  }
}
