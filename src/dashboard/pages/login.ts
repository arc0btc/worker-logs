/**
 * Login page for the dashboard
 */

import { htmlDocument } from '../components/layout'

export function loginPage(error?: string): string {
  const errorHtml = error
    ? `<div class="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">${error}</div>`
    : ''

  const content = `
  <div class="min-h-screen flex items-center justify-center">
    <div class="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
      <h1 class="text-2xl font-bold mb-6 text-center">Worker Logs</h1>
      ${errorHtml}
      <form method="POST" action="/dashboard/login">
        <label class="block mb-2 text-sm text-gray-400">Admin Key</label>
        <input
          type="password"
          name="admin_key"
          class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
          placeholder="Enter admin key"
          required
          autofocus
        />
        <button
          type="submit"
          class="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition-colors"
        >
          Login
        </button>
      </form>
    </div>
  </div>`

  return htmlDocument(content, { title: 'Worker Logs - Login' })
}
