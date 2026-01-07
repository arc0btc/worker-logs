import { describe, it, expect } from 'vitest'
import { Ok, Err, isOk, isErr, ErrorCode, getErrorStatus, ErrorStatusMap } from '../src/result'

describe('Result utilities', () => {
  describe('Ok', () => {
    it('creates a successful result with data', () => {
      const result = Ok({ foo: 'bar' })
      expect(result.ok).toBe(true)
      expect(result.data).toEqual({ foo: 'bar' })
    })

    it('works with primitive values', () => {
      expect(Ok(42).data).toBe(42)
      expect(Ok('test').data).toBe('test')
      expect(Ok(null).data).toBe(null)
    })
  })

  describe('Err', () => {
    it('creates an error result', () => {
      const result = Err({ code: ErrorCode.BAD_REQUEST, message: 'Invalid input' })
      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('BAD_REQUEST')
      expect(result.error.message).toBe('Invalid input')
    })

    it('supports optional details', () => {
      const result = Err({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: { field: 'email', issue: 'invalid format' },
      })
      expect(result.error.details).toEqual({ field: 'email', issue: 'invalid format' })
    })
  })

  describe('Type guards', () => {
    it('isOk correctly identifies Ok results', () => {
      expect(isOk(Ok('test'))).toBe(true)
      expect(isOk(Err({ code: 'ERROR', message: 'fail' }))).toBe(false)
    })

    it('isErr correctly identifies Err results', () => {
      expect(isErr(Err({ code: 'ERROR', message: 'fail' }))).toBe(true)
      expect(isErr(Ok('test'))).toBe(false)
    })
  })

  describe('Error codes', () => {
    it('has all expected error codes', () => {
      expect(ErrorCode.BAD_REQUEST).toBe('BAD_REQUEST')
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED')
      expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN')
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND')
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
      expect(ErrorCode.NOT_IMPLEMENTED).toBe('NOT_IMPLEMENTED')
      expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE')
    })
  })

  describe('getErrorStatus', () => {
    it('maps error codes to HTTP status codes', () => {
      expect(getErrorStatus({ code: ErrorCode.BAD_REQUEST, message: '' })).toBe(400)
      expect(getErrorStatus({ code: ErrorCode.UNAUTHORIZED, message: '' })).toBe(401)
      expect(getErrorStatus({ code: ErrorCode.FORBIDDEN, message: '' })).toBe(403)
      expect(getErrorStatus({ code: ErrorCode.NOT_FOUND, message: '' })).toBe(404)
      expect(getErrorStatus({ code: ErrorCode.VALIDATION_ERROR, message: '' })).toBe(422)
      expect(getErrorStatus({ code: ErrorCode.INTERNAL_ERROR, message: '' })).toBe(500)
      expect(getErrorStatus({ code: ErrorCode.NOT_IMPLEMENTED, message: '' })).toBe(501)
      expect(getErrorStatus({ code: ErrorCode.SERVICE_UNAVAILABLE, message: '' })).toBe(503)
    })

    it('defaults to 500 for unknown error codes', () => {
      expect(getErrorStatus({ code: 'UNKNOWN_CODE', message: '' })).toBe(500)
    })
  })

  describe('ErrorStatusMap', () => {
    it('contains correct mappings', () => {
      expect(ErrorStatusMap[ErrorCode.BAD_REQUEST]).toBe(400)
      expect(ErrorStatusMap[ErrorCode.UNAUTHORIZED]).toBe(401)
      expect(ErrorStatusMap[ErrorCode.NOT_FOUND]).toBe(404)
      expect(ErrorStatusMap[ErrorCode.INTERNAL_ERROR]).toBe(500)
    })
  })
})
