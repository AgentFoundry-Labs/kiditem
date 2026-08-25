import type { AgentKey } from '@kiditem/shared/agent-runtime';
import advertising from '../../../../agent-config/prompts/agents/advertising.md?raw';
import channelOperations from '../../../../agent-config/prompts/agents/channel_operations.md?raw';
import chat from '../../../../agent-config/prompts/agents/chat.md?raw';
import merchandising from '../../../../agent-config/prompts/agents/merchandising.md?raw';
import sourcing from '../../../../agent-config/prompts/agents/sourcing.md?raw';
import supply from '../../../../agent-config/prompts/agents/supply.md?raw';

export interface GatewayAgentProfile {
  readonly key: AgentKey;
  readonly label: string;
  /** Exact checked-in profile snapshot, bundled into the Gateway artifact. */
  readonly instructions: string;
}

export interface GatewayInstructionProfile {
  /** Immutable descriptor selection; null is the General chat profile. */
  readonly selectedAgentKey: AgentKey | null;
  readonly selectedInstructions: string;
  /** Exact named definitions available only to provider-native subagents. */
  readonly delegationProfiles: readonly GatewayAgentProfile[];
}

/**
 * The native Gateway owns this bounded profile catalog. Its content is bundled
 * directly from the current checked-in Agent profile snapshots, never supplied
 * by Nest or the browser.
 */
export const GATEWAY_AGENT_PROFILE_CATALOG: readonly GatewayAgentProfile[] = Object.freeze([
  Object.freeze({ key: 'sourcing', label: 'Sourcing', instructions: sourcing }),
  Object.freeze({ key: 'merchandising', label: 'Merchandising', instructions: merchandising }),
  Object.freeze({ key: 'supply', label: 'Supply', instructions: supply }),
  Object.freeze({ key: 'channel_operations', label: 'Channel Operations', instructions: channelOperations }),
  Object.freeze({ key: 'advertising', label: 'Advertising', instructions: advertising }),
]);

const BY_KEY = new Map(GATEWAY_AGENT_PROFILE_CATALOG.map((profile) => [profile.key, profile]));

export function gatewayInstructionProfile(agentKey: AgentKey | null): GatewayInstructionProfile {
  const selected = agentKey === null ? chat : BY_KEY.get(agentKey)?.instructions;
  if (!selected) throw new Error('gateway_agent_profile_unavailable');
  return Object.freeze({
    selectedAgentKey: agentKey,
    selectedInstructions: selected,
    delegationProfiles: GATEWAY_AGENT_PROFILE_CATALOG,
  });
}

/** Codex has no custom-agent registry surface: bind all exact profiles into its developer instructions. */
export function codexDeveloperInstructions(profile: GatewayInstructionProfile): string {
  return [
    profile.selectedInstructions.trim(),
    '## KidItem native delegation profiles',
    'For a cross-Agent mutation, create a provider-native subagent and bind exactly one named profile below as its developer instructions. Do not create a KidItem-side subagent record.',
    ...profile.delegationProfiles.map((entry) => `### ${entry.key}\n${entry.instructions.trim()}`),
  ].join('\n\n');
}

/** Claude receives its selected profile and a bounded --agents registry for native subagent orchestration. */
export function claudeAgentDefinitions(profile: GatewayInstructionProfile): Record<string, Readonly<{ description: string; prompt: string }>> {
  return Object.freeze(Object.fromEntries(profile.delegationProfiles.map((entry) => [entry.key, Object.freeze({
    description: `KidItem ${entry.label} Agent`,
    prompt: entry.instructions,
  })])));
}
