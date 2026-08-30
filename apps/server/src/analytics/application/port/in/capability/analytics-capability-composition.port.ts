import type { CapabilityCompositionProvider } from '../../../../../common/capability-composition';

export const ANALYTICS_CAPABILITY_COMPOSITION_PORT = Symbol(
  'ANALYTICS_CAPABILITY_COMPOSITION_PORT',
);

export interface AnalyticsCapabilityCompositionPort
  extends CapabilityCompositionProvider {}
