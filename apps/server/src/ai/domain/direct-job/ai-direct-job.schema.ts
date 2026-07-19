import { z } from 'zod';
import {
  DetailPageGenerateDirectInputSchema,
  DetailPageGenerateDirectOutputSchema,
  ImageEditDirectInputSchema,
  ImageEditDirectOutputSchema,
  ThumbnailGenerateDirectInputSchema,
  ThumbnailGenerateDirectOutputSchema,
} from '../direct-generation';

export const AiDirectJobTypeSchema = z.enum([
  'thumbnail_generate',
  'thumbnail_reedit',
  'detail_page_generate',
  'image_edit',
]);

export const AiDirectJobStatusSchema = z.enum([
  'held',
  'pending',
  'running',
  'projecting',
  'succeeded',
  'failed',
  'cancelled',
]);

export const QueuedThumbnailInputImageSchema = z
  .object({
    mimeType: z.string().min(1),
    label: z.string(),
    url: z.string().min(1),
    storageKey: z.string().nullable(),
    role: z.enum(['product', 'box', 'color_variant', 'detail']),
    sortOrder: z.number().int(),
    source: z.string(),
    fileSize: z.number().int().nullable(),
  })
  .strict();

export const QueuedThumbnailDirectInputSchema =
  ThumbnailGenerateDirectInputSchema.omit({ inputs: true })
    .extend({ inputs: z.array(QueuedThumbnailInputImageSchema).min(1) })
    .strict();

export const ThumbnailReeditDirectInputSchema = z
  .object({
    generationId: z.string().uuid(),
    purpose: z.enum(['compliance', 'quality']),
    variantKey: z.enum(['auto', 'with-box', 'no-box']),
  })
  .strict();

const ImageModelPlanSchema = z
  .object({ image: z.string().trim().min(1) })
  .strict();
const DetailPageModelPlanSchema = z
  .object({
    image: z.string().trim().min(1),
    text: z.string().trim().min(1),
    vision: z.string().trim().min(1),
  })
  .strict();

export const AiDirectJobEnvelopeSchema = z.discriminatedUnion('jobType', [
  z
    .object({
      jobType: z.literal('thumbnail_generate'),
      models: ImageModelPlanSchema,
      input: QueuedThumbnailDirectInputSchema,
    })
    .strict(),
  z
    .object({
      jobType: z.literal('thumbnail_reedit'),
      models: ImageModelPlanSchema,
      input: ThumbnailReeditDirectInputSchema,
    })
    .strict(),
  z
    .object({
      jobType: z.literal('detail_page_generate'),
      models: DetailPageModelPlanSchema,
      input: DetailPageGenerateDirectInputSchema,
    })
    .strict(),
  z
    .object({
      jobType: z.literal('image_edit'),
      models: ImageModelPlanSchema,
      input: ImageEditDirectInputSchema,
    })
    .strict(),
]);

export const AiDirectJobCheckpointSchema = z.discriminatedUnion('jobType', [
  z.object({
    jobType: z.literal('thumbnail_generate'),
    result: ThumbnailGenerateDirectOutputSchema,
  }),
  z.object({
    jobType: z.literal('thumbnail_reedit'),
    result: z.object({ completed: z.literal(true) }).strict(),
  }),
  z.object({
    jobType: z.literal('detail_page_generate'),
    result: DetailPageGenerateDirectOutputSchema,
  }),
  z.object({
    jobType: z.literal('image_edit'),
    result: ImageEditDirectOutputSchema,
  }),
]);

export type AiDirectJobType = z.infer<typeof AiDirectJobTypeSchema>;
export type AiDirectJobStatus = z.infer<typeof AiDirectJobStatusSchema>;
export type AiDirectJobEnvelope = z.infer<typeof AiDirectJobEnvelopeSchema>;
export type AiDirectJobModels = AiDirectJobEnvelope['models'];
export type QueuedThumbnailDirectInput = z.infer<
  typeof QueuedThumbnailDirectInputSchema
>;
export type QueuedThumbnailInputImage = z.infer<
  typeof QueuedThumbnailInputImageSchema
>;
