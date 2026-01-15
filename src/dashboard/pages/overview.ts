/**
 * Overview page - unified view of all apps
 */

import { htmlDocument, header, statsCard } from '../components/layout'
import { sparkline, formatTrend, formatHealthStatus, dailyStatsChartConfig } from '../components/charts'
import { escapeHtml, styles } from '../styles'
import type { OverviewResponse } from '../types'

export function overviewPage(data: OverviewResponse, apps: string[]): string {
  const { totals, apps: appSummaries, recent_errors } = data

  const totalErrors = totals.today.error
  const appsWithErrors = appSummaries.filter(a => a.today_stats.error > 0).length
  const totalApps = appSummaries.length

  // Generate sparkline data (last 7 days would need additional API call, using placeholder)
  const errorTrendData = [
    totals.yesterday.error,
    totals.today.error,
  ]

  const content = `
  ${header({ currentView: 'overview', apps })}

  <main class="max-w-7xl mx-auto px-6 py-6" x-data="overviewState()">
    <!-- Error Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      ${statsCard('Total Errors (24h)', totalErrors, 'text-red-400')}
      ${statsCard('Apps with Issues', `${appsWithErrors}/${totalApps}`, appsWithErrors > 0 ? 'text-yellow-400' : 'text-green-400')}
      ${statsCard('Total Warnings', totals.today.warn, 'text-yellow-400')}
      ${statsCard('Total Info', totals.today.info, 'text-blue-400')}
    </div>

    <!-- App Health Table -->
    <div class="bg-gray-800 rounded-lg border border-gray-700 mb-6 overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h2 class="font-medium">App Health Summary</h2>
        <button @click="refreshData()" class="text-sm text-gray-400 hover:text-gray-200 flex items-center gap-1">
          <svg class="w-4 h-4" :class="{ 'animate-spin': loading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh
        </button>
      </div>
      ${appSummaries.length > 0 ? `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-750">
            <tr class="text-left text-gray-400 border-b border-gray-700">
              <th class="px-4 py-3">App</th>
              <th class="px-4 py-3 text-right">Errors (24h)</th>
              <th class="px-4 py-3 text-center">Trend</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Last Error</th>
              <th class="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-700">
            ${appSummaries.map(app => `
            <tr class="hover:bg-gray-750">
              <td class="px-4 py-3">
                <a href="/dashboard/app/${app.id}" class="text-blue-400 hover:text-blue-300 font-medium">${escapeHtml(app.name)}</a>
                ${app.name !== app.id ? `<div class="text-xs text-gray-500">${escapeHtml(app.id)}</div>` : ''}
              </td>
              <td class="px-4 py-3 text-right font-mono ${app.today_stats.error > 0 ? 'text-red-400' : 'text-gray-400'}">
                ${app.today_stats.error}
              </td>
              <td class="px-4 py-3 text-center">
                ${formatTrend(app.today_stats.error, app.yesterday_stats.error)}
              </td>
              <td class="px-4 py-3">
                ${formatHealthStatus(app.health_status)}
              </td>
              <td class="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">
                ${app.last_error ? `
                  <span title="${escapeHtml(app.last_error.message)}">${escapeHtml(app.last_error.message.substring(0, 50))}${app.last_error.message.length > 50 ? '...' : ''}</span>
                ` : '-'}
              </td>
              <td class="px-4 py-3">
                <a href="/dashboard/app/${app.id}" class="text-gray-400 hover:text-gray-200">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                </a>
              </td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : `
      <div class="px-4 py-8 text-center text-gray-500">
        No apps registered yet. Use the API to register your first app.
      </div>
      `}
    </div>

    <!-- Recent Errors -->
    <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-700">
        <h2 class="font-medium">Recent Errors (All Apps)</h2>
      </div>
      ${recent_errors.length > 0 ? `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-750">
            <tr class="text-left text-gray-400 border-b border-gray-700">
              <th class="px-4 py-3 w-40">Timestamp</th>
              <th class="px-4 py-3 w-32">App</th>
              <th class="px-4 py-3">Message</th>
              <th class="px-4 py-3 w-32">Path</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-700">
            ${recent_errors.map(error => `
            <tr class="hover:bg-gray-750 cursor-pointer" @click="showError(${JSON.stringify(error).replace(/"/g, '&quot;')})">
              <td class="px-4 py-2 text-gray-400 font-mono text-xs">
                ${new Date(error.timestamp).toLocaleString()}
              </td>
              <td class="px-4 py-2">
                <a href="/dashboard/app/${error.app_id}" class="text-blue-400 hover:text-blue-300 text-xs" @click.stop>
                  ${escapeHtml(error.app_id)}
                </a>
              </td>
              <td class="px-4 py-2 text-red-400 truncate max-w-md">
                ${escapeHtml(error.message)}
              </td>
              <td class="px-4 py-2 text-gray-500 text-xs truncate">
                ${error.context?.path ? escapeHtml(String(error.context.path)) : '-'}
              </td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : `
      <div class="px-4 py-8 text-center text-gray-500">
        No recent errors. Your apps are running smoothly!
      </div>
      `}
    </div>

    <!-- Error Detail Modal -->
    <div x-show="selectedError" x-cloak
         class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
         @click.self="selectedError = null">
      <div class="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden" @click.stop>
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 class="font-medium">Error Details</h3>
          <button @click="selectedError = null" class="text-gray-400 hover:text-gray-200">&times;</button>
        </div>
        <div class="p-4 overflow-auto max-h-[calc(80vh-60px)]">
          <pre class="text-sm whitespace-pre-wrap text-gray-300" x-text="JSON.stringify(selectedError, null, 2)"></pre>
        </div>
      </div>
    </div>
  </main>

  <script>
    function overviewState() {
      return {
        loading: false,
        selectedError: null,
        async refreshData() {
          this.loading = true;
          try {
            // Reload the page to get fresh data
            window.location.reload();
          } finally {
            this.loading = false;
          }
        },
        showError(error) {
          this.selectedError = error;
        }
      }
    }
  </script>`

  return htmlDocument(content, { title: 'Worker Logs - Overview' })
}
