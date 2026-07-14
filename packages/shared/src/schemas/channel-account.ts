import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ChannelAccountListItemSchema = z.object({
  id: z.string().uuid(),
  channel: z.string().min(1),
  name: z.string().min(1),
  externalAccountId: z.string().nullable(),
  vendorId: z.string().nullable(),
  sellerId: z.string().nullable(),
  isPrimary: z.boolean(),
});
export type ChannelAccountListItem = z.infer<typeof ChannelAccountListItemSchema>;

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
