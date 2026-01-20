/**
 * Dashboard-specific type definitions
 */

import type { DailyStats, LogEntry } from '../types'

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
