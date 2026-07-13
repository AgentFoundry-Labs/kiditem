import { z } from 'zod';

// This compatibility subpath now owns only ContentWorkspace image contracts.
// Operational inventory is Sellpia MasterProduct; marketplace product/SKU
// metadata lives under the channels contracts.
export const MasterImageRoleSchema = z.enum([
  'box',
  'product',
  'color_variant',
  'size_chart',
  'detail',
]);
export type MasterImageRole = z.infer<typeof MasterImageRoleSchema>;

export const MasterImageItemSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().url(),
  storageKey: z.string().nullable().optional(),
  role: MasterImageRoleSchema,
  label: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  source: z.string().optional(),
  mimeType: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  isPrimary: z.boolean().optional(),
});
export type MasterImageItem = z.infer<typeof MasterImageItemSchema>;

export const GetMasterImagesResponseSchema = z.object({
  images: z.array(MasterImageItemSchema),
});
export type GetMasterImagesResponse = z.infer<typeof GetMasterImagesResponseSchema>;

export const UpdateMasterImagesRequestSchema = z.object({
  items: z.array(MasterImageItemSchema),
});
export type UpdateMasterImagesRequest = z.infer<typeof UpdateMasterImagesRequestSchema>;

export const UploadMasterImageResponseSchema = z.object({
  image: MasterImageItemSchema,
});
export type UploadMasterImageResponse = z.infer<typeof UploadMasterImageResponseSchema>;
