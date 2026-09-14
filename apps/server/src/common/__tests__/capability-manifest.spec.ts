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
        resultSummary: '예시 데이터를 확인했습니다.',
        inputSchema: z.object({ query: z.string() }).strict(),
        outputSchema: z.object({ count: z.number() }).strict(),
        effects: ['read'],
        approvalRisk: 'none',
        idempotency: 'recommended',
      },
    ] as const as readonly CapabilityDefinition[];

    expect(() => assertCapabilityDefinitions(definitions)).toThrow('owner-prefixed');
  });

  it('requires a short Korean completion summary owned by each capability manifest', () => {
    const definition = {
      key: 'analytics.readExample',
      ownerDomain: 'analytics',
      ownerInputPort: 'analytics.readExample',
      description: 'Read example data.',
      inputSchema: z.object({ query: z.string() }).strict(),
      outputSchema: z.object({ count: z.number() }).strict(),
      effects: ['read'],
      approvalRisk: 'none',
      idempotency: 'recommended',
    } as unknown as CapabilityDefinition;

    expect(() => assertCapabilityDefinitions([definition])).toThrow('result summary');
    expect(() => assertCapabilityDefinitions([{
      ...definition,
      resultSummary: 'technical-completion',
    }])).toThrow('Korean');
    expect(() => assertCapabilityDefinitions([{
      ...definition,
      resultSummary: '예시 데이터를 확인했습니다.',
    }])).not.toThrow();
  });
});
