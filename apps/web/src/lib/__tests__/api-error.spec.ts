import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { ERROR_DEFINITIONS } from '@kiditem/shared/errors';
import { ApiError, friendlyError, isApiError } from '../api-error';

const zodError = () => new ZodError([
  { code: 'invalid_type', expected: 'string', received: 'number', path: ['x'], message: 'x' },
]);

describe('friendlyError', () => {
  it('returns null for null/undefined input', () => {
    expect(friendlyError(null)).toBe(null);
    expect(friendlyError(undefined)).toBe(null);
  });

  it('returns the Korean server sentence of an ApiError', () => {
    expect(friendlyError(new ApiError(409, 'ATTEMPT_IN_PROGRESS', '이미 수집 중입니다.'))).toBe('이미 수집 중입니다.');
  });

  it('never returns English: an English ApiError message becomes the registry sentence of its code', () => {
    expect(friendlyError(new ApiError(400, 'VALIDATION_FAILED', 'Invalid period format')))
      .toBe(ERROR_DEFINITIONS.VALIDATION_FAILED.text);
    expect(friendlyError(new ApiError(502, null, 'Bad Gateway'))).toBe(ERROR_DEFINITIONS.INTERNAL_ERROR.text);
  });

  it('turns a ZodError, an English Error or a thrown value into the INTERNAL_ERROR sentence', () => {
    expect(friendlyError(zodError())).toBe(ERROR_DEFINITIONS.INTERNAL_ERROR.text);
    expect(friendlyError(new Error('502 Bad Gateway'))).toBe(ERROR_DEFINITIONS.INTERNAL_ERROR.text);
    expect(friendlyError({ weird: true })).toBe(ERROR_DEFINITIONS.INTERNAL_ERROR.text);
  });

  it('keeps a Korean sentence the web itself threw', () => {
    expect(friendlyError(new Error('상품을 먼저 선택하세요.'))).toBe('상품을 먼저 선택하세요.');
  });

  it('uses the caller fallback instead of the generic sentence for a non-API failure', () => {
    expect(friendlyError(new Error('boom'), '저장하지 못했습니다.')).toBe('저장하지 못했습니다.');
    expect(friendlyError(new ApiError(404, 'NOT_FOUND', 'Not Found'), '저장하지 못했습니다.'))
      .toBe(ERROR_DEFINITIONS.NOT_FOUND.text);
  });
});

describe('ApiError', () => {
  it('resolves the code through the registry and derives kind from it', () => {
    const err = new ApiError(401, 'auth_required', '');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(401);
    expect(err.code).toBe('AUTH_REQUIRED');
    expect(err.kind).toBe('auth');
    expect(err.message).toBe(ERROR_DEFINITIONS.AUTH_REQUIRED.text);
    expect(err.errors).toEqual([]);
    expect(err).not.toHaveProperty('detail');
  });

  it('marks an unknown code UNKNOWN', () => {
    const err = new ApiError(502, null, 'Bad Gateway');
    expect(err.code).toBe('UNKNOWN');
    expect(err.kind).toBe('unknown');
  });

  it('keeps field errors and structured details', () => {
    const err = new ApiError(400, 'VALIDATION_FAILED', '입력값이 올바르지 않습니다.', { attemptId: 'a' }, [
      { field: 'name', reason: '문자열이어야 합니다.' },
    ]);
    expect(err.errors).toEqual([{ field: 'name', reason: '문자열이어야 합니다.' }]);
    expect(err.details).toEqual({ attemptId: 'a' });
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
