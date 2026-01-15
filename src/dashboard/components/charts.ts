/**
 * Chart utilities for the dashboard
 */

import { styles } from '../styles'

/**
 * Generate an SVG sparkline for trend visualization
 */
export function sparkline(
  data: number[],
  options: {
    width?: number
    height?: number
    color?: string
    showArea?: boolean
  } = {}
): string {
  const { width = 100, height = 30, color = 'currentColor', showArea = false } = options

  if (data.length < 2) {
    return `<svg viewBox="0 0 ${width} ${height}" class="inline-block w-full h-full">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="text-xs fill-gray-500">No data</text>
    </svg>`
  }

  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const padding = 2

  const points = data.map((v, i) => {
    const x = padding + ((i / (data.length - 1)) * (width - padding * 2))
    const y = padding + ((1 - (v - min) / range) * (height - padding * 2))
    return `${x},${y}`
  })

  const areaPath = showArea
    ? `<path d="M${padding},${height - padding} L${points.join(' L')} L${width - padding},${height - padding} Z" fill="${color}" fill-opacity="0.1"/>`
    : ''

  return `<svg viewBox="0 0 ${width} ${height}" class="inline-block w-full h-full" preserveAspectRatio="none">
    ${areaPath}
    <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`
}

/**
 * Calculate trend (up, down, stable) between two values
 */
export function calculateTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
  if (previous === 0) return current > 0 ? 'up' : 'stable'
  const change = ((current - previous) / previous) * 100
  if (change > 10) return 'up'
  if (change < -10) return 'down'
  return 'stable'
}

/**
 * Format a trend as percentage change with arrow
 */
export function formatTrend(current: number, previous: number): string {
  const trend = calculateTrend(current, previous)
  const color = styles.trendColors[trend]

  if (previous === 0) {
    if (current === 0) return '<span class="text-gray-500">-</span>'
    return `<span style="color: ${color}">+${current}</span>`
  }

  const change = ((current - previous) / previous) * 100
  const arrow = trend === 'up' ? '&uarr;' : trend === 'down' ? '&darr;' : ''
  const sign = change > 0 ? '+' : ''

  return `<span style="color: ${color}">${arrow} ${sign}${Math.round(change)}%</span>`
}

/**
 * Generate Chart.js configuration for daily stats
 */
export function dailyStatsChartConfig(
  labels: string[],
  datasets: { label: string; data: number[]; color: string }[]
): string {
  const config = {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map(ds => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color,
        backgroundColor: ds.color + '20',
        tension: 0.3,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#9CA3AF' },
        },
      },
      scales: {
        x: {
          grid: { color: '#374151' },
          ticks: { color: '#9CA3AF' },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#374151' },
          ticks: { color: '#9CA3AF' },
        },
      },
      interaction: {
        intersect: false,
        mode: 'index',
      },
    },
  }
  return JSON.stringify(config)
}

/**
 * Determine health status from recent checks
 */
export function determineHealthStatus(
  checks: { status: number; checked_at: string }[]
): 'healthy' | 'degraded' | 'down' | 'unknown' {
  if (checks.length === 0) return 'unknown'

  // Look at last 5 checks
  const recent = checks.slice(0, 5)
  const failed = recent.filter(c => c.status === 0 || c.status >= 500).length

  if (failed === 0) return 'healthy'
  if (failed < recent.length) return 'degraded'
  return 'down'
}

/**
 * Format health status with icon
 */
export function formatHealthStatus(status: 'healthy' | 'degraded' | 'down' | 'unknown'): string {
  const icons = {
    healthy: '<svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
    degraded: '<svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
    down: '<svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
    unknown: '<svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  }
  const labels = {
    healthy: 'Healthy',
    degraded: 'Degraded',
    down: 'Down',
    unknown: 'Unknown',
  }
  return `<span class="status-${status} flex items-center gap-1">${icons[status]} ${labels[status]}</span>`
}
