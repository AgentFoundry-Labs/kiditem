import { z } from 'zod';
import { zIsoDate } from '../schemas/common.js';

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

const EditablePreparationFieldsSchema = z.object({
  displayName: z.string().trim().min(1).max(500).optional(),
  registrationInput: z.record(z.unknown()).optional(),
  selectedThumbnailUrl: z.string().url().nullable().optional(),
  selectedThumbnailGenerationId: z.string().uuid().nullable().optional(),
  selectedThumbnailGenerationCandidateId: z.string().uuid().nullable().optional(),
  selectedDetailPageArtifactId: z.string().uuid().nullable().optional(),
  selectedDetailPageRevisionId: z.string().uuid().nullable().optional(),
  selectedDetailPageGenerationId: z.string().uuid().nullable().optional(),
});

export const CreateProductPreparationInputSchema = EditablePreparationFieldsSchema.extend({
  channelAccountId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(500),
  registrationInput: z.record(z.unknown()),
}).strict();

export const UpdateProductPreparationInputSchema = EditablePreparationFieldsSchema.strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one preparation field must be supplied.' },
);

export const ProductPreparationCommandResultSchema = z.object({
  preparationId: z.string().uuid(),
  status: ProductPreparationStatusSchema,
  listingId: z.string().uuid().optional(),
}).strict();

export type ProductPreparationStatus = z.infer<typeof ProductPreparationStatusSchema>;
export type ProductPreparationProjection = z.infer<
  typeof ProductPreparationProjectionSchema
>;
export type CreateProductPreparationInput = z.infer<typeof CreateProductPreparationInputSchema>;
export type UpdateProductPreparationInput = z.infer<typeof UpdateProductPreparationInputSchema>;
export type ProductPreparationCommandResult = z.infer<
  typeof ProductPreparationCommandResultSchema
>;
