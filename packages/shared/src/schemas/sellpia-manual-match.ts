import { z } from 'zod';
import { zIsoDate } from './common.js';

export const MAX_SELLPIA_MANUAL_MATCH_TARGETS = 20_000;
export const MAX_SELLPIA_MANUAL_MATCH_ROWS = 100_000;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

const SellpiaManualMatchCodeSchema = z.string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^\d+(?:-\d+)*$/);

export const SellpiaManualMatchRowSchema = z.object({
  productCode: SellpiaManualMatchCodeSchema,
  aliasTitle: z.string().trim().min(1).max(500),
  itemCount: z.number().int().min(1).max(POSTGRES_INTEGER_MAX),
  matchedType: z.enum(['M', 'P', 'E']),
  evidenceCount: z.number().int().min(1).max(MAX_SELLPIA_MANUAL_MATCH_ROWS),
}).strict();
export type SellpiaManualMatchRow = z.infer<typeof SellpiaManualMatchRowSchema>;

export const SellpiaManualMatchSnapshotSchema = z.object({
  source: z.literal('sellpia_product_manual_match'),
  version: z.literal(1),
  targetCount: z.number().int().min(0).max(MAX_SELLPIA_MANUAL_MATCH_TARGETS),
  targetCodes: z.array(SellpiaManualMatchCodeSchema)
    .max(MAX_SELLPIA_MANUAL_MATCH_TARGETS),
  rowCount: z.number().int().min(0).max(MAX_SELLPIA_MANUAL_MATCH_ROWS),
  rows: z.array(SellpiaManualMatchRowSchema).max(MAX_SELLPIA_MANUAL_MATCH_ROWS),
}).strict().superRefine((snapshot, ctx) => {
  if (snapshot.targetCount !== snapshot.targetCodes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetCount'],
      message: 'targetCount must equal targetCodes length',
    });
  }
  if (snapshot.rowCount !== snapshot.rows.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rowCount'],
      message: 'rowCount must equal rows length',
    });
  }

  const targets = new Set<string>();
  snapshot.targetCodes.forEach((code, index) => {
    const previous = snapshot.targetCodes[index - 1];
    if (previous !== undefined && code <= previous) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetCodes', index],
        message: code === previous
          ? 'targetCodes must be unique'
          : 'targetCodes must be sorted',
      });
    }
    targets.add(code);
  });

  let previousIdentity: string | null = null;
  snapshot.rows.forEach((row, index) => {
    if (!targets.has(row.productCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows', index, 'productCode'],
        message: 'row productCode must belong to targetCodes',
      });
    }
    const identity = [
      row.productCode,
      row.aliasTitle,
      String(row.itemCount).padStart(10, '0'),
      row.matchedType,
    ].join('\u0000');
    if (previousIdentity !== null && identity <= previousIdentity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows', index],
        message: identity === previousIdentity
          ? 'manual-match rows must be unique'
          : 'manual-match rows must be sorted',
      });
    }
    previousIdentity = identity;
  });
});
export type SellpiaManualMatchSnapshot = z.infer<
  typeof SellpiaManualMatchSnapshotSchema
>;

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

export const SellpiaManualMatchTargetsResponseSchema = z.object({
  sourceOrigin: z.literal('https://kiditem.sellpia.com'),
  sourcePath: z.literal('/product_manual_match.html'),
  version: z.literal(1),
  targetCount: z.number().int().min(0).max(MAX_SELLPIA_MANUAL_MATCH_TARGETS),
  targetCodes: z.array(SellpiaManualMatchCodeSchema)
    .max(MAX_SELLPIA_MANUAL_MATCH_TARGETS),
  currentSnapshot: SellpiaManualMatchSnapshotStatusSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.targetCount !== value.targetCodes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetCount'],
      message: 'targetCount must equal targetCodes length',
    });
  }
});
export type SellpiaManualMatchTargetsResponse = z.infer<
  typeof SellpiaManualMatchTargetsResponseSchema
>;

export const SellpiaManualMatchImportResponseSchema = z.object({
  status: SellpiaManualMatchSnapshotStatusSchema,
}).strict();
export type SellpiaManualMatchImportResponse = z.infer<
  typeof SellpiaManualMatchImportResponseSchema
>;

export const SellpiaManualMatchCollectionFailureCodeSchema = z.enum([
  'sellpia_manual_match_login_required',
  'sellpia_manual_match_contract_drift',
  'sellpia_manual_match_invalid_snapshot',
  'sellpia_manual_match_timeout',
  'sellpia_manual_match_network_failed',
]);
export type SellpiaManualMatchCollectionFailureCode = z.infer<
  typeof SellpiaManualMatchCollectionFailureCodeSchema
>;
