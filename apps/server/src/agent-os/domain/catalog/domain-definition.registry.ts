export const DOMAIN_KEYS = [
  'advertising', 'ai', 'analytics', 'channels', 'inventory', 'orders',
  'products', 'sourcing', 'supply',
] as const;

export type DomainKey = (typeof DOMAIN_KEYS)[number];
