import {
  defineCapabilities,
  type CapabilityManifest,
} from '../../../common/capability-manifest';
import { CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT } from '../../application/port/in/capability/marketplace-registration.port';

export const CHANNELS_CAPABILITIES = defineCapabilities([
  {
    key: 'channels.register_confirmed_listing',
    ownerDomain: 'channels',
    kind: 'workflow',
    description:
      'Create or update a confirmed marketplace ChannelListing from an externally confirmed listing identity.',
    inputSchema: {
      masterId: 'string',
      channelAccountId: 'string',
      externalId: 'string',
      productBarcode: 'string|null',
      channelName: 'string|null',
      channelPrice: 'number|null',
    },
    outputSchema: {
      listingId: 'string',
      masterId: 'string',
      channel: 'string',
      channelAccountId: 'string',
      externalId: 'string',
      status: 'string|null',
    },
    effects: ['db_write'],
    approval: 'always',
    idempotency: 'required',
    visibility: 'agent',
    entrypoint: {
      type: 'incoming_port',
      token:
        CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT.description ??
        'CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT',
    },
  },
  {
    key: 'channels.submit_coupang_listing',
    ownerDomain: 'channels',
    kind: 'workflow',
    description:
      'Submit a full Coupang seller-product payload, then register the returned sellerProductId as a ChannelListing.',
    inputSchema: {
      masterId: 'string',
      channelAccountId: 'string',
      productBarcode: 'string|null',
      listingPayload: 'object',
    },
    outputSchema: {
      listingId: 'string',
      sellerProductId: 'string',
      masterId: 'string',
      channel: 'string',
      channelAccountId: 'string',
      externalId: 'string',
      status: 'string|null',
    },
    effects: ['external_write', 'db_write'],
    approval: 'always',
    idempotency: 'required',
    visibility: 'agent',
    entrypoint: {
      type: 'incoming_port',
      token:
        CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT.description ??
        'CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT',
    },
  },
] as const satisfies readonly CapabilityManifest[]);

export type ChannelsCapabilityKey = (typeof CHANNELS_CAPABILITIES)[number]['key'];
