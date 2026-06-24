import { describe, expect, it } from 'vitest';
import { CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT } from '../application/port/in/capability/marketplace-registration.port';
import { CHANNELS_CAPABILITIES } from '../domain/capability/channels.capabilities';

describe('channels capability manifest', () => {
  it('publishes the Agent OS confirmed listing registration workflow', () => {
    expect(CHANNELS_CAPABILITIES.map((capability) => capability.key)).toEqual([
      'channels.register_confirmed_listing',
      'channels.submit_coupang_listing',
    ]);
    expect(CHANNELS_CAPABILITIES[0]).toMatchObject({
      key: 'channels.register_confirmed_listing',
      ownerDomain: 'channels',
      kind: 'workflow',
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
        token: CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT.description,
      },
    });
    expect(CHANNELS_CAPABILITIES[1]).toMatchObject({
      key: 'channels.submit_coupang_listing',
      ownerDomain: 'channels',
      kind: 'workflow',
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
        token: CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT.description,
      },
    });
  });
});
