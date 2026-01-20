/**
 * Result type utilities for consistent Ok/Err responses
 */

/**
 * Successful result
 */
export interface Ok<T> {
  ok: true
  data: T
}

/**
 * Error result
 */
export interface Err<E = ApiError> {
  ok: false
  error: E
}

/**
 * Result type - either Ok or Err
 */
export type Result<T, E = ApiError> = Ok<T> | Err<E>

/**
 * Standard API error shape
 */
export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

/**
 * Create a successful result
 */
export function Ok<T>(data: T): Ok<T> {
  return { ok: true, data }
}

/**
 * Create an error result
 */
export function Err<E = ApiError>(error: E): Err<E> {
  return { ok: false, error }
}

/**
 * Create an ApiError
 */
export function ApiError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiError {
  return { code, message, details }
}

/**
 * Common error codes
 */
export const ErrorCode = {
  // Client errors
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

/**
 * Wrap an unknown error as an Err result with INTERNAL_ERROR code
 */
export function wrapError(e: unknown): Err<ApiError> {
  const message = e instanceof Error ? e.message : 'Unknown error'
  return Err({ code: ErrorCode.INTERNAL_ERROR, message })
}
