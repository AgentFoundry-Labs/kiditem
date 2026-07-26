import { z } from 'zod';

export const CoupangCategorySuggestionSchema = z
  .object({
    categoryCell: z.string().min(1),
    code: z.number().int().positive(),
    path: z.string().min(1),
    leaf: z.string().min(1),
    score: z.number().min(0).max(1),
    confidence: z.enum(['high', 'medium', 'low']),
    basedOn: z.array(z.string()).max(5),
    support: z.number().int().nonnegative(),
  })
  .strict();

export const CoupangCategorySuggestionRequestSchema = z
  .object({ names: z.array(z.string().min(1)).min(1).max(200) })
  .strict();

export const CoupangCategorySuggestionResultSchema = z
  .object({
    name: z.string(),
    suggestion: CoupangCategorySuggestionSchema.nullable(),
  })
  .strict();

export const CoupangCategorySuggestionResponseSchema = z
  .object({
    corpusSize: z.number().int().nonnegative(),
    results: z.array(CoupangCategorySuggestionResultSchema),
  })
  .strict();

export type CoupangCategorySuggestion = z.infer<typeof CoupangCategorySuggestionSchema>;
export type CoupangCategorySuggestionRequest = z.infer<
  typeof CoupangCategorySuggestionRequestSchema
>;
export type CoupangCategorySuggestionResult = z.infer<
  typeof CoupangCategorySuggestionResultSchema
>;
export type CoupangCategorySuggestionResponse = z.infer<
  typeof CoupangCategorySuggestionResponseSchema
>;
