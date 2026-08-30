import type { CapabilityCompositionProvider } from '../../../../../common/capability-composition';

export const PRODUCTS_CAPABILITY_COMPOSITION_PORT = Symbol(
  'PRODUCTS_CAPABILITY_COMPOSITION_PORT',
);

export interface ProductsCapabilityCompositionPort
  extends CapabilityCompositionProvider {}
