import { ZodError } from 'zod';

/** Machine-readable fields an owner put beside the HTTP error category, such as a live attempt. */
export type ApiErrorDetails = Readonly<{
  code?: string;
  attemptId?: string;
  /** How long the response said to wait before asking again, from its `Retry-After`. */
  retryAfterMs?: number;
  /** The sales product a duplicate refusal collides with, from its `existing.salesProductId`. */
  existingSalesProductId?: string;
  /** That product's status (`existing.salesProductStatus`), so the link can say what it opens. */
  existingSalesProductStatus?: string;
}>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    public readonly detail: string,
    public readonly details: ApiErrorDetails = {},
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * Map a query error (from React Query / apiClient) to a user-facing string.
 *
 * Branches:
 *   - null/undefined  → null (no error)
 *   - ApiError        → err.detail (server-sent message)
 *   - ZodError        → '응답 형식 오류 — 개발팀에 문의하세요' (schema drift sentinel)
 *   - Error           → err.message (network, 502, abort)
 *   - unknown         → '조회 실패'
 *
 * Returns `null` for falsy input so consumers can render `error ?? null` ternaries.
 */
export function friendlyError(err: unknown): string | null {
  if (err == null) return null;
  if (isApiError(err)) return err.detail;
  if (err instanceof ZodError) return '응답 형식 오류 — 개발팀에 문의하세요';
  if (err instanceof Error) return err.message;
  return '조회 실패';
}
