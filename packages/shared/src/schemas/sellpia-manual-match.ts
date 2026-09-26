import { z } from 'zod';
import { zIsoDate } from './common.js';
import { OperationViewSchema } from './operation.js';

export const SELLPIA_MANUAL_MATCH_SOURCE_TYPE = 'sellpia_product_manual_match' as const;
export const SELLPIA_MANUAL_MATCH_PARSER_VERSION = 'sellpia-manual-match-v1' as const;
export const SELLPIA_MANUAL_MATCH_SOURCE_ORIGIN = 'https://kiditem.sellpia.com' as const;
export const SELLPIA_MANUAL_MATCH_SOURCE_PATH = '/product_manual_match.html' as const;

export const MAX_SELLPIA_MANUAL_MATCH_TARGETS = 20_000;
export const MAX_SELLPIA_MANUAL_MATCH_ROWS = 100_000;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

const SellpiaManualMatchCodeSchema = z.string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^\d+(?:-\d+)*$/);

/**
 * 수동매칭 근거 한 줄(`match_results` 청크 원소, KID-363). 확장이 셀피아 수동상품매칭 화면에서 대상 코드마다 읽은
 * 매칭 제목·수량·매칭 종류를 모은 것이다. owner finalize가 현재 리스팅 이름에 있는 것만 별칭으로 남긴다.
 */
export const SellpiaManualMatchRowSchema = z.object({
  productCode: SellpiaManualMatchCodeSchema,
  aliasTitle: z.string().trim().min(1).max(500),
  itemCount: z.number().int().min(1).max(POSTGRES_INTEGER_MAX),
  matchedType: z.enum(['M', 'P', 'E']),
  evidenceCount: z.number().int().min(1).max(MAX_SELLPIA_MANUAL_MATCH_ROWS),
}).strict();
export type SellpiaManualMatchRow = z.infer<typeof SellpiaManualMatchRowSchema>;

export const SellpiaManualMatchSnapshotStatusSchema = z.object({
  targetCount: z.number().int().nonnegative(),
  matchedTargetCount: z.number().int().nonnegative(),
  aliasCount: z.number().int().nonnegative(),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: zIsoDate,
}).strict();
export type SellpiaManualMatchSnapshotStatus = z.infer<
  typeof SellpiaManualMatchSnapshotStatusSchema
>;

export const SellpiaManualMatchPlanSchema = z.object({
  sourceType: z.literal(SELLPIA_MANUAL_MATCH_SOURCE_TYPE),
  parserVersion: z.literal(SELLPIA_MANUAL_MATCH_PARSER_VERSION),
  sourceOrigin: z.literal(SELLPIA_MANUAL_MATCH_SOURCE_ORIGIN),
  sourcePath: z.literal(SELLPIA_MANUAL_MATCH_SOURCE_PATH),
  targetCount: z.number().int().min(0).max(MAX_SELLPIA_MANUAL_MATCH_TARGETS),
  targetCodes: z.array(SellpiaManualMatchCodeSchema)
    .max(MAX_SELLPIA_MANUAL_MATCH_TARGETS),
}).strict().superRefine((plan, ctx) => {
  if (plan.targetCount !== plan.targetCodes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetCount'],
      message: 'targetCount must equal targetCodes length',
    });
  }
  plan.targetCodes.forEach((code, index) => {
    const previous = plan.targetCodes[index - 1];
    if (previous !== undefined && code <= previous) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetCodes', index],
        message: code === previous
          ? 'targetCodes must be unique'
          : 'targetCodes must be sorted',
      });
    }
  });
});
export type SellpiaManualMatchPlan = z.infer<typeof SellpiaManualMatchPlanSchema>;

/**
 * 수동매칭 원천의 현재(`GET /channels/product-mappings/sellpia-manual-match/source`) — `channels.sellpia_manual_match`
 * 의 최근 실행(ADR-0025 실행 모양)과 게시된 스냅샷 요약.
 */
export const SellpiaManualMatchSourceStatusSchema = z.object({
  latestOperation: OperationViewSchema.nullable(),
  currentSnapshot: SellpiaManualMatchSnapshotStatusSchema.nullable(),
}).strict();
export type SellpiaManualMatchSourceStatus = z.infer<
  typeof SellpiaManualMatchSourceStatusSchema
>;

/** `channels.sellpia_manual_match` 실행의 `result`: 얼린 대상 수와 별칭이 하나라도 남은 대상 수. */
export const SellpiaManualMatchResultSchema = z.object({
  targets: z.number().int().min(0).max(MAX_SELLPIA_MANUAL_MATCH_TARGETS),
  matched: z.number().int().min(0).max(MAX_SELLPIA_MANUAL_MATCH_TARGETS),
}).strict();
export type SellpiaManualMatchResult = z.infer<typeof SellpiaManualMatchResultSchema>;
