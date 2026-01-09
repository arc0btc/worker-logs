import { describe, it, expect, beforeAll } from 'vitest'
import { env, SELF } from 'cloudflare:test'

describe('HTTP API Integration', () => {
  describe('Service info', () => {
    it('GET / returns service info', async () => {
      const response = await SELF.fetch('https://example.com/')
      expect(response.status).toBe(200)

      const data = (await response.json()) as { ok: boolean; data: { service: string; version: string } }
      expect(data.ok).toBe(true)
      expect(data.data.service).toBe('worker-logs')
      expect(data.data.version).toBeDefined()
    })
  })

  describe('App registration (requires admin key)', () => {
    it('POST /apps without admin key returns 401', async () => {
      const response = await SELF.fetch('https://example.com/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: 'no-auth-app', name: 'No Auth' }),
      })
      expect(response.status).toBe(401)
    })

    it('POST /apps with invalid admin key returns 401', async () => {
      const response = await SELF.fetch('https://example.com/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': 'wrong-key',
        },
        body: JSON.stringify({ app_id: 'wrong-key-app', name: 'Wrong Key' }),
      })
      expect(response.status).toBe(401)
    })

    it('POST /apps with valid admin key creates app', async () => {
      const response = await SELF.fetch('https://example.com/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
        body: JSON.stringify({ app_id: 'test-create-app', name: 'Test Create App' }),
      })
      expect(response.status).toBe(201)

      const data = (await response.json()) as { ok: boolean; data: { api_key: string } }
      expect(data.ok).toBe(true)
      expect(data.data.api_key).toBeDefined()
      expect(data.data.api_key.length).toBe(48) // 24 bytes = 48 hex chars
    })

    it('POST /apps with missing fields returns 400', async () => {
      const response = await SELF.fetch('https://example.com/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
        body: JSON.stringify({ app_id: 'missing-name' }),
      })
      expect(response.status).toBe(400)
    })
  })

  describe('Log operations (require API key)', () => {
    const APP_ID = 'log-ops-app'
    let apiKey: string

    beforeAll(async () => {
      // Create app for this test suite
      const response = await SELF.fetch('https://example.com/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
        body: JSON.stringify({ app_id: APP_ID, name: 'Log Operations Test App' }),
      })
      const data = (await response.json()) as { data: { api_key: string } }
      apiKey = data.data.api_key
    })

    it('POST /logs without headers returns 400', async () => {
      const response = await SELF.fetch('https://example.com/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'INFO', message: 'test' }),
      })
      expect(response.status).toBe(400) // Missing X-App-ID
    })

    it('POST /logs without API key returns 401', async () => {
      const response = await SELF.fetch('https://example.com/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-ID': APP_ID,
        },
        body: JSON.stringify({ level: 'INFO', message: 'test' }),
      })
      expect(response.status).toBe(401) // Missing X-Api-Key
    })

    it('POST /logs with invalid API key returns 401', async () => {
      const response = await SELF.fetch('https://example.com/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-ID': APP_ID,
          'X-Api-Key': 'wrong-key',
        },
        body: JSON.stringify({ level: 'INFO', message: 'test' }),
      })
      expect(response.status).toBe(401)
    })

    it('POST /logs creates single log entry', async () => {
      const response = await SELF.fetch('https://example.com/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-ID': APP_ID,
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({
          level: 'INFO',
          message: 'Test log message',
          context: { test: true },
        }),
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as { ok: boolean; data: { id: string; level: string; message: string } }
      expect(data.ok).toBe(true)
      expect(data.data.id).toBeDefined()
      expect(data.data.level).toBe('INFO')
      expect(data.data.message).toBe('Test log message')
    })

    it('POST /logs creates batch log entries', async () => {
      const response = await SELF.fetch('https://example.com/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-ID': APP_ID,
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({
          logs: [
            { level: 'DEBUG', message: 'Debug message' },
            { level: 'WARN', message: 'Warning message' },
            { level: 'ERROR', message: 'Error message' },
          ],
        }),
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as { ok: boolean; data: Array<{ id: string }> }
      expect(data.ok).toBe(true)
      expect(data.data).toHaveLength(3)
    })

    it('GET /logs returns log entries', async () => {
      // First create some logs
      await SELF.fetch('https://example.com/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-ID': APP_ID,
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({ level: 'INFO', message: 'Query test log' }),
      })

      const response = await SELF.fetch('https://example.com/logs?limit=10', {
        method: 'GET',
        headers: {
          'X-App-ID': APP_ID,
          'X-Api-Key': apiKey,
        },
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as { ok: boolean; data: Array<{ message: string }> }
      expect(data.ok).toBe(true)
      expect(data.data.length).toBeGreaterThanOrEqual(1)
    })

    it('GET /logs filters by level', async () => {
      // First create an ERROR log
      await SELF.fetch('https://example.com/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-ID': APP_ID,
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({ level: 'ERROR', message: 'Error for filter test' }),
      })

      const response = await SELF.fetch('https://example.com/logs?level=ERROR', {
        method: 'GET',
        headers: {
          'X-App-ID': APP_ID,
          'X-Api-Key': apiKey,
        },
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as { ok: boolean; data: Array<{ level: string }> }
      expect(data.ok).toBe(true)
      expect(data.data.every((log) => log.level === 'ERROR')).toBe(true)
    })
  })

  describe('Stats', () => {
    const APP_ID = 'stats-test-app'
    let apiKey: string

    beforeAll(async () => {
      // Create app for this test suite
      const response = await SELF.fetch('https://example.com/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
        body: JSON.stringify({ app_id: APP_ID, name: 'Stats Test App' }),
      })
      const data = (await response.json()) as { data: { api_key: string } }
      apiKey = data.data.api_key

      // Create some logs to generate stats
      await SELF.fetch('https://example.com/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-ID': APP_ID,
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({
          logs: [
            { level: 'INFO', message: 'Stats test 1' },
            { level: 'INFO', message: 'Stats test 2' },
            { level: 'WARN', message: 'Stats test 3' },
          ],
        }),
      })
    })

    it('GET /stats/:app_id without auth returns 400', async () => {
      const response = await SELF.fetch(`https://example.com/stats/${APP_ID}`)
      expect(response.status).toBe(400)
    })

    it('GET /stats/:app_id with API key returns daily stats', async () => {
      const response = await SELF.fetch(`https://example.com/stats/${APP_ID}`, {
        headers: {
          'X-App-ID': APP_ID,
          'X-Api-Key': apiKey,
        },
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as { ok: boolean; data: Array<{ date: string; info: number; warn: number }>; error?: { message: string } }
      if (!data.ok) {
        console.error('Stats error:', data.error)
      }
      expect(data.ok).toBe(true)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data.length).toBe(7) // Default 7 days

      // Today should have our logs
      const today = data.data.find((s) => s.date === new Date().toISOString().split('T')[0])
      expect(today).toBeDefined()
      expect(today!.info).toBeGreaterThanOrEqual(2)
      expect(today!.warn).toBeGreaterThanOrEqual(1)
    })

    it('GET /stats/:app_id with admin key returns daily stats', async () => {
      const response = await SELF.fetch(`https://example.com/stats/${APP_ID}`, {
        headers: {
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
      })
      expect(response.status).toBe(200)
    })
  })

  describe('App listing and details', () => {
    const APP_ID = 'listing-test-app'
    let apiKey: string

    beforeAll(async () => {
      const response = await SELF.fetch('https://example.com/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
        body: JSON.stringify({ app_id: APP_ID, name: 'Listing Test App' }),
      })
      const data = (await response.json()) as { data: { api_key: string } }
      apiKey = data.data.api_key
    })

    it('GET /apps without admin key returns 401', async () => {
      const response = await SELF.fetch('https://example.com/apps')
      expect(response.status).toBe(401)
    })

    it('GET /apps with admin key lists registered apps', async () => {
      const response = await SELF.fetch('https://example.com/apps', {
        headers: {
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as { ok: boolean; data: string[] }
      expect(data.ok).toBe(true)
      expect(data.data).toContain(APP_ID)
    })

    it('GET /apps/:app_id without auth returns 400', async () => {
      const response = await SELF.fetch(`https://example.com/apps/${APP_ID}`)
      expect(response.status).toBe(400)
    })

    it('GET /apps/:app_id with API key returns app details', async () => {
      const response = await SELF.fetch(`https://example.com/apps/${APP_ID}`, {
        headers: {
          'X-App-ID': APP_ID,
          'X-Api-Key': apiKey,
        },
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as { ok: boolean; data: { name: string; api_key?: string } }
      expect(data.ok).toBe(true)
      expect(data.data.name).toBe('Listing Test App')
      // API key should NOT be exposed
      expect(data.data.api_key).toBeUndefined()
    })

    it('GET /apps/:app_id with admin key returns app details', async () => {
      const response = await SELF.fetch(`https://example.com/apps/${APP_ID}`, {
        headers: {
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
      })
      expect(response.status).toBe(200)
    })

    it('GET /apps/:unknown with admin key returns 404', async () => {
      const response = await SELF.fetch('https://example.com/apps/nonexistent-app', {
        headers: {
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
      })
      expect(response.status).toBe(404)
    })
  })

  describe('App deletion', () => {
    it('DELETE /apps/:app_id with wrong API key returns 401', async () => {
      // First create an app to delete
      const createResponse = await SELF.fetch('https://example.com/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
        body: JSON.stringify({ app_id: 'delete-wrong-key-app', name: 'Delete Wrong Key App' }),
      })
      expect(createResponse.status).toBe(201)

      const response = await SELF.fetch('https://example.com/apps/delete-wrong-key-app', {
        method: 'DELETE',
        headers: {
          'X-App-ID': 'delete-wrong-key-app',
          'X-Api-Key': 'wrong-key',
        },
      })
      expect(response.status).toBe(401)
    })

    it('DELETE /apps/:app_id with mismatched app_id returns 403', async () => {
      // Create two apps
      const create1 = await SELF.fetch('https://example.com/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
        body: JSON.stringify({ app_id: 'app-a', name: 'App A' }),
      })
      const data1 = (await create1.json()) as { data: { api_key: string } }
      const appAKey = data1.data.api_key

      await SELF.fetch('https://example.com/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
        body: JSON.stringify({ app_id: 'app-b', name: 'App B' }),
      })

      // Try to delete app-b using app-a's credentials
      const response = await SELF.fetch('https://example.com/apps/app-b', {
        method: 'DELETE',
        headers: {
          'X-App-ID': 'app-a',
          'X-Api-Key': appAKey,
        },
      })
      expect(response.status).toBe(403)
    })

    it('DELETE /apps/:app_id deletes the app', async () => {
      // Create an app to delete
      const createResponse = await SELF.fetch('https://example.com/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': env.ADMIN_API_KEY,
        },
        body: JSON.stringify({ app_id: 'app-to-delete', name: 'App To Delete' }),
      })
      const createData = (await createResponse.json()) as { data: { api_key: string } }
      const apiKey = createData.data.api_key

      const response = await SELF.fetch('https://example.com/apps/app-to-delete', {
        method: 'DELETE',
        headers: {
          'X-App-ID': 'app-to-delete',
          'X-Api-Key': apiKey,
        },
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as { ok: boolean; data: { deleted: boolean } }
      expect(data.ok).toBe(true)
      expect(data.data.deleted).toBe(true)
    })
  })
})
