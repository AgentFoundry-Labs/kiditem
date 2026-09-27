import type { CapabilityDefinition } from "../../../common/capability-definition";

/**
 * Channels Agent capabilities. Empty since KID-364 (2026-09-27 leader decision): the registration-target execution
 * capabilities (prepare · get · start · report) and the server-run representative-image upload wrote the retired
 * registration execution table. An Agent-started mall write returns as one `prepare_registration_operation`
 * capability once KID-372 lets the extension claim a `prepared` operation; until then only the operator screens start one.
 */
export const CHANNELS_CAPABILITIES = [] as const satisfies readonly CapabilityDefinition[];

export type ChannelsCapabilityKey = never;
