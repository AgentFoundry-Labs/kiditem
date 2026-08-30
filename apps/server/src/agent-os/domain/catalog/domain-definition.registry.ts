export const DOMAIN_KEYS = [
  'advertising', 'agent_os', 'ai', 'analytics', 'automation', 'channels',
  'finance', 'inventory', 'orders', 'operations', 'products', 'rules',
  'sourcing', 'supply',
] as const;

export type DomainKey = (typeof DOMAIN_KEYS)[number];
