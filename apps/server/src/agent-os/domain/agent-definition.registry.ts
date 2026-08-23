import type { DomainKey } from './catalog/domain-definition.registry';

/** Code-owned durable Work assignments; immutable versions snapshot these values. */
export const AGENT_DEFINITIONS: readonly {
  key: string;
  assignedDomains: readonly DomainKey[];
}[] = [
  { key: 'operator', assignedDomains: ['agent_os', 'automation', 'operations'] },
  { key: 'sourcing', assignedDomains: ['sourcing'] },
  { key: 'merchandising', assignedDomains: ['products', 'ai'] },
  { key: 'supply', assignedDomains: ['supply'] },
  { key: 'channel_operations', assignedDomains: ['channels', 'orders', 'inventory'] },
  { key: 'advertising', assignedDomains: ['advertising'] },
] as const;
