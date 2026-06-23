import { describe, expect, it } from 'vitest';
import { AI_WING_REGISTRATION_CAPABILITY_PORT } from '../application/port/in/capability/wing-registration.port';
import { AI_CAPABILITIES } from '../domain/capability/ai.capabilities';

describe('AI capability manifest', () => {
  it('publishes approval-gated Wing thumbnail submission as an external write', () => {
    expect(AI_CAPABILITIES.map((capability) => capability.key)).toEqual([
      'product_listing.submit_wing_thumbnail',
    ]);

    expect(AI_CAPABILITIES[0]).toMatchObject({
      key: 'product_listing.submit_wing_thumbnail',
      ownerDomain: 'ai',
      kind: 'workflow',
      effects: ['external_write', 'browser', 'db_write'],
      approval: 'always',
      idempotency: 'required',
      visibility: 'agent',
      entrypoint: {
        type: 'incoming_port',
        token: AI_WING_REGISTRATION_CAPABILITY_PORT.description,
      },
    });
  });
});
