import {
  defineCapabilities,
  type CapabilityManifest,
} from '../../../common/capability-manifest';
import { AI_WING_REGISTRATION_CAPABILITY_PORT } from '../../application/port/in/capability/wing-registration.port';

export const AI_CAPABILITIES = defineCapabilities([] as const satisfies readonly CapabilityManifest[]);

export type AiCapabilityKey = (typeof AI_CAPABILITIES)[number]['key'];
