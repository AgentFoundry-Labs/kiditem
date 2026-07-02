import {
  defineCapabilities,
  type CapabilityManifest,
} from '../../../common/capability-manifest';
import { AI_WING_REGISTRATION_CAPABILITY_PORT } from '../../application/port/in/capability/wing-registration.port';

export const AI_CAPABILITIES = defineCapabilities([
  {
    key: 'product_listing.submit_wing_thumbnail',
    ownerDomain: 'ai',
    kind: 'workflow',
    description: 'Submit an approved thumbnail generation result to Wing.',
    inputSchema: { generationId: 'string' },
    outputSchema: { success: 'boolean', screenshotPath: 'string|null' },
    effects: ['external_write', 'browser', 'db_write'],
    approval: 'always',
    idempotency: 'required',
    visibility: 'agent',
    entrypoint: {
      type: 'incoming_port',
      token:
        AI_WING_REGISTRATION_CAPABILITY_PORT.description ??
        'AI_WING_REGISTRATION_CAPABILITY_PORT',
    },
  },
] as const satisfies readonly CapabilityManifest[]);

export type AiCapabilityKey = (typeof AI_CAPABILITIES)[number]['key'];
