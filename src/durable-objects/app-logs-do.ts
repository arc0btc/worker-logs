import { DurableObject } from 'cloudflare:workers'
import { Ok, Err, type Result, type ApiError, ErrorCode } from '../result'
import type {
  Env,
  LogLevel,
  LogEntry,
  LogInput,
  QueryFilters,
  HealthCheck,
  PruneResult,
  DailyStats,
} from '../types'

/**
 * Durable Object for per-app log storage with SQLite backend
 * Each app gets its own isolated DO instance with separate SQLite database
 */
export class AppLogsDO extends DurableObject<Env> {
  private sql: SqlStorage
  private healthUrls: string[] = []

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.initSchema()
  }

  /**
   * Initialize SQLite schema on first load
   */
  private initSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')),
        message TEXT NOT NULL,
        context TEXT,
        request_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
      CREATE INDEX IF NOT EXISTS idx_logs_request_id ON logs(request_id);

      CREATE TABLE IF NOT EXISTS health_checks (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        status INTEGER,
        latency_ms INTEGER,
        checked_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_health_url ON health_checks(url, checked_at DESC);

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        debug INTEGER DEFAULT 0,
        info INTEGER DEFAULT 0,
        warn INTEGER DEFAULT 0,
        error INTEGER DEFAULT 0
      );
    `)
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return crypto.randomUUID()
  }

  /**
   * Log a single entry
   */
  async log(input: LogInput): Promise<Result<LogEntry>> {
    try {
      const entry: LogEntry = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        level: input.level,
        message: input.message,
        context: input.context,
        request_id: input.request_id,
      }

      this.sql.exec(
        `INSERT INTO logs (id, timestamp, level, message, context, request_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        entry.id,
        entry.timestamp,
        entry.level,
        entry.message,
        entry.context ? JSON.stringify(entry.context) : null,
        entry.request_id ?? null
      )

      return Ok(entry)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      return Err({ code: ErrorCode.INTERNAL_ERROR, message })
    }
  }

  /**
   * Log multiple entries in a batch
   */
  async logBatch(inputs: LogInput[]): Promise<Result<LogEntry[]>> {
    try {
      const entries: LogEntry[] = []
      const timestamp = new Date().toISOString()

      for (const input of inputs) {
        const entry: LogEntry = {
          id: this.generateId(),
          timestamp,
          level: input.level,
          message: input.message,
          context: input.context,
          request_id: input.request_id,
        }

        this.sql.exec(
          `INSERT INTO logs (id, timestamp, level, message, context, request_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          entry.id,
          entry.timestamp,
          entry.level,
          entry.message,
          entry.context ? JSON.stringify(entry.context) : null,
          entry.request_id ?? null
        )

        entries.push(entry)
      }

      return Ok(entries)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      return Err({ code: ErrorCode.INTERNAL_ERROR, message })
    }
  }

  /**
   * Query logs with filters
   */
  async query(filters: QueryFilters = {}): Promise<Result<LogEntry[]>> {
    try {
      const conditions: string[] = []
      const params: unknown[] = []

      if (filters.level) {
        conditions.push('level = ?')
        params.push(filters.level)
      }

      if (filters.since) {
        conditions.push('timestamp >= ?')
        params.push(filters.since)
      }

      if (filters.until) {
        conditions.push('timestamp <= ?')
        params.push(filters.until)
      }

      if (filters.request_id) {
        conditions.push('request_id = ?')
        params.push(filters.request_id)
      }

      // Full-text search in message
      if (filters.search) {
        conditions.push('message LIKE ?')
        params.push(`%${filters.search}%`)
      }

      // Context field filters (e.g., path, status)
      if (filters.context) {
        for (const [key, value] of Object.entries(filters.context)) {
          // Use json_extract for SQLite JSON querying
          conditions.push(`json_extract(context, '$.${key}') = ?`)
          params.push(value)
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const limit = filters.limit ?? 100
      const offset = filters.offset ?? 0

      const query = `
        SELECT id, timestamp, level, message, context, request_id
        FROM logs
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `
      params.push(limit, offset)

      const cursor = this.sql.exec(query, ...params)
      const rows = cursor.toArray()

      const entries: LogEntry[] = rows.map((row) => ({
        id: row.id as string,
        timestamp: row.timestamp as string,
        level: row.level as LogLevel,
        message: row.message as string,
        context: row.context ? JSON.parse(row.context as string) : undefined,
        request_id: row.request_id as string | undefined,
      }))

      return Ok(entries)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      return Err({ code: ErrorCode.INTERNAL_ERROR, message })
    }
  }

  /**
   * Prune logs older than the specified timestamp
   */
  async pruneLogs(before: string): Promise<Result<PruneResult>> {
    try {
      const cursor = this.sql.exec(
        `DELETE FROM logs WHERE timestamp < ? RETURNING id`,
        before
      )
      const deleted = cursor.toArray().length

      return Ok({ deleted })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      return Err({ code: ErrorCode.INTERNAL_ERROR, message })
    }
  }

  /**
   * Set health check URLs and start monitoring
   */
  async setHealthUrls(urls: string[]): Promise<Result<{ urls: string[] }>> {
    try {
      this.healthUrls = urls

      // Store in config table for persistence
      this.sql.exec(
        `INSERT OR REPLACE INTO config (key, value) VALUES ('health_urls', ?)`,
        JSON.stringify(urls)
      )

      // Check if alarm already exists before setting
      const existingAlarm = await this.ctx.storage.getAlarm()
      if (!existingAlarm && urls.length > 0) {
        // Schedule first health check in 1 minute
        await this.ctx.storage.setAlarm(Date.now() + 60 * 1000)
      }

      return Ok({ urls })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      return Err({ code: ErrorCode.INTERNAL_ERROR, message })
    }
  }

  /**
   * Get health check URLs from storage
   */
  private getHealthUrls(): string[] {
    if (this.healthUrls.length > 0) {
      return this.healthUrls
    }

    try {
      const cursor = this.sql.exec(
        `SELECT value FROM config WHERE key = 'health_urls'`
      )
      const row = cursor.one()
      if (row?.value) {
        this.healthUrls = JSON.parse(row.value as string)
      }
    } catch {
      // No config found, return empty
    }

    return this.healthUrls
  }

  /**
   * Get recent health checks for a URL
   */
  async getHealthHistory(url?: string, limit = 50): Promise<Result<HealthCheck[]>> {
    try {
      let query: string
      const params: unknown[] = []

      if (url) {
        query = `
          SELECT id, url, status, latency_ms, checked_at
          FROM health_checks
          WHERE url = ?
          ORDER BY checked_at DESC
          LIMIT ?
        `
        params.push(url, limit)
      } else {
        query = `
          SELECT id, url, status, latency_ms, checked_at
          FROM health_checks
          ORDER BY checked_at DESC
          LIMIT ?
        `
        params.push(limit)
      }

      const cursor = this.sql.exec(query, ...params)
      const rows = cursor.toArray()

      const checks: HealthCheck[] = rows.map((row) => ({
        id: row.id as string,
        url: row.url as string,
        status: row.status as number,
        latency_ms: row.latency_ms as number,
        checked_at: row.checked_at as string,
      }))

      return Ok(checks)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      return Err({ code: ErrorCode.INTERNAL_ERROR, message })
    }
  }

  /**
   * Record a health check result
   */
  private recordHealthCheck(url: string, status: number, latencyMs: number) {
    const id = this.generateId()
    const checkedAt = new Date().toISOString()

    this.sql.exec(
      `INSERT INTO health_checks (id, url, status, latency_ms, checked_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      url,
      status,
      latencyMs,
      checkedAt
    )

    // Clean up old health checks (keep last 1000 per URL)
    this.sql.exec(
      `DELETE FROM health_checks
       WHERE url = ? AND id NOT IN (
         SELECT id FROM health_checks WHERE url = ? ORDER BY checked_at DESC LIMIT 1000
       )`,
      url,
      url
    )
  }

  /**
   * Get the date string for today (YYYY-MM-DD)
   */
  private getDateKey(date?: Date): string {
    const d = date ?? new Date()
    return d.toISOString().split('T')[0]
  }

  /**
   * Record stats for a log level (atomic increment in SQLite)
   * This is called internally after successfully storing a log
   */
  recordStats(level: LogLevel, count: number = 1): DailyStats {
    const dateKey = this.getDateKey()

    // Ensure row exists for today
    this.sql.exec(
      `INSERT OR IGNORE INTO daily_stats (date, debug, info, warn, error) VALUES (?, 0, 0, 0, 0)`,
      dateKey
    )

    // Atomic increment based on level
    const column = level.toLowerCase()
    this.sql.exec(
      `UPDATE daily_stats SET ${column} = ${column} + ? WHERE date = ?`,
      count,
      dateKey
    )

    // Return current stats
    const cursor = this.sql.exec(`SELECT * FROM daily_stats WHERE date = ?`, dateKey)
    const row = cursor.one()

    return {
      date: row!.date as string,
      debug: row!.debug as number,
      info: row!.info as number,
      warn: row!.warn as number,
      error: row!.error as number,
    }
  }

  /**
   * Record stats for multiple log levels (batch)
   */
  recordStatsBatch(counts: { level: LogLevel; count: number }[]): DailyStats {
    const dateKey = this.getDateKey()

    // Ensure row exists for today
    this.sql.exec(
      `INSERT OR IGNORE INTO daily_stats (date, debug, info, warn, error) VALUES (?, 0, 0, 0, 0)`,
      dateKey
    )

    // Aggregate counts by level
    const totals = { debug: 0, info: 0, warn: 0, error: 0 }
    for (const { level, count } of counts) {
      totals[level.toLowerCase() as keyof typeof totals] += count
    }

    // Single update with all increments
    this.sql.exec(
      `UPDATE daily_stats SET debug = debug + ?, info = info + ?, warn = warn + ?, error = error + ? WHERE date = ?`,
      totals.debug,
      totals.info,
      totals.warn,
      totals.error,
      dateKey
    )

    // Return current stats
    const cursor = this.sql.exec(`SELECT * FROM daily_stats WHERE date = ?`, dateKey)
    const row = cursor.one()

    return {
      date: row!.date as string,
      debug: row!.debug as number,
      info: row!.info as number,
      warn: row!.warn as number,
      error: row!.error as number,
    }
  }

  /**
   * Get stats for a specific date
   */
  getStats(date?: string): DailyStats {
    const dateKey = date ?? this.getDateKey()
    const cursor = this.sql.exec(`SELECT * FROM daily_stats WHERE date = ?`, dateKey)
    const rows = cursor.toArray()

    if (rows.length === 0) {
      return { date: dateKey, debug: 0, info: 0, warn: 0, error: 0 }
    }

    const row = rows[0]
    return {
      date: row.date as string,
      debug: row.debug as number,
      info: row.info as number,
      warn: row.warn as number,
      error: row.error as number,
    }
  }

  /**
   * Get stats for multiple days
   */
  getStatsRange(days: number = 7): DailyStats[] {
    const stats: DailyStats[] = []
    const today = new Date()

    for (let i = 0; i < days; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateKey = this.getDateKey(date)
      stats.push(this.getStats(dateKey))
    }

    return stats
  }

  /**
   * Alarm handler for periodic health checks
   */
  async alarm(alarmInfo?: { retryCount: number; isRetry: boolean }) {
    if (alarmInfo?.isRetry) {
      console.log(`Health check alarm retry attempt ${alarmInfo.retryCount}`)
    }

    const urls = this.getHealthUrls()

    for (const url of urls) {
      const start = Date.now()
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

        const res = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        this.recordHealthCheck(url, res.status, Date.now() - start)
      } catch (e) {
        // Record failed check with status 0
        this.recordHealthCheck(url, 0, Date.now() - start)
      }
    }

    // Schedule next check in 5 minutes if we have URLs to monitor
    if (urls.length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000)
    }
  }

  /**
   * Handle HTTP requests to the DO (for internal routing)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      // POST /log - single log
      if (request.method === 'POST' && path === '/log') {
        const input = (await request.json()) as LogInput
        const result = await this.log(input)
        return Response.json(result)
      }

      // POST /logs - batch logs
      if (request.method === 'POST' && path === '/logs') {
        const { logs } = (await request.json()) as { logs: LogInput[] }
        const result = await this.logBatch(logs)
        return Response.json(result)
      }

      // GET /logs - query
      if (request.method === 'GET' && path === '/logs') {
        // Parse context.* filters from query params
        const context: Record<string, string> = {}
        for (const [key, value] of url.searchParams.entries()) {
          if (key.startsWith('context.')) {
            const contextKey = key.substring(8) // Remove 'context.' prefix
            context[contextKey] = value
          }
        }

        const filters: QueryFilters = {
          level: url.searchParams.get('level') as LogLevel | undefined,
          since: url.searchParams.get('since') ?? undefined,
          until: url.searchParams.get('until') ?? undefined,
          request_id: url.searchParams.get('request_id') ?? undefined,
          search: url.searchParams.get('search') ?? undefined,
          context: Object.keys(context).length > 0 ? context : undefined,
          limit: url.searchParams.has('limit')
            ? parseInt(url.searchParams.get('limit')!)
            : undefined,
          offset: url.searchParams.has('offset')
            ? parseInt(url.searchParams.get('offset')!)
            : undefined,
        }
        const result = await this.query(filters)
        return Response.json(result)
      }

      // POST /prune - cleanup old logs
      if (request.method === 'POST' && path === '/prune') {
        const { before } = (await request.json()) as { before: string }
        const result = await this.pruneLogs(before)
        return Response.json(result)
      }

      // POST /health-urls - set URLs to monitor
      if (request.method === 'POST' && path === '/health-urls') {
        const { urls } = (await request.json()) as { urls: string[] }
        const result = await this.setHealthUrls(urls)
        return Response.json(result)
      }

      // GET /health - get health check history
      if (request.method === 'GET' && path === '/health') {
        const urlParam = url.searchParams.get('url') ?? undefined
        const limit = url.searchParams.has('limit')
          ? parseInt(url.searchParams.get('limit')!)
          : 50
        const result = await this.getHealthHistory(urlParam, limit)
        return Response.json(result)
      }

      // POST /stats - record stats (internal only)
      if (request.method === 'POST' && path === '/stats') {
        const body = (await request.json()) as { level?: LogLevel; counts?: { level: LogLevel; count: number }[] }
        let result: DailyStats
        if (body.counts) {
          result = this.recordStatsBatch(body.counts)
        } else if (body.level) {
          result = this.recordStats(body.level)
        } else {
          return Response.json(
            Err({ code: ErrorCode.BAD_REQUEST, message: 'level or counts required' }),
            { status: 400 }
          )
        }
        return Response.json(Ok(result))
      }

      // GET /stats - get daily stats
      if (request.method === 'GET' && path === '/stats') {
        const days = url.searchParams.has('days')
          ? parseInt(url.searchParams.get('days')!)
          : 7
        const result = this.getStatsRange(days)
        return Response.json(Ok(result))
      }

      return Response.json(
        Err({ code: ErrorCode.NOT_FOUND, message: `Unknown path: ${path}` }),
        { status: 404 }
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      return Response.json(
        Err({ code: ErrorCode.INTERNAL_ERROR, message }),
        { status: 500 }
      )
    }
  }
}
