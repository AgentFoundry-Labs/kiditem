/**
 * Detail-page direct generation input/output contract.
 *
 * `result` 의 모양은 ai 도메인이 이미 보유한 templateId 별 1-call schema 와
 * 1:1 대응한다 (`apps/server/src/ai/domain/prompts/detail-page/single-call.ts`,
 * `apps/server/src/ai/domain/prompts/bold-vertical/single-call.ts`).
 *
 * Domain 계층이라 Nest/Prisma/HTTP 의존이 없다. Zod 만 사용한다.
 */
import { z } from 'zod';
import {
  DetailImageCountSchema,
  DetailPageAgeGroupSchema,
  DetailPageTemplateIdSchema,
} from '@kiditem/shared/ai';
import { DetailPageGenerationSchema } from '../prompts/detail-page/single-call';
import { RefinedBoldVerticalGenerationSchema } from '../prompts/bold-vertical/single-call';

/**
 * Payload shape that the direct job forwards to the provider. We accept it
 * loosely here — the AI domain orchestrator owns the strong shape on the way
 * in, while the provider prompt is responsible for echoing `templateId` back
 * so the sink can route the result.
 */
export const DetailPageGenerateDirectInputSchema = z.object({
  templateId: DetailPageTemplateIdSchema,
  generationMode: z.enum(['draft', 'image', 'full']).optional().default('full'),
  existingResult: z.unknown().optional(),
  raw: z
    .object({
      rawTitle: z.string(),
      rawCategory: z.string().optional().default(''),
      rawDescription: z.string().optional().default(''),
      rawOptions: z.string().optional().default(''),
      imageUrls: z.array(z.string()).default([]),
      ageGroup: DetailPageAgeGroupSchema.optional().default('age-8-plus'),
      detailImageCount: DetailImageCountSchema.optional().default('2'),
      usageSectionMode: z.enum(['include', 'exclude']).optional().default('include'),
      kcCertificationStatus: z.enum(['unknown', 'none', 'exists']).optional().default('unknown'),
      kcCertificationNumber: z.string().max(80).optional().default(''),
    })
    .passthrough(),
  heroImageMode: z.enum(['first', 'llm-pick']).default('first'),
  reservedPackageImageIndices: z
    .array(z.number().int().nonnegative())
    .optional(),
  safetyLabelImageIndices: z
    .array(z.number().int().nonnegative())
    .optional(),
});

export const DetailPageGenerateDirectOutputSchema = z.discriminatedUnion(
  'templateId',
  [
    z.object({
      templateId: z.literal('kids-playful'),
      result: DetailPageGenerationSchema,
      imageUrls: z.array(z.string()).default([]),
      processedImages: z.record(z.string(), z.string()).default({}),
      reservedPackageImageIndices: z
        .array(z.number().int().nonnegative())
        .default([]),
      safetyLabelImageIndices: z
        .array(z.number().int().nonnegative())
        .default([]),
    }),
    z.object({
      templateId: z.literal('bold-vertical'),
      result: RefinedBoldVerticalGenerationSchema,
      imageUrls: z.array(z.string()).default([]),
      processedImages: z.record(z.string(), z.string()).default({}),
    }),
  ],
);

export type DetailPageGenerateDirectInput = z.infer<
  typeof DetailPageGenerateDirectInputSchema
>;
export type DetailPageGenerateDirectOutput = z.infer<
  typeof DetailPageGenerateDirectOutputSchema
>;
