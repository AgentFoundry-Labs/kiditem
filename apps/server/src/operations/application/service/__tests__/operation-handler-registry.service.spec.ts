import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { OperationDefinition, OperationHandler } from '../../../../../common/operation-definition';
import { OperationHandlerRegistryService } from '../operation-handler-registry.service';

const definition: OperationDefinition = {
  key: 'sourcing.collect_daily_trends',
  version: 1,
  title: '일일 트렌드 수집',
  ownerDomain: 'sourcing',
  engineType: 'composite',
  allowedTriggers: ['dashboard', 'schedule'],
  scheduleSupported: true,
  maxAttempts: 3,
  resourceClass: 'default',
  executionTimeoutMs: 900_000,
  inputSchema: z.object({ sources: z.array(z.string()).min(1) }).strict(),
};

const handler: OperationHandler = {
  async execute() {
    return { kind: 'completed', result: { collected: 1 } };
  },
};

describe('OperationHandlerRegistryService', () => {
  it('fails fast for duplicate operation keys', () => {
    const registry = new OperationHandlerRegistryService();

    registry.register(definition, handler);

    expect(() => registry.register(definition, handler)).toThrow(
      'duplicate operation key',
    );
  });

  it('validates operation input through the registered definition', () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);

    expect(registry.parseInput(definition.key, { sources: ['naver'] })).toEqual({
      sources: ['naver'],
    });
    expect(() => registry.parseInput(definition.key, { sources: 'naver' })).toThrow();
  });

  it('preserves required resource policy on registered definitions', () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);

    expect(registry.listDefinitions()).toEqual([
      expect.objectContaining({ resourceClass: 'default', executionTimeoutMs: 900_000 }),
    ]);
  });
});
