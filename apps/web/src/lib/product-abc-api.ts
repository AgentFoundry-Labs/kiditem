import { z } from 'zod';
import { SourceReadinessSchema } from '@kiditem/shared/source-readiness';
import { apiClient } from './api-client';

const CalendarDateSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-[0-3]\d$/);
export const ProductAbcRecalculationResponseSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('PUBLISHED'),
    publicationRevision: z.number().int().positive(),
    formulaRevision: z.number().int().positive(),
    officialCutoff: CalendarDateSchema,
    classifiedProductCount: z.number().int().nonnegative(),
    unclassifiedProductCount: z.number().int().nonnegative(),
    changedProductCount: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    outcome: z.literal('SOURCE_NOT_READY'),
    publicationRevision: z.number().int().nonnegative(),
    officialCutoff: CalendarDateSchema.nullable(),
    actualCutoff: CalendarDateSchema.nullable(),
    sources: z.object({
      sellpia: SourceReadinessSchema,
      advertising: SourceReadinessSchema,
    }).strict(),
    // Present when no source pair exists while a source reads ready.
    pairing: z.object({
      lateSource: z.enum(['sellpia', 'advertising']),
      sellpiaEndDate: CalendarDateSchema,
      advertisingEndDate: CalendarDateSchema,
    }).strict().optional(),
  }).strict(),
]);

export type ProductAbcRecalculationResponse = z.infer<
  typeof ProductAbcRecalculationResponseSchema
>;

export async function recalculateProductAbc(): Promise<ProductAbcRecalculationResponse> {
  const response = await apiClient.post<unknown>(
    '/api/products/abc/recalculate',
    undefined,
    { timeoutMs: null },
  );
  return ProductAbcRecalculationResponseSchema.parse(response);
}
