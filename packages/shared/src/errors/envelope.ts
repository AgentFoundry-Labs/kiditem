import { z } from 'zod';
import { ERROR_CODES, ERROR_KINDS } from './definitions.js';

/** 검증 실패 한 칸. `reason`도 한국어. */
export const FieldErrorSchema = z.object({
  field: z.string(),
  value: z.unknown().optional(),
  reason: z.string(),
}).strict();
export type FieldError = z.infer<typeof FieldErrorSchema>;

/**
 * 모든 오류 응답의 봉투 (ADR-0023). 스택·원문·변수명은 실리지 않는다.
 * `errors`는 검증 실패에만 채워지고 그 외에는 빈 배열이다. `details`는 등록된 구조 데이터만.
 */
export const ErrorResponseSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  code: z.enum(ERROR_CODES as [string, ...string[]]),
  kind: z.enum(ERROR_KINDS),
  message: z.string().min(1),
  errors: z.array(FieldErrorSchema),
  details: z.record(z.string(), z.unknown()).optional(),
  // 확장이 409 ATTEMPT_IN_PROGRESS의 최상위 attemptId를 읽는다. KID-338이 확장을 `details.attemptId`로 옮기면 제거.
  attemptId: z.string().uuid().optional(),
}).strict();
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
