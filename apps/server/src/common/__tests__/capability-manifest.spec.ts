import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  assertCapabilityDefinitions,
  type CapabilityDefinition,
} from '../capability-definition';

describe('common capability definition contract', () => {
  it('checks final owner definitions without legacy kind, visibility, approval, or entrypoint metadata', () => {
    const definitions = [
      {
        key: 'example.read',
        ownerDomain: 'analytics',
        ownerInputPort: 'analytics.readExample',
        description: 'Read example data.',
        inputSchema: z.object({ query: z.string() }).strict(),
        outputSchema: z.object({ count: z.number() }).strict(),
        effects: ['read'],
        approvalRisk: 'none',
        idempotency: 'none',
      },
    ] as const satisfies readonly CapabilityDefinition[];

    expect(() => assertCapabilityDefinitions(definitions)).toThrow('owner-prefixed');
  });
});
