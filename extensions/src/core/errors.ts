import { z } from 'zod';

/**
 * 서버 오류 봉투(ADR-0023)를 확장이 읽는 모양. shared `ErrorResponseSchema`는 코드를 레지스트리 enum으로
 * 엄격히 보지만, 확장은 서버보다 오래된 채로 돌 수 있으므로 코드·kind를 문자열로 받아 새 코드도 잃지 않는다
 * (레지스트리 전체를 번들에 싣지 않는 효과도 있다).
 */
const ErrorEnvelopeSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1),
  kind: z.string(),
  message: z.string(),
  errors: z.array(z.unknown()).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

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
export function parseErrorEnvelope(body: unknown): ErrorEnvelope | null {
  const parsed = ErrorEnvelopeSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function isRuntimeError(value: unknown): value is RuntimeError {
  return value instanceof RuntimeError;
}
