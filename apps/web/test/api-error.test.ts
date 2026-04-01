import { describe, it, expect } from 'vitest'
import { ApiError, isApiError } from '@/lib/api-error'

describe('ApiError', () => {
  it('creates instance with correct properties', () => {
    const err = new ApiError(404, 'NOT_FOUND', 'Item missing')
    expect(err.status).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.detail).toBe('Item missing')
    expect(err.message).toBe('Item missing')
  })

  it('extends Error with name ApiError', () => {
    const err = new ApiError(500, null, 'fail')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ApiError')
  })

  it('supports null code', () => {
    const err = new ApiError(502, null, 'Bad Gateway')
    expect(err.code).toBeNull()
  })
})

describe('isApiError', () => {
  it('returns true for ApiError instance', () => {
    expect(isApiError(new ApiError(400, 'X', 'y'))).toBe(true)
  })

  it('returns false for non-ApiError values', () => {
    expect(isApiError(new Error('x'))).toBe(false)
    expect(isApiError('string')).toBe(false)
    expect(isApiError(null)).toBe(false)
    expect(isApiError(undefined)).toBe(false)
    expect(isApiError({ status: 400, code: 'X', detail: 'y' })).toBe(false)
  })
})
