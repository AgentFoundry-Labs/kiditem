import { z } from 'zod';
import { OperationKindSchema } from '@kiditem/shared/operation';

/**
 * 웹앱·팝업이 새 런타임에 보내는 액션 표. 옛 `KidItemDomains.externalActions`에 같은 이름으로 등록되므로
 * 메시지 모양은 옛것과 같다: `{ action, ...fields }` → `{ success, ... } | { success: false, errorCode, error }`.
 * 로직 없음 — 검증하고 core로 넘긴다.
 */
export const OPERATION_START_ACTION = 'operation.start' as const;
export const OPERATION_CANCEL_ACTION = 'operation.cancel' as const;

export const OperationStartMessageSchema = z.object({
  action: z.literal(OPERATION_START_ACTION),
  kind: OperationKindSchema,
  scope: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(1).max(128).optional(),
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
