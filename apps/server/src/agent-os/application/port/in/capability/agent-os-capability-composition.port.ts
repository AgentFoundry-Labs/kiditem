import type { CapabilityCompositionProvider } from '../../../../../common/capability-composition';

export const AGENT_OS_CAPABILITY_COMPOSITION_PORT = Symbol(
  'AGENT_OS_CAPABILITY_COMPOSITION_PORT',
);

export interface AgentOsCapabilityCompositionPort
  extends CapabilityCompositionProvider {}
