/**
 * Dashboard-specific type definitions
 */

import type { DailyStats, LogEntry, HealthCheck } from '../types'

/**
 * App summary for the overview page
 */
export interface AppSummary {
  id: string
  name: string
  today_stats: DailyStats
  yesterday_stats: DailyStats
  error_trend: 'up' | 'down' | 'stable'
  health_status: 'healthy' | 'degraded' | 'down' | 'unknown'
  last_error?: {
    message: string
    timestamp: string
  }
}

/**
 * Overview response for the dashboard
 */
export interface OverviewResponse {
  apps: AppSummary[]
  totals: {
    today: { debug: number; info: number; warn: number; error: number }
    yesterday: { debug: number; info: number; warn: number; error: number }
  }
  recent_errors: Array<LogEntry & { app_id: string }>
}

/**
 * Saved filter configuration
 */
export interface SavedFilter {
  id: string
  name: string
  app_id?: string
  level?: string
  date_range?: {
    preset?: 'today' | '7d' | '30d' | 'custom'
    since?: string
    until?: string
  }
  context_filters?: Record<string, string>
  search?: string
  created_at: string
}

/**
 * Filter state for the app detail page
 */
export interface FilterState {
  level: string
  dateRange: 'today' | '7d' | '30d' | 'custom'
  since: string
  until: string
  requestId: string
  search: string
  contextFilters: Array<{ key: string; value: string }>
}

/**
 * Health status summary
 */
export interface HealthSummary {
  url: string
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
  last_check?: HealthCheck
  avg_latency_ms?: number
}
