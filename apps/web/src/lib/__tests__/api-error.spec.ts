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

describe('isApiError', () => {
  it('is true for ApiError instance', () => {
    expect(isApiError(new ApiError(500, null, 'x'))).toBe(true);
  });
  it('is false for plain Error', () => {
    expect(isApiError(new Error('x'))).toBe(false);
  });
});
