import { z } from 'zod';
import { OperationKindSchema } from '@kiditem/shared/operation';

/**
 * 웹앱·팝업이 새 런타임에 보내는 액션 표. 옛 `KidItemDomains.externalActions`에 같은 이름으로 등록되므로
 * 메시지 모양은 옛것과 같다: `{ action, ...fields }` → `{ success, ... } | { success: false, errorCode, error }`.
 * 로직 없음 — 검증하고 core로 넘긴다.
 */
export const OPERATION_START_ACTION = 'operation.start' as const;
export const OPERATION_CANCEL_ACTION = 'operation.cancel' as const;

/**
 * 사이트 자동 로그인에 쓸 저장 자격(KID-377). 웹이 그 몰의 저장 비밀번호를 읽어 실어 보내고, 확장은 그 실행 동안 메모리에만
 * 둔다(사이트 lease). 서버·plan·progress·result·로그·오류 details에 싣지 않는다.
 */
export const OperationStartCredentialsSchema = z.object({
  loginId: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
  supplierLoginId: z.string().min(1).max(200).nullable().optional(),
}).strict();

export const OperationStartMessageSchema = z.object({
  action: z.literal(OPERATION_START_ACTION),
  kind: OperationKindSchema,
  scope: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(1).max(128).optional(),
  credentials: OperationStartCredentialsSchema.optional(),
}).strict();
export type OperationStartMessage = z.infer<typeof OperationStartMessageSchema>;

export const OperationCancelMessageSchema = z.object({
  action: z.literal(OPERATION_CANCEL_ACTION),
  operationId: z.string().uuid(),
}).strict();
export type OperationCancelMessage = z.infer<typeof OperationCancelMessageSchema>;

/** start는 begin이 성공하면 바로 답하고(실행은 계속), 결과는 화면이 `GET /api/operations`로 본다. */
export type OperationStartResponse =
  | { success: true; operationId: string; reused: boolean }
  | { success: false; errorCode: string; error: string; details?: Record<string, unknown> | null };
