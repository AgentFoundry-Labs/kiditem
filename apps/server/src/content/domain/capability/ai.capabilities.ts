import type { CapabilityDefinition } from '../../../common/capability-definition';

/** AI is a dependency of owner capabilities; it has no Agent-facing capability today. */
export const AI_CAPABILITIES = [] as const satisfies readonly CapabilityDefinition[];

export type AiCapabilityKey = (typeof AI_CAPABILITIES)[number]['key'];
