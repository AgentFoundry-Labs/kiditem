import { z } from 'zod';
import { zIsoDate } from '../schemas/common.js';

/**
 * 등록 설정(구 '준비')을 읽는 계약.
 *
 * 만들고 고치는 입력은 여기 없다 — 등록 설정을 만드는 길은
 * `channels/registration-targets`(resolve · create · update · archive) 하나다(KID-310 · ADR-0022).
 */

export const PRODUCT_PREPARATION_STATUSES = [
  'draft',
  'submitting',
  'registered',
  'failed',
  'cancelled',
] as const;

export const ProductPreparationStatusSchema = z.enum(PRODUCT_PREPARATION_STATUSES);

export const ProductPreparationProjectionSchema = z.object({
  id: z.string().uuid(),
  sourceCandidateId: z.string().uuid().nullable(),
  channelAccountId: z.string().uuid().nullable(),
  sourceContentWorkspaceId: z.string().uuid().nullable(),
  channelListingId: z.string().uuid().nullable(),
  status: ProductPreparationStatusSchema,
  selectedThumbnailUrl: z.string().nullable(),
  selectedThumbnailGenerationId: z.string().uuid().nullable(),
  selectedThumbnailGenerationCandidateId: z.string().uuid().nullable(),
  selectedDetailPageArtifactId: z.string().uuid().nullable(),
  selectedDetailPageRevisionId: z.string().uuid().nullable(),
  selectedDetailPageGenerationId: z.string().uuid().nullable(),
  updatedAt: zIsoDate.nullable(),
});

export const ProductPreparationCommandResultSchema = z.object({
  preparationId: z.string().uuid(),
  status: ProductPreparationStatusSchema,
  listingId: z.string().uuid().optional(),
}).strict();

export type ProductPreparationStatus = z.infer<typeof ProductPreparationStatusSchema>;
export type ProductPreparationProjection = z.infer<
  typeof ProductPreparationProjectionSchema
>;
export type ProductPreparationCommandResult = z.infer<
  typeof ProductPreparationCommandResultSchema
>;
