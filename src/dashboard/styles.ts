/**
 * Shared styles for the dashboard
 */

export const styles = {
  // Log level colors
  logColors: {
    DEBUG: '#9CA3AF',
    INFO: '#60A5FA',
    WARN: '#FBBF24',
    ERROR: '#F87171',
  },

  // Badge background colors
  badgeColors: {
    DEBUG: { bg: '#374151', text: '#9CA3AF' },
    INFO: { bg: '#1E3A5F', text: '#60A5FA' },
    WARN: { bg: '#78350F', text: '#FBBF24' },
    ERROR: { bg: '#7F1D1D', text: '#F87171' },
  },

  // Status colors for health checks
  statusColors: {
    healthy: '#10B981',
    degraded: '#FBBF24',
    down: '#F87171',
    unknown: '#6B7280',
  },

  // Trend indicator colors
  trendColors: {
    up: '#F87171',    // Red for increasing errors
    down: '#10B981',  // Green for decreasing errors
    stable: '#6B7280', // Gray for stable
  },
} as const

/**
 * CSS styles for log levels (inline in <style> tag)
 */
export const logLevelCss = `
  .log-DEBUG { color: ${styles.logColors.DEBUG}; }
  .log-INFO { color: ${styles.logColors.INFO}; }
  .log-WARN { color: ${styles.logColors.WARN}; }
  .log-ERROR { color: ${styles.logColors.ERROR}; }
  .badge-DEBUG { background: ${styles.badgeColors.DEBUG.bg}; color: ${styles.badgeColors.DEBUG.text}; }
  .badge-INFO { background: ${styles.badgeColors.INFO.bg}; color: ${styles.badgeColors.INFO.text}; }
  .badge-WARN { background: ${styles.badgeColors.WARN.bg}; color: ${styles.badgeColors.WARN.text}; }
  .badge-ERROR { background: ${styles.badgeColors.ERROR.bg}; color: ${styles.badgeColors.ERROR.text}; }
  .status-healthy { color: ${styles.statusColors.healthy}; }
  .status-degraded { color: ${styles.statusColors.degraded}; }
  .status-down { color: ${styles.statusColors.down}; }
  .status-unknown { color: ${styles.statusColors.unknown}; }
  .trend-up { color: ${styles.trendColors.up}; }
  .trend-down { color: ${styles.trendColors.down}; }
  .trend-stable { color: ${styles.trendColors.stable}; }
`

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, char => map[char])
}
