import type { CapabilityCompositionProvider } from '../../../../../common/capability-composition';

export const SOURCING_CAPABILITY_COMPOSITION_PORT = Symbol(
  'SOURCING_CAPABILITY_COMPOSITION_PORT',
);

export interface SourcingCapabilityCompositionPort
  extends CapabilityCompositionProvider {}
