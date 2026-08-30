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

  it('normalizes an omitted success persistence policy to retained', () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);

    expect(registry.getDefinition(definition.key)).toMatchObject({
      successPersistence: 'retained',
    });
  });

  it('rejects an ephemeral definition without both required terminal handlers', () => {
    const registry = new OperationHandlerRegistryService();
    const ephemeralDefinition = {
      ...definition,
      key: 'agent-os.delete-session',
      allowedTriggers: ['system'],
      scheduleSupported: false,
      successPersistence: 'ephemeral_on_success',
    };

    expect(() => registry.register(ephemeralDefinition as never, handler)).toThrow(
      'operation_ephemeral_definition_invalid',
    );
  });

  it('rejects an ephemeral definition unless schedule support is explicitly false', () => {
    const registry = new OperationHandlerRegistryService();
    const ephemeralHandler: OperationHandler = {
      ...handler,
      async finalizeEphemeralSuccess() {},
      async exhaustRetry() {},
    };
    const malformedDefinition = {
      ...definition,
      key: 'agent-os.delete-session-without-schedule-policy',
      allowedTriggers: ['system'],
      successPersistence: 'ephemeral_on_success',
    };
    delete (malformedDefinition as { scheduleSupported?: boolean }).scheduleSupported;

    expect(() => registry.register(malformedDefinition as never, ephemeralHandler)).toThrow(
      'operation_ephemeral_definition_invalid',
    );
  });
});
