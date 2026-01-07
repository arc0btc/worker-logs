import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'

describe('AppLogsDO', () => {
  function getStub(appId: string) {
    const id = env.APP_LOGS_DO.idFromName(appId)
    return env.APP_LOGS_DO.get(id)
  }

  describe('Log operations', () => {
    it('stores a single log entry', async () => {
      const stub = getStub('test-single-log')

      const response = await stub.fetch(new Request('http://do/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'INFO',
          message: 'Test message',
          context: { key: 'value' },
          request_id: 'req-123',
        }),
      }))

      expect(response.status).toBe(200)
      const data = (await response.json()) as {
        ok: boolean
        data: { id: string; level: string; message: string; context: object; request_id: string }
      }
      expect(data.ok).toBe(true)
      expect(data.data.id).toBeDefined()
      expect(data.data.level).toBe('INFO')
      expect(data.data.message).toBe('Test message')
      expect(data.data.context).toEqual({ key: 'value' })
      expect(data.data.request_id).toBe('req-123')
    })

    it('stores batch log entries', async () => {
      const stub = getStub('test-batch-log')

      const response = await stub.fetch(new Request('http://do/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: [
            { level: 'DEBUG', message: 'Debug' },
            { level: 'WARN', message: 'Warning' },
            { level: 'ERROR', message: 'Error' },
          ],
        }),
      }))

      expect(response.status).toBe(200)
      const data = (await response.json()) as { ok: boolean; data: Array<{ id: string }> }
      expect(data.ok).toBe(true)
      expect(data.data).toHaveLength(3)
      // All should have unique IDs
      const ids = data.data.map((e) => e.id)
      expect(new Set(ids).size).toBe(3)
    })

    it('queries logs with filters', async () => {
      const stub = getStub('test-query-logs')

      // First create some logs
      await stub.fetch(new Request('http://do/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: [
            { level: 'INFO', message: 'Info log', request_id: 'req-abc' },
            { level: 'ERROR', message: 'Error log' },
            { level: 'DEBUG', message: 'Debug log' },
          ],
        }),
      }))

      // Query all
      const allResponse = await stub.fetch(new Request('http://do/logs', { method: 'GET' }))
      const allData = (await allResponse.json()) as { ok: boolean; data: Array<{ message: string }> }
      expect(allData.ok).toBe(true)
      expect(allData.data.length).toBe(3)

      // Query by level
      const errorResponse = await stub.fetch(new Request('http://do/logs?level=ERROR', { method: 'GET' }))
      const errorData = (await errorResponse.json()) as { ok: boolean; data: Array<{ level: string }> }
      expect(errorData.ok).toBe(true)
      expect(errorData.data.length).toBe(1)
      expect(errorData.data[0].level).toBe('ERROR')

      // Query by request_id
      const reqResponse = await stub.fetch(new Request('http://do/logs?request_id=req-abc', { method: 'GET' }))
      const reqData = (await reqResponse.json()) as { ok: boolean; data: Array<{ request_id: string }> }
      expect(reqData.ok).toBe(true)
      expect(reqData.data.length).toBe(1)
      expect(reqData.data[0].request_id).toBe('req-abc')

      // Query with limit
      const limitResponse = await stub.fetch(new Request('http://do/logs?limit=2', { method: 'GET' }))
      const limitData = (await limitResponse.json()) as { data: Array<{ id: string }> }
      expect(limitData.data).toHaveLength(2)
    })
  })

  describe('Stats operations', () => {
    it('records and retrieves stats', async () => {
      const stub = getStub('test-stats')

      // Record single stat
      const singleResponse = await stub.fetch(new Request('http://do/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'INFO' }),
      }))
      expect(singleResponse.status).toBe(200)

      // Record batch stats
      const batchResponse = await stub.fetch(new Request('http://do/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counts: [
            { level: 'DEBUG', count: 5 },
            { level: 'ERROR', count: 2 },
          ],
        }),
      }))
      expect(batchResponse.status).toBe(200)

      // Get stats range
      const getResponse = await stub.fetch(new Request('http://do/stats?days=7', { method: 'GET' }))
      if (getResponse.status !== 200) {
        const errorData = await getResponse.json()
        console.error('Stats GET error:', JSON.stringify(errorData))
      }
      expect(getResponse.status).toBe(200)

      const data = (await getResponse.json()) as { ok: boolean; data: Array<{ date: string; info: number; debug: number; error: number }> }
      expect(data.ok).toBe(true)
      expect(data.data).toHaveLength(7)

      // Today should have our stats
      const today = new Date().toISOString().split('T')[0]
      const todayStats = data.data.find((s) => s.date === today)
      expect(todayStats).toBeDefined()
      expect(todayStats!.info).toBe(1)
      expect(todayStats!.debug).toBe(5)
      expect(todayStats!.error).toBe(2)
    })

    it('handles concurrent stats updates atomically', async () => {
      const stub = getStub('test-concurrent-stats')

      // Send 10 concurrent updates - all should succeed due to DO single-threading
      const updates = Array.from({ length: 10 }, () =>
        stub.fetch(new Request('http://do/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ level: 'INFO' }),
        }))
      )
      await Promise.all(updates)

      // Verify final count
      const finalResponse = await stub.fetch(new Request('http://do/stats?days=1', { method: 'GET' }))
      const finalData = (await finalResponse.json()) as { data: Array<{ info: number }> }
      const finalCount = finalData.data[0].info

      // Should have exactly 10 (no race condition)
      expect(finalCount).toBe(10)
    })
  })

  describe('Prune operations', () => {
    it('prunes old logs', async () => {
      const stub = getStub('test-prune')

      // Create a log
      await stub.fetch(new Request('http://do/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'INFO', message: 'Will be pruned' }),
      }))

      // Prune everything before now+1s
      const future = new Date(Date.now() + 1000).toISOString()
      const response = await stub.fetch(new Request('http://do/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ before: future }),
      }))

      expect(response.status).toBe(200)
      const data = (await response.json()) as { ok: boolean; data: { deleted: number } }
      expect(data.ok).toBe(true)
      expect(data.data.deleted).toBe(1)
    })
  })

  describe('Health URL configuration', () => {
    it('sets and retrieves health check URLs', async () => {
      const stub = getStub('test-health')

      // Set URLs
      const setResponse = await stub.fetch(new Request('http://do/health-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: ['https://example.com/health'] }),
      }))
      expect(setResponse.status).toBe(200)

      const setData = (await setResponse.json()) as { ok: boolean; data: { urls: string[] } }
      expect(setData.ok).toBe(true)
      expect(setData.data.urls).toEqual(['https://example.com/health'])

      // Get health history (will be empty, but should work)
      const getResponse = await stub.fetch(new Request('http://do/health', { method: 'GET' }))
      expect(getResponse.status).toBe(200)

      const getData = (await getResponse.json()) as { ok: boolean; data: Array<unknown> }
      expect(getData.ok).toBe(true)
      expect(Array.isArray(getData.data)).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('returns 404 for unknown paths', async () => {
      const stub = getStub('test-errors')

      const response = await stub.fetch(new Request('http://do/unknown', { method: 'GET' }))
      expect(response.status).toBe(404)

      const data = (await response.json()) as { ok: boolean; error: { code: string } }
      expect(data.ok).toBe(false)
      expect(data.error.code).toBe('NOT_FOUND')
    })

    it('returns 400 for stats without level or counts', async () => {
      const stub = getStub('test-stats-error')

      const response = await stub.fetch(new Request('http://do/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }))
      expect(response.status).toBe(400)
    })
  })
})
