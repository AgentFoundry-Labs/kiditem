import { z } from 'zod';

export const ProductAbcGradeSchema = z.enum(['A', 'B', 'C']);
export type ProductAbcGrade = z.infer<typeof ProductAbcGradeSchema>;

export const MasterProductAbcMetricSchema = z.enum([
  'SALES_QUANTITY',
  'SALES_AMOUNT',
]);
export type MasterProductAbcMetric = z.infer<typeof MasterProductAbcMetricSchema>;

export const MasterProductAbcPeriodDaysSchema = z.union([
  z.literal(30),
  z.literal(90),
  z.literal(180),
  z.literal(360),
]);
export type MasterProductAbcPeriodDays = z.infer<
  typeof MasterProductAbcPeriodDaysSchema
>;

export const MasterProductAbcPolicySchema = z
  .object({
    metric: MasterProductAbcMetricSchema,
    periodDays: MasterProductAbcPeriodDaysSchema,
    aCumulativeThreshold: z.number().int().min(1).max(99),
    bCumulativeThreshold: z.number().int().min(2).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.aCumulativeThreshold >= value.bCumulativeThreshold) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bCumulativeThreshold'],
        message: 'bCumulativeThreshold must be greater than aCumulativeThreshold',
      });
    }
  });
export type MasterProductAbcPolicy = z.infer<
  typeof MasterProductAbcPolicySchema
>;

export const UpdateMasterProductAbcPolicySchema = MasterProductAbcPolicySchema;
export type UpdateMasterProductAbcPolicy = z.infer<
  typeof UpdateMasterProductAbcPolicySchema
>;

export const MasterProductAbcGradeResultSchema = z
  .object({
    masterProductId: z.string().uuid(),
    abcGrade: ProductAbcGradeSchema.nullable(),
  })
  .strict();
export type MasterProductAbcGradeResult = z.infer<
  typeof MasterProductAbcGradeResultSchema
>;

export const MasterProductAbcRecalculationResultSchema = z
  .object({
    changedProductCount: z.number().int().nonnegative(),
    classifiedProductCount: z.number().int().nonnegative(),
    unclassifiedProductCount: z.number().int().nonnegative(),
    grades: z.array(MasterProductAbcGradeResultSchema),
  })
  .strict();
export type MasterProductAbcRecalculationResult = z.infer<
  typeof MasterProductAbcRecalculationResultSchema
>;
