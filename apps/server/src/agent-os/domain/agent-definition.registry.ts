import type { DomainKey } from './catalog/domain-definition.registry';

/** Code-owned business responsibility and prompt assignments. */
export const AGENT_DEFINITIONS: readonly {
  key: string;
  label: string;
  responsibility: string;
  assignedDomains: readonly DomainKey[];
  instructionProfileRef: string;
}[] = [
  {
    key: 'sourcing',
    label: 'Sourcing',
    responsibility: 'Supplier discovery, source evidence, candidate intake, and sourcing review.',
    assignedDomains: ['sourcing'],
    instructionProfileRef: 'agent-config/prompts/agents/sourcing.md',
  },
  {
    key: 'merchandising',
    label: 'Merchandising',
    responsibility: 'Canonical product and AI-backed merchandising preparation.',
    assignedDomains: ['products', 'ai'],
    instructionProfileRef: 'agent-config/prompts/agents/merchandising.md',
  },
  {
    key: 'supply',
    label: 'Supply',
    responsibility: 'Procurement planning, purchase-order drafting, and submission.',
    assignedDomains: ['supply'],
    instructionProfileRef: 'agent-config/prompts/agents/supply.md',
  },
  {
    key: 'channel_operations',
    label: 'Channel Operations',
    responsibility: 'Marketplace listing, order, and channel inventory operations.',
    assignedDomains: ['channels', 'orders', 'inventory'],
    instructionProfileRef: 'agent-config/prompts/agents/channel_operations.md',
  },
  {
    key: 'advertising',
    label: 'Advertising',
    responsibility: 'Advertising analysis and campaign operations.',
    assignedDomains: ['advertising'],
    instructionProfileRef: 'agent-config/prompts/agents/advertising.md',
  },
] as const;
