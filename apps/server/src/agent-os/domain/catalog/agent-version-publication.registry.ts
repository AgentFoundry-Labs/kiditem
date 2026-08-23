import { createHash } from 'node:crypto';
import { AGENT_DEFINITIONS } from '../agent-definition.registry';
import { AGENT_OS_CAPABILITIES } from '../capability/agent-os.capabilities';
import { ANALYTICS_CAPABILITIES } from '../../../analytics/domain/capability/analytics.capabilities';
import { CHANNELS_CAPABILITIES } from '../../../channels/domain/capability/channels.capabilities';
import { PRODUCTS_CAPABILITIES } from '../../../products/domain/capability/products.capabilities';
import { SOURCING_CAPABILITIES } from '../../../sourcing/domain/capability/sourcing.capabilities';
import { SUPPLY_CAPABILITIES } from '../../../supply/domain/capability/supply.capabilities';

const capabilityCatalog = [
  ...AGENT_OS_CAPABILITIES,
  ...ANALYTICS_CAPABILITIES,
  ...CHANNELS_CAPABILITIES,
  ...PRODUCTS_CAPABILITIES,
  ...SOURCING_CAPABILITIES,
  ...SUPPLY_CAPABILITIES,
];

const explicitCapabilities: Record<string, readonly string[]> = {
  operator: ['agent_os.platform_probe', 'analytics.readOverview'],
  sourcing: ['sourcing.collect_shadow_signals'],
  merchandising: ['products.create_listing_generation_package'],
  supply: ['supply.create_purchase_order_draft', 'supply.submit_purchase_order'],
  channel_operations: ['channels.submit_wing_thumbnail'],
  advertising: [],
};

export interface AgentVersionPublicationDefinition {
  agentDefinitionKey: string;
  assignedDomains: readonly string[];
  capabilityKeys: readonly string[];
  runtimeType: 'codex_cli' | 'claude_cli';
  instructionProfileRef: string;
  manifestHash: string;
}

/** The published snapshot intentionally excludes models, policy and credentials. */
export const AGENT_VERSION_PUBLICATION_DEFINITIONS: readonly AgentVersionPublicationDefinition[] = AGENT_DEFINITIONS.map((agent) => {
  const capabilityKeys = explicitCapabilities[agent.key] ?? capabilityCatalog
  .filter((capability) => agent.assignedDomains.some((domain) => domain === capability.ownerDomain))
    .map((capability) => capability.key);
  const runtimeType: 'codex_cli' | 'claude_cli' = agent.key === 'sourcing' ? 'codex_cli' : 'claude_cli';
  const instructionProfileRef = `agent-config/prompts/agents/${agent.key}.md`;
  const snapshot = {
    agentDefinitionKey: agent.key,
    version: 1,
    assignedDomains: [...agent.assignedDomains].sort(),
    capabilityKeys: [...capabilityKeys].sort(),
    runtimeType,
    instructionProfileRef,
  };
  return { ...snapshot, manifestHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
});
