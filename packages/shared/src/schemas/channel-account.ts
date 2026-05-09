import { z } from 'zod';
import { zIsoDate } from './common.js';

export const CoupangAccountSettingsSchema = z.object({
  configured: z.boolean(),
  vendorId: z.string().nullable(),
  accessKeyMasked: z.string().nullable(),
  hasAccessKey: z.boolean(),
  hasSecretKey: z.boolean(),
  status: z.string().nullable(),
  updatedAt: zIsoDate.nullable(),
});
export type CoupangAccountSettings = z.infer<typeof CoupangAccountSettingsSchema>;

export const UpdateCoupangAccountSettingsSchema = z.object({
  vendorId: z.string().trim().min(1),
  accessKey: z.string().trim().min(1).optional(),
  secretKey: z.string().trim().min(1).optional(),
});
export type UpdateCoupangAccountSettings = z.infer<typeof UpdateCoupangAccountSettingsSchema>;
