import { ErrorResponseSchema, type ErrorResponse } from '@kiditem/shared/errors';

/**
 * 새 런타임의 오류 하나. `code`는 `@kiditem/shared/errors` 레지스트리 코드이거나
 * 런타임 자체 코드(`RUNTIME_*`)다. 사이트·수집기·클라이언트가 모두 이 모양으로 던지고,
 * 입구가 웹앱 응답 `{ success: false, errorCode, error }`로 바꾼다.
 */
export class RuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> | null = null,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RuntimeError';
  }
}

/** 서버 오류 봉투(`{statusCode, code, kind, message, errors, details}`)를 읽는다. 봉투가 아니면 null. */
export function parseErrorEnvelope(body: unknown): ErrorResponse | null {
  const parsed = ErrorResponseSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function isRuntimeError(value: unknown): value is RuntimeError {
  return value instanceof RuntimeError;
}
