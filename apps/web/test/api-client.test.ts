import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api-error'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function mockResponse(status: number, body: unknown, ok = status < 400) {
  const text = JSON.stringify(body)
  return { ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve(text) } as Response
}

function mockTextResponse(status: number) {
  return { ok: false, status, json: () => Promise.reject(new Error('not json')) } as unknown as Response
}

// import after fetch mock is set
const { apiClient } = await import('@/lib/api-client')

beforeEach(() => {
  mockFetch.mockReset()
})

describe('apiClient.get', () => {
  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { data: 'ok' }))
    const result = await apiClient.get('/api/products')
    expect(result).toEqual({ data: 'ok' })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/products',
      expect.objectContaining({ credentials: 'include' }),
    )
  })
})

describe('apiClient.post', () => {
  it('sends JSON body with Content-Type header', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { id: 1 }))
    const result = await apiClient.post('/api/orders', { item: 'a' })
    expect(result).toEqual({ id: 1 })
    const [, init] = mockFetch.mock.calls[0]
    expect(init.method).toBe('POST')
    // withAuthHeaders 가 plain object header 를 Headers 객체로 normalize.
    expect(init.headers.get('Content-Type')).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ item: 'a' }))
  })

  it('sends POST without body when body is undefined', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, {}))
    await apiClient.post('/api/trigger')
    const [, init] = mockFetch.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
  })
})

describe('apiClient.patch', () => {
  it('sends PATCH with JSON body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, {}))
    await apiClient.patch('/api/products/1', { name: 'new' })
    const [, init] = mockFetch.mock.calls[0]
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe(JSON.stringify({ name: 'new' }))
  })
})

describe('apiClient.delete', () => {
  it('sends DELETE request', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, {}))
    await apiClient.delete('/api/products/1')
    const [, init] = mockFetch.mock.calls[0]
    expect(init.method).toBe('DELETE')
  })
})

describe('error handling', () => {
  it('throws ApiError with parsed error body on 4xx', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(400, { error: 'COMMON_BAD_REQUEST', message: 'Invalid input' }),
    )
    await expect(apiClient.get('/api/test')).rejects.toThrow(ApiError)
    try {
      mockFetch.mockResolvedValueOnce(
        mockResponse(400, { error: 'COMMON_BAD_REQUEST', message: 'Invalid input' }),
      )
      await apiClient.get('/api/test')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      const err = e as ApiError
      expect(err.status).toBe(400)
      expect(err.code).toBe('COMMON_BAD_REQUEST')
      expect(err.detail).toBe('Invalid input')
    }
  })

  it('throws ApiError with fallback on non-JSON error response', async () => {
    mockFetch.mockResolvedValueOnce(mockTextResponse(500))
    try {
      await apiClient.get('/api/test')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      const err = e as ApiError
      expect(err.status).toBe(500)
      expect(err.code).toBeNull()
      expect(err.detail).toBe('API error: 500')
    }
  })

  it('parses detail field as fallback for message', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(422, { error: 'VALIDATION', detail: 'Field X required' }),
    )
    try {
      await apiClient.post('/api/test', {})
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      const err = e as ApiError
      expect(err.detail).toBe('Field X required')
    }
  })
})
