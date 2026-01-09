/**
 * Dashboard UI for browsing logs
 *
 * Routes:
 *   GET /dashboard - Login page (if not authenticated) or main dashboard
 *   POST /dashboard/login - Authenticate with admin key
 *   GET /dashboard/logout - Clear session
 *   GET /dashboard/api/logs/:app_id - Fetch logs for dashboard (admin auth)
 */

import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Env } from './types'

const dashboard = new Hono<{ Bindings: Env }>()

// Session cookie name
const SESSION_COOKIE = 'wl_session'

// Check if request has valid admin session
async function isAuthenticated(c: any): Promise<boolean> {
  const session = getCookie(c, SESSION_COOKIE)
  if (!session || !c.env.ADMIN_API_KEY) return false

  // Simple hash comparison (session stores hashed admin key)
  const encoder = new TextEncoder()
  const data = encoder.encode(c.env.ADMIN_API_KEY)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hashHex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return session === hashHex
}

// Create session token from admin key
async function createSession(adminKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(adminKey)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Login page HTML
function loginPage(error?: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Worker Logs - Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-gray-100 min-h-screen flex items-center justify-center">
  <div class="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
    <h1 class="text-2xl font-bold mb-6 text-center">Worker Logs</h1>
    ${error ? `<div class="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">${error}</div>` : ''}
    <form method="POST" action="/dashboard/login">
      <label class="block mb-2 text-sm text-gray-400">Admin Key</label>
      <input
        type="password"
        name="admin_key"
        class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
        placeholder="Enter admin key"
        required
      />
      <button
        type="submit"
        class="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition-colors"
      >
        Login
      </button>
    </form>
  </div>
</body>
</html>`
}

// Main dashboard HTML
function dashboardPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Worker Logs</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .log-DEBUG { color: #9CA3AF; }
    .log-INFO { color: #60A5FA; }
    .log-WARN { color: #FBBF24; }
    .log-ERROR { color: #F87171; }
    .badge-DEBUG { background: #374151; color: #9CA3AF; }
    .badge-INFO { background: #1E3A5F; color: #60A5FA; }
    .badge-WARN { background: #78350F; color: #FBBF24; }
    .badge-ERROR { background: #7F1D1D; color: #F87171; }
  </style>
</head>
<body class="bg-gray-900 text-gray-100 min-h-screen">
  <!-- Header -->
  <header class="bg-gray-800 border-b border-gray-700 px-6 py-4">
    <div class="max-w-7xl mx-auto flex items-center justify-between">
      <h1 class="text-xl font-bold">Worker Logs</h1>
      <div class="flex items-center gap-4">
        <select id="appSelect" class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500">
          <option value="">Select app...</option>
        </select>
        <a href="/dashboard/logout" class="text-gray-400 hover:text-gray-200 text-sm">Logout</a>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-6 py-6">
    <!-- Stats Cards -->
    <div id="statsSection" class="hidden mb-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-gray-400 text-sm mb-1">Debug</div>
          <div id="statDebug" class="text-2xl font-bold text-gray-400">0</div>
        </div>
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-gray-400 text-sm mb-1">Info</div>
          <div id="statInfo" class="text-2xl font-bold text-blue-400">0</div>
        </div>
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-gray-400 text-sm mb-1">Warn</div>
          <div id="statWarn" class="text-2xl font-bold text-yellow-400">0</div>
        </div>
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-gray-400 text-sm mb-1">Error</div>
          <div id="statError" class="text-2xl font-bold text-red-400">0</div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div id="filtersSection" class="hidden mb-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex gap-1">
          <button data-level="" class="level-btn px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600">All</button>
          <button data-level="DEBUG" class="level-btn px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 text-gray-400">Debug</button>
          <button data-level="INFO" class="level-btn px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 text-blue-400">Info</button>
          <button data-level="WARN" class="level-btn px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 text-yellow-400">Warn</button>
          <button data-level="ERROR" class="level-btn px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 text-red-400">Error</button>
        </div>
        <input
          type="text"
          id="searchInput"
          placeholder="Search messages..."
          class="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500 w-64"
        />
        <label class="flex items-center gap-2 text-sm text-gray-400">
          <input type="checkbox" id="autoRefresh" class="rounded bg-gray-700 border-gray-600">
          Auto-refresh
        </label>
        <button id="refreshBtn" class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded">
          Refresh
        </button>
      </div>
    </div>

    <!-- Logs Table -->
    <div id="logsSection" class="hidden">
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
          <tbody id="logsTable" class="divide-y divide-gray-700">
            <!-- Logs will be inserted here -->
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex items-center justify-between mt-4">
        <div class="text-sm text-gray-400">
          Showing <span id="showingCount">0</span> logs
        </div>
        <div class="flex gap-2">
          <button id="prevBtn" class="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed" disabled>
            Previous
          </button>
          <button id="nextBtn" class="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed" disabled>
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div id="emptyState" class="text-center py-12 text-gray-500">
      <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p>Select an app to view logs</p>
    </div>

    <!-- Log Detail Modal -->
    <div id="logModal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div class="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 class="font-medium">Log Details</h3>
          <button id="closeModal" class="text-gray-400 hover:text-gray-200">&times;</button>
        </div>
        <div id="modalContent" class="p-4 overflow-auto max-h-[calc(80vh-60px)]">
          <pre class="text-sm whitespace-pre-wrap"></pre>
        </div>
      </div>
    </div>
  </main>

  <script>
    // State
    let currentApp = '';
    let currentLevel = '';
    let currentOffset = 0;
    const limit = 50;
    let autoRefreshInterval = null;
    let allLogs = [];

    // Elements
    const appSelect = document.getElementById('appSelect');
    const statsSection = document.getElementById('statsSection');
    const filtersSection = document.getElementById('filtersSection');
    const logsSection = document.getElementById('logsSection');
    const emptyState = document.getElementById('emptyState');
    const logsTable = document.getElementById('logsTable');
    const searchInput = document.getElementById('searchInput');
    const autoRefreshCheckbox = document.getElementById('autoRefresh');
    const refreshBtn = document.getElementById('refreshBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const showingCount = document.getElementById('showingCount');
    const logModal = document.getElementById('logModal');
    const modalContent = document.getElementById('modalContent');
    const closeModal = document.getElementById('closeModal');

    // Load apps on page load
    async function loadApps() {
      try {
        const res = await fetch('/dashboard/api/apps');
        const data = await res.json();
        if (data.ok && data.data) {
          data.data.forEach(appId => {
            const option = document.createElement('option');
            option.value = appId;
            option.textContent = appId;
            appSelect.appendChild(option);
          });
        }
      } catch (err) {
        console.error('Failed to load apps:', err);
      }
    }

    // Load stats for selected app
    async function loadStats() {
      if (!currentApp) return;
      try {
        const res = await fetch(\`/dashboard/api/stats/\${currentApp}?days=1\`);
        const data = await res.json();
        if (data.ok && data.data && data.data[0]) {
          const today = data.data[0];
          document.getElementById('statDebug').textContent = today.debug || 0;
          document.getElementById('statInfo').textContent = today.info || 0;
          document.getElementById('statWarn').textContent = today.warn || 0;
          document.getElementById('statError').textContent = today.error || 0;
        }
      } catch (err) {
        console.error('Failed to load stats:', err);
      }
    }

    // Load logs for selected app
    async function loadLogs() {
      if (!currentApp) return;
      try {
        let url = \`/dashboard/api/logs/\${currentApp}?limit=\${limit}&offset=\${currentOffset}\`;
        if (currentLevel) url += \`&level=\${currentLevel}\`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.ok && data.data) {
          allLogs = data.data;
          renderLogs();
        }
      } catch (err) {
        console.error('Failed to load logs:', err);
      }
    }

    // Filter logs by search term
    function filterLogs() {
      const search = searchInput.value.toLowerCase();
      if (!search) return allLogs;
      return allLogs.filter(log =>
        log.message.toLowerCase().includes(search) ||
        (log.context?.path && log.context.path.toLowerCase().includes(search))
      );
    }

    // Render logs table
    function renderLogs() {
      const logs = filterLogs();
      logsTable.innerHTML = '';

      if (logs.length === 0) {
        logsTable.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500">No logs found</td></tr>';
        showingCount.textContent = '0';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
      }

      logs.forEach(log => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-750 cursor-pointer';
        tr.onclick = () => showLogDetail(log);

        const time = new Date(log.timestamp).toLocaleString();
        const path = log.context?.path || '-';

        tr.innerHTML = \`
          <td class="px-4 py-2 text-gray-400 font-mono text-xs">\${time}</td>
          <td class="px-4 py-2"><span class="badge-\${log.level} px-2 py-0.5 rounded text-xs font-medium">\${log.level}</span></td>
          <td class="px-4 py-2 log-\${log.level} truncate max-w-md">\${escapeHtml(log.message)}</td>
          <td class="px-4 py-2 text-gray-500 text-xs truncate">\${escapeHtml(path)}</td>
        \`;
        logsTable.appendChild(tr);
      });

      showingCount.textContent = logs.length;
      prevBtn.disabled = currentOffset === 0;
      nextBtn.disabled = logs.length < limit;
    }

    // Show log detail modal
    function showLogDetail(log) {
      modalContent.querySelector('pre').textContent = JSON.stringify(log, null, 2);
      logModal.classList.remove('hidden');
    }

    // Escape HTML
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Event listeners
    appSelect.addEventListener('change', (e) => {
      currentApp = e.target.value;
      currentOffset = 0;
      if (currentApp) {
        emptyState.classList.add('hidden');
        statsSection.classList.remove('hidden');
        filtersSection.classList.remove('hidden');
        logsSection.classList.remove('hidden');
        loadStats();
        loadLogs();
      } else {
        emptyState.classList.remove('hidden');
        statsSection.classList.add('hidden');
        filtersSection.classList.add('hidden');
        logsSection.classList.add('hidden');
      }
    });

    document.querySelectorAll('.level-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('bg-gray-700'));
        document.querySelectorAll('.level-btn').forEach(b => b.classList.add('bg-gray-800'));
        btn.classList.remove('bg-gray-800');
        btn.classList.add('bg-gray-700');
        currentLevel = btn.dataset.level;
        currentOffset = 0;
        loadLogs();
      });
    });

    searchInput.addEventListener('input', () => {
      renderLogs();
    });

    refreshBtn.addEventListener('click', () => {
      loadStats();
      loadLogs();
    });

    autoRefreshCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        autoRefreshInterval = setInterval(() => {
          loadStats();
          loadLogs();
        }, 5000);
      } else {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
      }
    });

    prevBtn.addEventListener('click', () => {
      if (currentOffset > 0) {
        currentOffset -= limit;
        loadLogs();
      }
    });

    nextBtn.addEventListener('click', () => {
      currentOffset += limit;
      loadLogs();
    });

    closeModal.addEventListener('click', () => {
      logModal.classList.add('hidden');
    });

    logModal.addEventListener('click', (e) => {
      if (e.target === logModal) {
        logModal.classList.add('hidden');
      }
    });

    // Initialize
    loadApps();
  </script>
</body>
</html>`
}

// Dashboard routes
dashboard.get('/', async (c) => {
  if (!await isAuthenticated(c)) {
    return c.html(loginPage())
  }
  return c.html(dashboardPage())
})

dashboard.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const adminKey = body.admin_key as string

  if (!adminKey || adminKey !== c.env.ADMIN_API_KEY) {
    return c.html(loginPage('Invalid admin key'))
  }

  const session = await createSession(adminKey)
  setCookie(c, SESSION_COOKIE, session, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 60 * 60 * 24 // 24 hours
  })

  return c.redirect('/dashboard')
})

dashboard.get('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE)
  return c.redirect('/dashboard')
})

// API endpoint for fetching logs (requires auth)
dashboard.get('/api/logs/:app_id', async (c) => {
  if (!await isAuthenticated(c)) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const appId = c.req.param('app_id')
  const url = new URL(c.req.url)

  const id = c.env.APP_LOGS_DO.idFromName(appId)
  const stub = c.env.APP_LOGS_DO.get(id)

  const res = await stub.fetch(new Request(`http://do/logs${url.search}`, {
    method: 'GET',
  }))

  return c.json(await res.json())
})

// API endpoint for listing apps (requires auth)
dashboard.get('/api/apps', async (c) => {
  if (!await isAuthenticated(c)) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401)
  }

  if (!c.env.LOGS_KV) {
    return c.json({ ok: false, error: 'KV namespace not configured' }, 500)
  }

  const data = await c.env.LOGS_KV.get('apps')
  if (!data) {
    return c.json({ ok: true, data: [] })
  }

  return c.json({ ok: true, data: JSON.parse(data) })
})

// API endpoint for fetching stats (requires auth)
dashboard.get('/api/stats/:app_id', async (c) => {
  if (!await isAuthenticated(c)) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const appId = c.req.param('app_id')
  const days = c.req.query('days') || '7'

  const id = c.env.APP_LOGS_DO.idFromName(appId)
  const stub = c.env.APP_LOGS_DO.get(id)

  const res = await stub.fetch(new Request(`http://do/stats?days=${days}`, {
    method: 'GET',
  }))

  return c.json(await res.json())
})

export { dashboard }
