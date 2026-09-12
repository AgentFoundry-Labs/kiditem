import { z } from 'zod';

/**
 * 쇼핑몰 에이전트의 기억 — 몰에서 한 일의 결과 한 줄.
 *
 * 결과가 난 자리(주문수집 · 송장 전송 · 등록 폼 채움 · 로그인 테스트 · 로그인 확인)에서 웹이
 * 한 번 쓰고, 쇼핑몰 홈이 요약을 읽는다. 비밀번호 · 받는 사람 · 주소 · 주문번호 같은 값은
 * 담지 않는다 — 개수와 이유 코드, 짧은 요약만. 요청은 `.strict()` 라 모르는 키(예:
 * organizationId, password)는 거절된다. 조직과 사람은 서버가 세션에서 붙인다.
 */
export const MALL_OPERATION_KINDS = [
  'order_collection',
  /** 수집한 주문을 셀피아로 보냄. 몰별 '신규(미전송)'를 서버에서 계산하는 근거다. */
  'sellpia_transfer',
  'tracking_upload',
  'registration_fill',
  'login_test',
  'login_check',
] as const;
export const MallOperationKindSchema = z.enum(MALL_OPERATION_KINDS);
export type MallOperationKind = z.infer<typeof MallOperationKindSchema>;

/**
 * 결과. `attention` 은 사람이 이어서 해야 하는 상태다(로그인 필요 · 폼은 채웠고 제출은 사람 ·
 * 파일은 만들었고 업로드는 사람). 폼을 채운 것을 `succeeded` 로 적지 않는다.
 */
export const MALL_OPERATION_OUTCOMES = ['succeeded', 'empty', 'attention', 'failed', 'cancelled'] as const;
export const MallOperationOutcomeValueSchema = z.enum(MALL_OPERATION_OUTCOMES);
export type MallOperationOutcomeValue = z.infer<typeof MallOperationOutcomeValueSchema>;

/** 누가 시작했나 — 사람이 누름 · 여러 몰을 한 번에 · 화면이 알아서. */
export const MALL_OPERATION_TRIGGERS = ['manual', 'batch', 'auto'] as const;
export const MallOperationTriggerSchema = z.enum(MALL_OPERATION_TRIGGERS);
export type MallOperationTrigger = z.infer<typeof MallOperationTriggerSchema>;

const CountSchema = z.number().int().min(0).max(1_000_000);

export const RecordMallOperationOutcomeRequestSchema = z
  .object({
    /** 같은 결과를 두 번 보내도 한 줄만 남도록 클라이언트가 만든다. */
    idempotencyKey: z.string().uuid(),
    mallKey: z.string().trim().min(1).max(80),
    operation: MallOperationKindSchema,
    outcome: MallOperationOutcomeValueSchema,
    /** 기계가 읽는 이유 — `login_required`, `manual_submit_required` 같은 snake_case. */
    reasonCode: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/).nullable().optional(),
    /** 사람이 읽는 짧은 요약. 개인 정보를 넣지 않는다. */
    message: z.string().trim().max(300).nullable().optional(),
    itemCount: CountSchema.nullable().optional(),
    failedCount: CountSchema.nullable().optional(),
    warningCount: CountSchema.nullable().optional(),
    trigger: MallOperationTriggerSchema.nullable().optional(),
    /** 브라우저 수집 run 과 이어 볼 때만. */
    runId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type RecordMallOperationOutcomeRequest = z.infer<typeof RecordMallOperationOutcomeRequestSchema>;

export const MallOperationOutcomeItemSchema = z.object({
  id: z.string().uuid(),
  mallKey: z.string(),
  operation: MallOperationKindSchema,
  outcome: MallOperationOutcomeValueSchema,
  reasonCode: z.string().nullable(),
  message: z.string().nullable(),
  itemCount: z.number().int().nullable(),
  failedCount: z.number().int().nullable(),
  warningCount: z.number().int().nullable(),
  trigger: MallOperationTriggerSchema.nullable(),
  runId: z.string().nullable(),
  occurredAt: z.string(),
});
export type MallOperationOutcomeItem = z.infer<typeof MallOperationOutcomeItemSchema>;

export const MallOperationOutcomeListSchema = z.object({
  items: z.array(MallOperationOutcomeItemSchema),
});
export type MallOperationOutcomeList = z.infer<typeof MallOperationOutcomeListSchema>;

export const MallOperationOutcomeCountsSchema = z.object({
  succeeded: z.number().int(),
  empty: z.number().int(),
  attention: z.number().int(),
  failed: z.number().int(),
  cancelled: z.number().int(),
});
export type MallOperationOutcomeCounts = z.infer<typeof MallOperationOutcomeCountsSchema>;

/** 몰 · 작업마다 가장 최근 결과와, 기간 안의 결과별 건수. */
export const MallOperationOutcomeSummaryRowSchema = z.object({
  mallKey: z.string(),
  operation: MallOperationKindSchema,
  latest: MallOperationOutcomeItemSchema,
  counts: MallOperationOutcomeCountsSchema,
});
export type MallOperationOutcomeSummaryRow = z.infer<typeof MallOperationOutcomeSummaryRowSchema>;

export const MallOperationOutcomeSummarySchema = z.object({
  since: z.string(),
  days: z.number().int(),
  total: z.number().int(),
  rows: z.array(MallOperationOutcomeSummaryRowSchema),
});
export type MallOperationOutcomeSummary = z.infer<typeof MallOperationOutcomeSummarySchema>;
