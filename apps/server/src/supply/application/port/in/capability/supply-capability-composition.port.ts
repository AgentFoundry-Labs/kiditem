import type { CapabilityCompositionProvider } from '../../../../../common/capability-composition';

export const SUPPLY_CAPABILITY_COMPOSITION_PORT = Symbol(
  'SUPPLY_CAPABILITY_COMPOSITION_PORT',
);

export interface SupplyCapabilityCompositionPort
  extends CapabilityCompositionProvider {}
