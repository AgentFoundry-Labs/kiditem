import { createHash } from 'node:crypto';
import { AGENT_DEFINITIONS } from '../agent-definition.registry';
import { FINAL_CAPABILITY_DEFINITIONS } from './final-capability.catalog';

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
  const capabilityKeys = FINAL_CAPABILITY_DEFINITIONS
  .filter((capability) => agent.assignedDomains.includes(capability.ownerDomain))
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
