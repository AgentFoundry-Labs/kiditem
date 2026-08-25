import type { CapabilityCompositionProvider } from '../../../../../common/capability-composition';

export const CHANNELS_CAPABILITY_COMPOSITION_PORT = Symbol(
  'CHANNELS_CAPABILITY_COMPOSITION_PORT',
);

export interface ChannelsCapabilityCompositionPort
  extends CapabilityCompositionProvider {}
