/**
 * Shared layout components for the dashboard
 */

import { logLevelCss } from '../styles'

export interface LayoutOptions {
  title?: string
  currentView?: 'overview' | 'app'
  currentApp?: string
  apps?: string[]
}

/**
 * Generate the HTML document wrapper with head and scripts
 */
export function htmlDocument(content: string, options: LayoutOptions = {}): string {
  const { title = 'Worker Logs' } = options

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    ${logLevelCss}
    [x-cloak] { display: none !important; }
  </style>
</head>
<body class="bg-gray-900 text-gray-100 min-h-screen">
${content}
</body>
</html>`
}

/**
 * Dashboard header with navigation
 */
export function header(options: LayoutOptions = {}): string {
  const { currentView = 'overview', currentApp, apps = [] } = options

  const appOptions = apps.map(app =>
    `<option value="${app}" ${app === currentApp ? 'selected' : ''}>${app}</option>`
  ).join('\n')

  return `
  <header class="bg-gray-800 border-b border-gray-700 px-6 py-4">
    <div class="max-w-7xl mx-auto flex items-center justify-between">
      <div class="flex items-center gap-6">
        <h1 class="text-xl font-bold">Worker Logs</h1>
        <nav class="flex gap-1">
          <a href="/dashboard"
             class="px-3 py-1.5 text-sm rounded ${currentView === 'overview' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'}">
            Overview
          </a>
          <div class="relative" x-data="{ open: false }">
            <button @click="open = !open"
                    class="px-3 py-1.5 text-sm rounded flex items-center gap-1 ${currentView === 'app' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'}">
              ${currentApp ? currentApp : 'Select App'}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            <div x-show="open" @click.away="open = false" x-cloak
                 class="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-[160px] z-50">
              ${apps.map(app => `
                <a href="/dashboard/app/${app}"
                   class="block px-3 py-1.5 text-sm hover:bg-gray-700 ${app === currentApp ? 'text-blue-400' : 'text-gray-300'}">
                  ${app}
                </a>
              `).join('')}
              ${apps.length === 0 ? '<div class="px-3 py-1.5 text-sm text-gray-500">No apps registered</div>' : ''}
            </div>
          </div>
        </nav>
      </div>
      <a href="/dashboard/logout" class="text-gray-400 hover:text-gray-200 text-sm">Logout</a>
    </div>
  </header>`
}

/**
 * Stats card component
 */
export function statsCard(label: string, value: number | string, colorClass: string = 'text-gray-100'): string {
  return `
  <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
    <div class="text-gray-400 text-sm mb-1">${label}</div>
    <div class="text-2xl font-bold ${colorClass}">${value}</div>
  </div>`
}

/**
 * Empty state component
 */
export function emptyState(icon: string, message: string): string {
  return `
  <div class="text-center py-12 text-gray-500">
    ${icon}
    <p>${message}</p>
  </div>`
}

/**
 * Loading spinner component
 */
export function loadingSpinner(): string {
  return `
  <div class="flex items-center justify-center py-8">
    <svg class="animate-spin h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  </div>`
}
