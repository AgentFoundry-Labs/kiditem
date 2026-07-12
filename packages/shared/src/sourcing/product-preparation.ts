import { z } from 'zod';

export const PRODUCT_PREPARATION_STATUSES = [
  'draft',
  'submitting',
  'registered',
  'failed',
  'cancelled',
] as const;

export const ProductPreparationStatusSchema = z.enum(PRODUCT_PREPARATION_STATUSES);

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
export type CreateProductPreparationInput = z.infer<typeof CreateProductPreparationInputSchema>;
export type UpdateProductPreparationInput = z.infer<typeof UpdateProductPreparationInputSchema>;
export type ProductPreparationCommandResult = z.infer<
  typeof ProductPreparationCommandResultSchema
>;
