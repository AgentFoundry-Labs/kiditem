import { z } from 'zod';

/**
 * 쇼핑몰 에이전트의 관찰 기록 — source owner 가 없는 몰 작업의 결과 한 줄.
 *
 * 로그인 확인 · 로그인 테스트 · 등록 폼 채움만 담는다. 주문수집 · 셀피아 전송 · 송장 전송의
 * 결과는 Orders 가 수집 시도와 전송 기록으로 이미 가지고 있으므로 여기 적지 않는다.
 * 비밀번호 · 받는 사람 · 주소 · 주문번호 같은 값은 담지 않는다 — 개수와 이유 코드, 짧은
 * 요약만. 요청은 `.strict()` 라 모르는 키(예: organizationId, password)는 거절된다. 조직과
 * 사람은 서버가 세션에서 붙인다.
 *
 * 줄이 쌓이는 키는 계정 행을 함께 쓰는 채널을 접은 값이다 — 쓰는 쪽과 읽는 쪽이 채널
 * 레지스트리의 `channelOutcomeKey` 하나를 함께 쓴다(`@kiditem/shared/channel-registry`).
 */
export const MALL_OPERATION_KINDS = ['login_check', 'login_test', 'registration_fill'] as const;
export const MallOperationKindSchema = z.enum(MALL_OPERATION_KINDS);
export type MallOperationKind = z.infer<typeof MallOperationKindSchema>;

/**
 * 결과. `attention` 은 사람이 이어서 해야 하는 상태다(로그인 필요 · 폼은 채웠고 제출은 사람).
 * 폼을 채운 것을 `succeeded` 로 적지 않는다.
 */
export const MALL_OPERATION_OUTCOMES = ['succeeded', 'empty', 'attention', 'failed', 'cancelled'] as const;
export const MallOperationOutcomeValueSchema = z.enum(MALL_OPERATION_OUTCOMES);
export type MallOperationOutcomeValue = z.infer<typeof MallOperationOutcomeValueSchema>;

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
    /**
     * 사람이 읽는 짧은 요약. 개인 정보를 넣지 않는다. 이유 코드가 있으면 비운다 — 무슨 일인지는
     * 코드가 말하고, 몰이 돌려준 문장에는 아이디 · 주문번호가 섞여 들어온다.
     */
    message: z.string().trim().max(300).nullable().optional(),
    itemCount: CountSchema.nullable().optional(),
    failedCount: CountSchema.nullable().optional(),
    warningCount: CountSchema.nullable().optional(),
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
  occurredAt: z.string(),
});
export type MallOperationOutcomeItem = z.infer<typeof MallOperationOutcomeItemSchema>;

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
