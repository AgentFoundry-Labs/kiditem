import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { ApiError, friendlyError, isApiError } from '../api-error';

describe('friendlyError', () => {
  it('returns null for null/undefined input', () => {
    expect(friendlyError(null)).toBe(null);
    expect(friendlyError(undefined)).toBe(null);
  });

  it('unwraps ApiError.detail', () => {
    const e = new ApiError(400, 'bad_request', 'Invalid period format');
    expect(friendlyError(e)).toBe('Invalid period format');
  });

  it('returns Zod sentinel message on ZodError', () => {
    const z = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['x'],
        message: 'x',
      },
    ]);
    expect(friendlyError(z)).toBe('응답 형식 오류 — 개발팀에 문의하세요');
  });

  it('returns message for plain Error', () => {
    expect(friendlyError(new Error('502 Bad Gateway'))).toBe('502 Bad Gateway');
  });

  it('returns fallback for non-Error unknown', () => {
    expect(friendlyError('some string')).toBe('조회 실패');
    expect(friendlyError({ weird: true })).toBe('조회 실패');
  });
});

describe('ApiError', () => {
  it('stores HTTP error fields and uses detail as Error.message', () => {
    const err = new ApiError(404, 'NOT_FOUND', 'Item missing');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.detail).toBe('Item missing');
    expect(err.message).toBe('Item missing');
  });

  it('allows null code for non-JSON or uncategorized API errors', () => {
    const err = new ApiError(502, null, 'Bad Gateway');

    expect(err.code).toBeNull();
  });
});

describe('isApiError', () => {
  it('is true for ApiError instance', () => {
    expect(isApiError(new ApiError(500, null, 'x'))).toBe(true);
  });
  it('is false for plain Error', () => {
    expect(isApiError(new Error('x'))).toBe(false);
  });
});
