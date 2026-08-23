import { z } from 'zod';
import type { CapabilityDefinition } from '../../../common/capability-definition';

const Uuid = z.string().uuid();
const Identifier = z.string().trim().min(1).max(256);
const FrozenSubmissionInput = z.object({
  executionId: Uuid, preparationId: Uuid, sourceCandidateId: Uuid, channelAccountId: Uuid,
  submissionKey: Identifier, submissionPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  submissionPayloadJson: z.record(z.unknown()), providerSubmissionId: Identifier.nullable(), registrationResult: z.unknown(),
  isRetry: z.boolean(), providerOutcome: z.enum(['not_attempted', 'uncertain', 'succeeded', 'definitive_failure']), providerCreateAllowed: z.boolean(),
  masterProductId: Uuid.optional(),
  optionLinks: z.array(z.object({ externalOptionId: Identifier, sellpiaInventorySkuId: Uuid, quantity: z.number().int().positive() }).strict()).max(100),
}).strict();
const ListingOutput = z.object({ preparationId: Uuid, listingId: Uuid.nullable(), status: z.enum(['registered', 'failed']) }).strict();

/** Channels owns provider submission and ChannelListing mutation. */
export const CHANNELS_CAPABILITIES = [
  {
    key: 'channels.register_confirmed_listing', ownerDomain: 'channels', ownerInputPort: 'channels.registerConfirmedListing',
    description: 'Resolve an externally confirmed frozen marketplace submission into a local ChannelListing.',
    inputSchema: FrozenSubmissionInput.extend({
      externalListingId: Identifier, displayName: z.string().trim().min(1).max(500),
      confirmationEvidence: z.object({
        wingVendorId: z.string().trim().min(1).max(80),
        wingIdentitySource: z.enum(['dom:data-vendor-id', 'meta:vendor-id', 'url:vendorId', 'dom:vendor-code-label', 'dom:inline-script']),
      }).strict(),
    }).strict(),
    outputSchema: ListingOutput,
    effects: ['db_write'], approvalRisk: 'medium', idempotency: 'required',
  },
  {
    key: 'channels.submit_coupang_listing', ownerDomain: 'channels', ownerInputPort: 'channels.submitCoupangListing',
    description: 'Submit a frozen Coupang payload through Channels and resolve its local ChannelListing.',
    inputSchema: FrozenSubmissionInput, outputSchema: ListingOutput,
    effects: ['external_write', 'db_write'], approvalRisk: 'high', idempotency: 'required',
  },
  {
    key: 'channels.submit_wing_thumbnail', ownerDomain: 'channels', ownerInputPort: 'channels.submitWingThumbnail',
    description: 'Submit an approved generated thumbnail to Coupang Wing through the Channels owner.',
    inputSchema: z.object({ generationId: Identifier }).strict(),
    outputSchema: z.object({ success: z.boolean(), screenshotPath: z.string().nullable() }).strict(),
    effects: ['browser', 'external_write', 'db_write'], approvalRisk: 'high', idempotency: 'required',
  },
] as const satisfies readonly CapabilityDefinition[];

export type ChannelsCapabilityKey = (typeof CHANNELS_CAPABILITIES)[number]['key'];
