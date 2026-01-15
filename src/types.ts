/**
 * Core type definitions for worker-logs
 */

/**
 * Environment bindings
 * Note: APP_LOGS_DO generic type comes from worker-configuration.d.ts
 */
export interface Env {
  APP_LOGS_DO: DurableObjectNamespace
  LOGS_KV: KVNamespace
  ADMIN_API_KEY?: string
}

/**
 * Log levels in order of increasing severity
 */
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel]

/**
 * A single log entry
 */
export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  request_id?: string
}

/**
 * Input for creating a log entry (id and timestamp generated server-side)
 */
export interface LogInput {
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  request_id?: string
}

/**
 * Batch log input
 */
export interface LogBatchInput {
  logs: LogInput[]
}

/**
 * Query filters for retrieving logs
 */
export interface QueryFilters {
  level?: LogLevel
  since?: string // ISO timestamp
  until?: string // ISO timestamp
  request_id?: string
  search?: string // Full-text search in message
  context?: Record<string, string> // Filter by context fields (e.g., path, status)
  limit?: number
  offset?: number
}

/**
 * Health check record
 */
export interface HealthCheck {
  id: string
  url: string
  status: number
  latency_ms: number
  checked_at: string
}

/**
 * App configuration stored in KV
 */
export interface AppConfig {
  name: string
  health_urls: string[]
  created_at: string
  api_key: string
}

/**
 * Daily stats stored in KV
 */
export interface DailyStats {
  date: string
  debug: number
  info: number
  warn: number
  error: number
}

/**
 * Prune request
 */
export interface PruneRequest {
  before: string // ISO timestamp
}

/**
 * Prune result
 */
export interface PruneResult {
  deleted: number
}
