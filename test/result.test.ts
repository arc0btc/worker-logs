import { describe, it, expect } from 'vitest'
import { Ok, Err, ErrorCode, wrapError } from '../src/result'

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

  describe('wrapError', () => {
    it('wraps Error instances with their message', () => {
      const result = wrapError(new Error('Something went wrong'))
      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('INTERNAL_ERROR')
      expect(result.error.message).toBe('Something went wrong')
    })

    it('wraps unknown values with default message', () => {
      const result = wrapError('string error')
      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('INTERNAL_ERROR')
      expect(result.error.message).toBe('Unknown error')
    })

    it('wraps null/undefined with default message', () => {
      expect(wrapError(null).error.message).toBe('Unknown error')
      expect(wrapError(undefined).error.message).toBe('Unknown error')
    })
  })
})
