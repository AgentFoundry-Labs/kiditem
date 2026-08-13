import { describe, expect, it, vi } from 'vitest';
import type { OperationRunRecord } from '../../port/out/repository/operation.repository.port';
import { OperationDispatcherService } from '../operation-dispatcher.service';

const NOW = new Date('2026-08-13T01:02:03.000Z');

function run(overrides: Partial<OperationRunRecord> = {}): OperationRunRecord {
  return {
    id: 'c2e779aa-f5bf-42c2-91f2-dc10be211c71',
    organizationId: 'df3b198e-5b31-4f86-b054-bbf4852536a5',
    operationKey: 'sourcing.collect_daily_trends',
    definitionVersion: 1,
    ownerDomain: 'sourcing',
    title: 'Collect trends',
    engineType: 'composite',
    resourceClass: 'naver_api',
    executionTimeoutMs: 10_000,
    status: 'running',
    triggerSource: 'dashboard',
    requestedByUserId: null,
    parentRunId: null,
    scheduleId: null,
    idempotencyKey: null,
    input: {},
    result: null,
    progress: null,
    stage: null,
    stageUpdatedAt: null,
    progressCurrent: null,
    progressTotal: null,
    deadlineAt: new Date(NOW.getTime() + 10_000),
    nativeRunType: null,
    nativeRunId: null,
    attempts: 1,
    maxAttempts: 3,
    claimedBy: 'operations:test',
    attemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
    claimedAt: NOW,
    leaseExpiresAt: new Date(NOW.getTime() + 900),
    scheduledFor: null,
    errorCode: null,
    errorMessage: null,
    startedAt: NOW,
    finishedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    requestedBy: null,
    ...overrides,
  };
}

describe('OperationDispatcherService', () => {
  it('passes attempt controls to the handler and verifies the fence before completion', async () => {
    const execute = vi.fn().mockResolvedValue({
      kind: 'completed',
      result: { collected: 3 },
    });
    const repository = {
      transition: vi.fn().mockResolvedValue(run({ status: 'succeeded' })),
    };
    const dispatcher = new OperationDispatcherService(
      { getHandler: vi.fn().mockReturnValue({ execute }) } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );
    const controller = new AbortController();
    const checkpoint = vi.fn().mockResolvedValue(undefined);

    await dispatcher.dispatch(run(), {
      signal: controller.signal,
      checkpoint,
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      signal: controller.signal,
      checkpoint,
    }));
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      status: 'succeeded',
    }));
  });

  it('does not commit handler completion after the attempt signal aborts', async () => {
    let resolveHandler!: (value: {
      kind: 'completed';
      result: Record<string, unknown>;
    }) => void;
    const handlerResult = new Promise<{
      kind: 'completed';
      result: Record<string, unknown>;
    }>((resolve) => {
      resolveHandler = resolve;
    });
    const repository = { transition: vi.fn() };
    const dispatcher = new OperationDispatcherService(
      {
        getHandler: vi.fn().mockReturnValue({
          execute: vi.fn().mockReturnValue(handlerResult),
        }),
      } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );
    const controller = new AbortController();

    const dispatch = dispatcher.dispatch(run(), {
      signal: controller.signal,
      checkpoint: vi.fn().mockResolvedValue(undefined),
    });
    controller.abort(new Error('operation_attempt_fence_lost'));
    resolveHandler({ kind: 'completed', result: { collected: 3 } });
    await dispatch;

    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('rechecks the heartbeat fence before recording a handler failure', async () => {
    const repository = { transition: vi.fn() };
    const dispatcher = new OperationDispatcherService(
      {
        getHandler: vi.fn().mockReturnValue({
          execute: vi.fn().mockRejectedValue(new Error('provider failed')),
        }),
      } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );
    const controller = new AbortController();
    const checkpoint = vi.fn().mockImplementation(async () => {
      const reason = new Error('operation_attempt_fence_lost');
      controller.abort(reason);
      throw reason;
    });

    await dispatcher.dispatch(run(), {
      signal: controller.signal,
      checkpoint,
    });

    expect(checkpoint).toHaveBeenCalledOnce();
    expect(repository.transition).not.toHaveBeenCalled();
  });
});
