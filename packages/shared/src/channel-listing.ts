import { z } from 'zod';

export const MarketplaceSubmissionResultSchema = z.object({
  providerSubmissionId: z.string().trim().min(1).nullable().optional(),
  externalListingId: z.string().trim().min(1),
  channel: z.string().trim().min(1),
  rawResult: z.unknown(),
}).strict();

export const ChannelListingRegistrationResultSchema = z.object({
  listingId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  channel: z.string().trim().min(1),
  externalId: z.string().trim().min(1),
  status: z.string().nullable().optional(),
}).strict();

export type MarketplaceSubmissionResult = z.infer<typeof MarketplaceSubmissionResultSchema>;
export type ChannelListingRegistrationResult = z.infer<
  typeof ChannelListingRegistrationResultSchema
>;
