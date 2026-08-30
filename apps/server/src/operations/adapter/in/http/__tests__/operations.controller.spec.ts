import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AuthUser } from '../../../../../auth/auth.types';
import type { OperationHandlerRegistryPort } from '../../../../application/port/in/operation-handler-registry.port';
import type { OperationRunnerPort } from '../../../../application/port/in/operation-runner.port';
import { OperationsController } from '../operations.controller';

const ORG_ID = 'e8bd00e6-57b8-4aec-a40c-24f4f9fe881d';
const USER: AuthUser = {
  id: 'a89d36c3-625a-478c-9490-b6b0a1b67850',
  organizationId: ORG_ID,
  membershipId: 'cdd9070f-3e98-49aa-8b0f-729a03ffcde2',
  role: 'owner',
  type: 'human',
  email: 'owner@example.com',
};

function makeRunner(): OperationRunnerPort {
  return {
    start: vi.fn(),
    list: vi.fn(),
    findReconnectable: vi.fn(),
    get: vi.fn(),
    cancel: vi.fn(),
  };
}

const registry: OperationHandlerRegistryPort = {
  register: vi.fn(),
  getDefinition: vi.fn(),
  getHandler: vi.fn(),
  parseInput: vi.fn(),
  listDefinitions: vi.fn().mockReturnValue([
    {
      key: 'sourcing.collect_daily_trends',
      version: 1,
      title: '일일 트렌드 수집',
      ownerDomain: 'sourcing',
      engineType: 'composite',
      allowedTriggers: ['dashboard'],
      scheduleSupported: true,
      maxAttempts: 3,
      resourceClass: 'default',
      executionTimeoutMs: 900_000,
      inputSchema: z.object({}).strict(),
    },
  ]),
};

describe('OperationsController', () => {
  it('returns resource policy copied from each registered definition', () => {
    const controller = new OperationsController(registry, makeRunner());

    expect(controller.listDefinitions()).toEqual({
      items: [expect.objectContaining({
        resourceClass: 'default',
        executionTimeoutMs: 900_000,
      })],
    });
  });

  it('keeps ephemeral definitions out of the public Operations catalog', () => {
    const controller = new OperationsController({
      ...registry,
      listDefinitions: vi.fn().mockReturnValue([
        ...registry.listDefinitions(),
        {
          key: 'agent-os.delete-session',
          version: 1,
          title: 'Delete session',
          ownerDomain: 'agent-os',
          engineType: 'server',
          allowedTriggers: ['system'],
          scheduleSupported: false,
          maxAttempts: 3,
          resourceClass: 'default',
          executionTimeoutMs: 900_000,
          successPersistence: 'ephemeral_on_success',
          inputSchema: z.object({}).strict(),
        },
      ] as never),
    }, makeRunner());

    expect(controller.listDefinitions().items).not.toContainEqual(
      expect.objectContaining({ key: 'agent-os.delete-session' }),
    );
  });

  it('rejects organization input from the HTTP body', () => {
    const controller = new OperationsController(registry, makeRunner());

    expect(() =>
      controller.start(
        'sourcing.collect_daily_trends',
        { sourceSurface: 'dashboard', input: {}, organizationId: 'forbidden' },
        undefined,
        ORG_ID,
        USER,
      ),
    ).toThrow(BadRequestException);
  });

  it('uses organization and actor only from authenticated decorators', () => {
    const runner = makeRunner();
    const controller = new OperationsController(registry, runner);

    controller.start(
      'sourcing.collect_daily_trends',
      { sourceSurface: 'dashboard', input: { source: 'naver' } },
      ' dashboard:trend:2026-08-01 ',
      ORG_ID,
      USER,
    );

    expect(runner.start).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      operationKey: 'sourcing.collect_daily_trends',
      triggerSource: 'dashboard',
      input: { source: 'naver' },
      requestedByUserId: USER.id,
      idempotencyKey: 'dashboard:trend:2026-08-01',
    });
  });

  it('reads a reconnectable run only for the authenticated organization and exact input', async () => {
    const runner = makeRunner();
    runner.findReconnectable = vi.fn().mockResolvedValue(null);
    const controller = new OperationsController(registry, runner);

    await expect(controller.findReconnectable(
      'sourcing.collect_daily_trends',
      JSON.stringify({}),
      ORG_ID,
      USER,
    )).resolves.toEqual({ run: null });

    expect(runner.findReconnectable).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      requestedByUserId: USER.id,
      operationKey: 'sourcing.collect_daily_trends',
      input: {},
    });
  });

  it('uses the authenticated requester for a unique dynamic reconnect without accepting a client-owned actor', async () => {
    const runner = makeRunner();
    runner.findReconnectable = vi.fn().mockResolvedValue(null);
    const controller = new OperationsController(registry, runner);

    await expect(controller.findReconnectable(
      'sourcing.collect_daily_trends',
      undefined,
      ORG_ID,
      USER,
    )).resolves.toEqual({ run: null });

    expect(runner.findReconnectable).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      requestedByUserId: USER.id,
      operationKey: 'sourcing.collect_daily_trends',
      input: undefined,
    });
  });

  it('rejects an invalid reconnect input before it reaches the runner', () => {
    const runner = makeRunner();
    const controller = new OperationsController(registry, runner);

    expect(() => controller.findReconnectable(
      'sourcing.collect_daily_trends',
      '{bad',
      ORG_ID,
      USER,
    )).toThrow(BadRequestException);
    expect(runner.findReconnectable).not.toHaveBeenCalled();
  });
});
