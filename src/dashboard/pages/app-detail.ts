/**
 * App detail page - single app view with advanced filtering
 */

import { htmlDocument, header, statsCard } from '../components/layout'
import { dailyStatsChartConfig, formatHealthStatus, determineHealthStatus } from '../components/charts'
import { escapeHtml, styles } from '../styles'
import type { DailyStats, LogEntry, HealthCheck } from '../../types'

export interface AppDetailData {
  appId: string
  appName: string
  stats: DailyStats[]
  healthChecks: HealthCheck[]
  healthUrls: string[]
}

export function appDetailPage(data: AppDetailData, apps: string[]): string {
  const { appId, appName, stats, healthChecks, healthUrls } = data

  // Calculate totals for the period
  const totals = stats.reduce((acc, day) => ({
    debug: acc.debug + day.debug,
    info: acc.info + day.info,
    warn: acc.warn + day.warn,
    error: acc.error + day.error,
  }), { debug: 0, info: 0, warn: 0, error: 0 })

  // Prepare chart data (reverse to show oldest first)
  const chartLabels = stats.map(s => s.date).reverse()
  const chartConfig = dailyStatsChartConfig(chartLabels, [
    { label: 'Errors', data: stats.map(s => s.error).reverse(), color: styles.logColors.ERROR },
    { label: 'Warnings', data: stats.map(s => s.warn).reverse(), color: styles.logColors.WARN },
    { label: 'Info', data: stats.map(s => s.info).reverse(), color: styles.logColors.INFO },
  ])

  // Group health checks by URL
  const healthByUrl = new Map<string, HealthCheck[]>()
  for (const check of healthChecks) {
    const existing = healthByUrl.get(check.url) || []
    existing.push(check)
    healthByUrl.set(check.url, existing)
  }

  const content = `
  ${header({ currentView: 'app', currentApp: appId, apps })}

  <main class="max-w-7xl mx-auto px-6 py-6" x-data="appDetailState()">
    <!-- App Header -->
    <div class="mb-6">
      <h2 class="text-2xl font-bold">${escapeHtml(appName)}</h2>
      ${appName !== appId ? `<div class="text-sm text-gray-500">${escapeHtml(appId)}</div>` : ''}
    </div>

    <!-- Stats Cards (7 day totals) -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      ${statsCard('Debug (7d)', totals.debug, 'text-gray-400')}
      ${statsCard('Info (7d)', totals.info, 'text-blue-400')}
      ${statsCard('Warn (7d)', totals.warn, 'text-yellow-400')}
      ${statsCard('Error (7d)', totals.error, 'text-red-400')}
    </div>

    <!-- Stats Chart -->
    <div class="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
      <h3 class="font-medium mb-4">Log Activity (7 days)</h3>
      <div class="h-64">
        <canvas id="statsChart"></canvas>
      </div>
    </div>

    <!-- Health Checks -->
    ${healthUrls.length > 0 ? `
    <div class="bg-gray-800 rounded-lg border border-gray-700 mb-6 overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-700">
        <h3 class="font-medium">Health Checks</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-750">
            <tr class="text-left text-gray-400 border-b border-gray-700">
              <th class="px-4 py-3">URL</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3 text-right">Latency</th>
              <th class="px-4 py-3">Last Check</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-700">
            ${healthUrls.map(url => {
              const checks = healthByUrl.get(url) || []
              const status = determineHealthStatus(checks)
              const lastCheck = checks[0]
              const avgLatency = checks.length > 0
                ? Math.round(checks.reduce((sum, c) => sum + c.latency_ms, 0) / checks.length)
                : null
              return `
              <tr class="hover:bg-gray-750">
                <td class="px-4 py-3 font-mono text-xs text-gray-300">${escapeHtml(url)}</td>
                <td class="px-4 py-3">${formatHealthStatus(status)}</td>
                <td class="px-4 py-3 text-right text-gray-400">${avgLatency !== null ? avgLatency + 'ms' : '-'}</td>
                <td class="px-4 py-3 text-gray-500 text-xs">
                  ${lastCheck ? new Date(lastCheck.checked_at).toLocaleString() : 'Never'}
                </td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- Filters -->
    <div class="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-4">
      <div class="flex flex-wrap items-start gap-4">
        <!-- Date Range -->
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-400">Date Range</label>
          <select x-model="filters.dateRange" @change="applyFilters()" class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm">
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <!-- Custom Date Inputs -->
        <template x-if="filters.dateRange === 'custom'">
          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-400">From</label>
              <input type="date" x-model="filters.since" @change="applyFilters()" class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm">
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-400">To</label>
              <input type="date" x-model="filters.until" @change="applyFilters()" class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm">
            </div>
          </div>
        </template>

        <!-- Level Filter -->
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-400">Level</label>
          <div class="flex gap-1">
            <button @click="setLevel('')" :class="filters.level === '' ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'" class="px-3 py-1.5 text-sm rounded">All</button>
            <button @click="setLevel('DEBUG')" :class="filters.level === 'DEBUG' ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'" class="px-3 py-1.5 text-sm rounded text-gray-400">Debug</button>
            <button @click="setLevel('INFO')" :class="filters.level === 'INFO' ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'" class="px-3 py-1.5 text-sm rounded text-blue-400">Info</button>
            <button @click="setLevel('WARN')" :class="filters.level === 'WARN' ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'" class="px-3 py-1.5 text-sm rounded text-yellow-400">Warn</button>
            <button @click="setLevel('ERROR')" :class="filters.level === 'ERROR' ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'" class="px-3 py-1.5 text-sm rounded text-red-400">Error</button>
          </div>
        </div>

        <!-- Request ID -->
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-400">Request ID</label>
          <input type="text" x-model="filters.requestId" @input.debounce.300ms="applyFilters()" placeholder="Filter by request ID..." class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm w-48">
        </div>

        <!-- Search -->
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-400">Search</label>
          <input type="text" x-model="filters.search" @input.debounce.300ms="applyFilters()" placeholder="Search messages..." class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm w-48">
        </div>
      </div>

      <!-- Context Filters -->
      <div class="mt-4 pt-4 border-t border-gray-700">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs text-gray-400">Context Filters</span>
          <button @click="addContextFilter()" class="text-xs text-blue-400 hover:text-blue-300">+ Add filter</button>
        </div>
        <template x-for="(cf, index) in filters.contextFilters" :key="index">
          <div class="flex items-center gap-2 mb-2">
            <input type="text" x-model="cf.key" @input.debounce.300ms="applyFilters()" placeholder="Key (e.g., path)" class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm w-32">
            <span class="text-gray-500">=</span>
            <input type="text" x-model="cf.value" @input.debounce.300ms="applyFilters()" placeholder="Value" class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm w-40">
            <button @click="removeContextFilter(index)" class="text-gray-400 hover:text-red-400 text-sm">&times;</button>
          </div>
        </template>
      </div>

      <!-- Filter Actions -->
      <div class="mt-4 pt-4 border-t border-gray-700 flex items-center gap-4">
        <button @click="clearFilters()" class="text-sm text-gray-400 hover:text-gray-200">Clear filters</button>
        <label class="flex items-center gap-2 text-sm text-gray-400">
          <input type="checkbox" x-model="autoRefresh" @change="toggleAutoRefresh()" class="rounded bg-gray-700 border-gray-600">
          Auto-refresh
        </label>
        <button @click="loadLogs()" class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1">
          <svg class="w-4 h-4" :class="{ 'animate-spin': loading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Logs Table -->
    <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-750 border-b border-gray-700">
          <tr class="text-left text-gray-400">
            <th class="px-4 py-3 w-44">Timestamp</th>
            <th class="px-4 py-3 w-20">Level</th>
            <th class="px-4 py-3">Message</th>
            <th class="px-4 py-3 w-32">Path</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-700">
          <template x-if="loading && logs.length === 0">
            <tr>
              <td colspan="4" class="px-4 py-8 text-center text-gray-500">
                <svg class="animate-spin h-6 w-6 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading logs...
              </td>
            </tr>
          </template>
          <template x-if="!loading && logs.length === 0">
            <tr>
              <td colspan="4" class="px-4 py-8 text-center text-gray-500">No logs found</td>
            </tr>
          </template>
          <template x-for="log in logs" :key="log.id">
            <tr class="hover:bg-gray-750 cursor-pointer" @click="showLog(log)">
              <td class="px-4 py-2 text-gray-400 font-mono text-xs" x-text="formatTimestamp(log.timestamp)"></td>
              <td class="px-4 py-2">
                <span :class="'badge-' + log.level" class="px-2 py-0.5 rounded text-xs font-medium" x-text="log.level"></span>
              </td>
              <td class="px-4 py-2 truncate max-w-md" :class="'log-' + log.level" x-text="log.message"></td>
              <td class="px-4 py-2 text-gray-500 text-xs truncate" x-text="log.context?.path || '-'"></td>
            </tr>
          </template>
        </tbody>
      </table>

      <!-- Pagination -->
      <div class="flex items-center justify-between px-4 py-3 border-t border-gray-700">
        <div class="text-sm text-gray-400">
          Showing <span x-text="logs.length"></span> logs
        </div>
        <div class="flex gap-2">
          <button @click="prevPage()" :disabled="offset === 0" class="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed">
            Previous
          </button>
          <button @click="nextPage()" :disabled="logs.length < limit" class="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed">
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Log Detail Modal -->
    <div x-show="selectedLog" x-cloak
         class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
         @click.self="selectedLog = null">
      <div class="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden" @click.stop>
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 class="font-medium">Log Details</h3>
          <button @click="selectedLog = null" class="text-gray-400 hover:text-gray-200">&times;</button>
        </div>
        <div class="p-4 overflow-auto max-h-[calc(80vh-60px)]">
          <pre class="text-sm whitespace-pre-wrap text-gray-300" x-text="JSON.stringify(selectedLog, null, 2)"></pre>
        </div>
      </div>
    </div>
  </main>

  <script>
    const APP_ID = '${appId}';

    function appDetailState() {
      return {
        logs: [],
        loading: false,
        selectedLog: null,
        autoRefresh: false,
        autoRefreshInterval: null,
        offset: 0,
        limit: 50,
        filters: {
          dateRange: '7d',
          since: '',
          until: '',
          level: '',
          requestId: '',
          search: '',
          contextFilters: []
        },

        init() {
          this.loadLogs();
        },

        setLevel(level) {
          this.filters.level = level;
          this.applyFilters();
        },

        addContextFilter() {
          this.filters.contextFilters.push({ key: '', value: '' });
        },

        removeContextFilter(index) {
          this.filters.contextFilters.splice(index, 1);
          this.applyFilters();
        },

        clearFilters() {
          this.filters = {
            dateRange: '7d',
            since: '',
            until: '',
            level: '',
            requestId: '',
            search: '',
            contextFilters: []
          };
          this.applyFilters();
        },

        applyFilters() {
          this.offset = 0;
          this.loadLogs();
        },

        buildQueryString() {
          const params = new URLSearchParams();
          params.set('limit', this.limit);
          params.set('offset', this.offset);

          if (this.filters.level) {
            params.set('level', this.filters.level);
          }

          // Date range
          if (this.filters.dateRange === 'today') {
            params.set('since', new Date().toISOString().split('T')[0] + 'T00:00:00Z');
          } else if (this.filters.dateRange === '7d') {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            params.set('since', d.toISOString());
          } else if (this.filters.dateRange === '30d') {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            params.set('since', d.toISOString());
          } else if (this.filters.dateRange === 'custom') {
            if (this.filters.since) params.set('since', this.filters.since + 'T00:00:00Z');
            if (this.filters.until) params.set('until', this.filters.until + 'T23:59:59Z');
          }

          if (this.filters.requestId) {
            params.set('request_id', this.filters.requestId);
          }

          if (this.filters.search) {
            params.set('search', this.filters.search);
          }

          // Context filters
          const validContextFilters = this.filters.contextFilters.filter(cf => cf.key && cf.value);
          for (const cf of validContextFilters) {
            params.set('context.' + cf.key, cf.value);
          }

          return params.toString();
        },

        async loadLogs() {
          this.loading = true;
          try {
            const query = this.buildQueryString();
            const res = await fetch('/dashboard/api/logs/' + APP_ID + '?' + query);
            const data = await res.json();
            if (data.ok && data.data) {
              this.logs = data.data;
            }
          } catch (err) {
            console.error('Failed to load logs:', err);
          } finally {
            this.loading = false;
          }
        },

        toggleAutoRefresh() {
          if (this.autoRefresh) {
            this.autoRefreshInterval = setInterval(() => this.loadLogs(), 5000);
          } else {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
          }
        },

        prevPage() {
          if (this.offset > 0) {
            this.offset -= this.limit;
            this.loadLogs();
          }
        },

        nextPage() {
          this.offset += this.limit;
          this.loadLogs();
        },

        showLog(log) {
          this.selectedLog = log;
        },

        formatTimestamp(ts) {
          return new Date(ts).toLocaleString();
        }
      }
    }

    // Initialize chart
    document.addEventListener('DOMContentLoaded', () => {
      const ctx = document.getElementById('statsChart');
      if (ctx) {
        new Chart(ctx, ${chartConfig});
      }
    });
  </script>`

  return htmlDocument(content, { title: `Worker Logs - ${appName}` })
}
