import { describe, expect, it } from 'vitest';
import { DOMAIN_KEYS } from './domain-definition.registry';

describe('domain definition registry', () => {
  it('keeps the final code-owned domain catalog in canonical order', () => {
    expect(DOMAIN_KEYS).toEqual([
      'advertising', 'agent_os', 'ai', 'analytics', 'automation', 'channels',
      'finance', 'inventory', 'orders', 'operations', 'products', 'rules',
      'sourcing', 'supply',
    ]);
  });
});
