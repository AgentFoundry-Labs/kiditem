import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationHandlerRegistryPort } from '../../port/in/operation-handler-registry.port';
import type { OperationRunRepositoryPort } from '../../port/out/repository/operation.repository.port';
import { BrowserOperationRuntimeService } from '../browser-operation-runtime.service';
import { OperationLifecycleGateService } from '../operation-lifecycle-gate.service';

const ORG_ID = 'df3b198e-5b31-4f86-b054-bbf4852536a5';
const RUN_ID = 'c2e779aa-f5bf-42c2-91f2-dc10be211c71';
const OLD_TOKEN = 'ced54820-ab09-4f4b-864c-2a3f873bb24d';
const NOW = new Date('2026-08-13T01:02:03.000Z');

const registry: OperationHandlerRegistryPort = {
  register: vi.fn(),
  getDefinition: vi.fn().mockReturnValue({ engineType: 'browser' }),
  getHandler: vi.fn(),
  parseInput: vi.fn(),
  listDefinitions: vi.fn(),
};

function acceptingGate(): OperationLifecycleGateService {
  const gate = new OperationLifecycleGateService();
  gate.open();
  return gate;
}

function gateIn(state: 'BOOTSTRAPPING' | 'STOPPING' | 'STOPPED') {
  const gate = new OperationLifecycleGateService();
  if (state !== 'BOOTSTRAPPING') gate.beginStopping();
  if (state === 'STOPPED') gate.finishStopping();
  return gate;
}

function makeService(
  repository: OperationRunRepositoryPort,
  gate = acceptingGate(),
  runner = { start: vi.fn() },
) {
  return new BrowserOperationRuntimeService(
    registry,
    repository,
    gate,
    runner as never,
  );
}

describe('BrowserOperationRuntimeService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the persisted absolute deadline in a browser claim', async () => {
    const deadlineAt = new Date('2026-08-13T01:17:03.000Z');
    const repository = {
      claimNextBrowserRun: vi.fn().mockResolvedValue({
        id: RUN_ID,
        operationKey: 'sourcing.search_1688_keyword_batch',
        attemptToken: OLD_TOKEN,
        attempts: 1,
        input: { keyword: '아동 가방' },
        leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
        deadlineAt,
      }),
    } as unknown as OperationRunRepositoryPort;
    const gate = acceptingGate();
    const service = makeService(repository, gate);

    await expect(service.claim({
      organizationId: ORG_ID,
      runtimeId: 'kiditem-os',
      environmentId: 'office',
    })).resolves.toMatchObject({ deadlineAt: deadlineAt.toISOString() });
    expect(repository.claimNextBrowserRun).toHaveBeenCalledWith(
      expect.objectContaining({ signal: gate.signal() }),
    );
  });

  it('forwards stage and paired counts on heartbeat without losing the fence', async () => {
    const repository = {
      heartbeatBrowserRun: vi.fn().mockResolvedValue({ id: RUN_ID }),
    } as unknown as OperationRunRepositoryPort;
    const service = makeService(repository);

    await service.heartbeat({
      organizationId: ORG_ID,
      runId: RUN_ID,
      request: {
        attemptToken: OLD_TOKEN,
        stage: 'collecting_keyword',
        progressCurrent: 11,
        progressTotal: 12,
      },
    });

    expect(repository.heartbeatBrowserRun).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: OLD_TOKEN,
      stage: 'collecting_keyword',
      progressCurrent: 11,
      progressTotal: 12,
    }));
  });

  it.each(['BOOTSTRAPPING', 'STOPPING', 'STOPPED'] as const)(
    'rejects heartbeat and running report in %s with zero repository writes',
    async (state) => {
      const repository = {
        heartbeatBrowserRun: vi.fn().mockResolvedValue({ id: RUN_ID }),
      } as unknown as OperationRunRepositoryPort;
      const service = makeService(repository, gateIn(state));

      await expect(service.heartbeat({
        organizationId: ORG_ID,
        runId: RUN_ID,
        request: { attemptToken: OLD_TOKEN, progress: 0.5 },
      })).rejects.toMatchObject({
        status: 503,
        message: 'operation_server_lifecycle_unavailable',
      });
      await expect(service.report({
        organizationId: ORG_ID,
        runId: RUN_ID,
        attemptToken: OLD_TOKEN,
        status: 'running',
        progress: 0.5,
      })).rejects.toMatchObject({
        status: 503,
        message: 'operation_server_lifecycle_unavailable',
      });
      expect(repository.heartbeatBrowserRun).not.toHaveBeenCalled();
    },
  );

  it.each(['BOOTSTRAPPING', 'STOPPING', 'STOPPED'] as const)(
    'keeps exact-fenced terminal reports available in %s',
    async (state) => {
      const repository = {
        heartbeatBrowserRun: vi.fn(),
        transitionActiveAttempt: vi.fn().mockResolvedValue({ id: RUN_ID }),
      } as unknown as OperationRunRepositoryPort;
      const service = makeService(repository, gateIn(state));

      await service.report({
        organizationId: ORG_ID,
        runId: RUN_ID,
        attemptToken: OLD_TOKEN,
        status: 'attention_required',
        attentionReason: 'manual_check',
      });
      await service.report({
        organizationId: ORG_ID,
        runId: RUN_ID,
        attemptToken: OLD_TOKEN,
        status: 'succeeded',
        result: { imported: 1 },
      });
      await service.report({
        organizationId: ORG_ID,
        runId: RUN_ID,
        attemptToken: OLD_TOKEN,
        status: 'failed',
        errorCode: 'browser_step_failed',
      });

      expect(repository.heartbeatBrowserRun).not.toHaveBeenCalled();
      expect(repository.transitionActiveAttempt).toHaveBeenCalledTimes(3);
      for (const [transition] of vi.mocked(
        repository.transitionActiveAttempt,
      ).mock.calls) {
        expect(transition).toEqual(expect.objectContaining({
          expectedAttemptToken: OLD_TOKEN,
        }));
      }
    },
  );

  it('routes every valid report outcome through its active lease and deadline fence', async () => {
    const repository = {
      heartbeatBrowserRun: vi.fn().mockResolvedValue({ id: RUN_ID }),
      transitionActiveAttempt: vi.fn().mockResolvedValue({ id: RUN_ID }),
      transition: vi.fn(),
    } as unknown as OperationRunRepositoryPort;
    const service = makeService(repository);

    await service.report({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: OLD_TOKEN,
      status: 'running',
      stage: 'collecting_keyword',
      progressCurrent: 11,
      progressTotal: 12,
    });
    await service.report({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: OLD_TOKEN,
      status: 'attention_required',
      attentionReason: 'manual_check',
    });
    await service.report({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: OLD_TOKEN,
      status: 'succeeded',
      stage: 'completed',
      progressCurrent: 12,
      progressTotal: 12,
      result: { outcome: 'partial', imported: 11 },
    });
    await service.report({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: OLD_TOKEN,
      status: 'failed',
      errorCode: 'browser_step_failed',
      errorMessage: 'Browser step failed',
    });

    expect(repository.heartbeatBrowserRun).toHaveBeenCalledWith(expect.objectContaining({
      attemptToken: OLD_TOKEN,
      stage: 'collecting_keyword',
      progressCurrent: 11,
      progressTotal: 12,
    }));
    expect(repository.transitionActiveAttempt).toHaveBeenCalledTimes(3);
    expect(repository.transitionActiveAttempt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        expectedAttemptToken: OLD_TOKEN,
        status: 'attention_required',
        errorCode: 'browser_attention_required',
      }),
    );
    expect(repository.transitionActiveAttempt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        expectedAttemptToken: OLD_TOKEN,
        status: 'succeeded',
        stage: 'completed',
        progressCurrent: 12,
        progressTotal: 12,
        result: { outcome: 'partial', imported: 11 },
      }),
    );
    expect(repository.transitionActiveAttempt).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        expectedAttemptToken: OLD_TOKEN,
        status: 'failed',
        errorCode: 'browser_step_failed',
      }),
    );
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it.each([
    ['running', {}],
    ['attention_required', { attentionReason: 'manual_check' }],
    ['succeeded', { result: { outcome: 'no_change' } }],
    ['failed', {
      errorCode: 'browser_step_failed',
      errorMessage: 'Browser step failed',
    }],
  ] as const)('rejects a %s report when its active fence is lost', async (
    status,
    details,
  ) => {
    const repository = {
      heartbeatBrowserRun: vi.fn().mockResolvedValue(null),
      transitionActiveAttempt: vi.fn().mockResolvedValue(null),
      transition: vi.fn(),
    } as unknown as OperationRunRepositoryPort;
    const service = makeService(repository);

    await expect(
      service.report({
        organizationId: ORG_ID,
        runId: RUN_ID,
        attemptToken: OLD_TOKEN,
        status,
        ...details,
      }),
    ).rejects.toThrow('browser_runtime_fence_lost');
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('creates a new run for explicit UI retry without mutating the old attempt', async () => {
    const deadlineAt = new Date('2026-08-13T01:17:03.000Z');
    const current = {
      id: RUN_ID,
      organizationId: ORG_ID,
      operationKey: 'sourcing.search_1688_keyword_batch',
      input: { keyword: '아동 가방' },
      engineType: 'browser',
      status: 'attention_required',
      attempts: 3,
      maxAttempts: 3,
      deadlineAt,
    };
    const repository = {
      findRunById: vi.fn().mockResolvedValue(current),
      transition: vi.fn(),
    } as unknown as OperationRunRepositoryPort;
    const runner = {
      start: vi.fn().mockResolvedValue({ id: 'new-run-id', status: 'queued' }),
    };
    const service = makeService(repository, acceptingGate(), runner);

    await service.retry({
      organizationId: ORG_ID,
      runId: RUN_ID,
      requestedByUserId: 'user-id',
    });

    expect(runner.start).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      operationKey: current.operationKey,
      input: current.input,
      requestedByUserId: 'user-id',
      idempotencyKey: expect.stringMatching(`^retry:${RUN_ID}:`),
    }));
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it.each(['BOOTSTRAPPING', 'STOPPING', 'STOPPED'] as const)(
    'rejects browser claim and retry in %s with zero mutation',
    async (state) => {
      const gate = new OperationLifecycleGateService();
      if (state !== 'BOOTSTRAPPING') gate.beginStopping();
      if (state === 'STOPPED') gate.finishStopping();
      const repository = {
        findRunById: vi.fn(),
        claimNextBrowserRun: vi.fn(),
        transition: vi.fn(),
      } as unknown as OperationRunRepositoryPort;
      const runner = { start: vi.fn() };
      const service = makeService(repository, gate, runner);

      await expect(service.claim({
        organizationId: ORG_ID,
        runtimeId: 'kiditem-os',
        environmentId: 'office',
      })).rejects.toMatchObject({ status: 503 });
      await expect(service.retry({
        organizationId: ORG_ID,
        runId: RUN_ID,
        requestedByUserId: 'user-id',
      })).rejects.toMatchObject({ status: 503 });
      expect(repository.claimNextBrowserRun).not.toHaveBeenCalled();
      expect(repository.findRunById).not.toHaveBeenCalled();
      expect(repository.transition).not.toHaveBeenCalled();
      expect(runner.start).not.toHaveBeenCalled();
    },
  );

  it('does not retry a lifecycle-cancelled run', async () => {
    const repository = {
      findRunById: vi.fn().mockResolvedValue({
        id: RUN_ID,
        organizationId: ORG_ID,
        engineType: 'browser',
        status: 'cancelled',
        errorCode: 'operation_server_lifecycle_expired',
      }),
    } as unknown as OperationRunRepositoryPort;
    const runner = { start: vi.fn() };
    const service = makeService(repository, acceptingGate(), runner);

    await expect(service.retry({
      organizationId: ORG_ID,
      runId: RUN_ID,
      requestedByUserId: 'user-id',
    })).rejects.toThrow('browser_operation_not_retryable');
    expect(runner.start).not.toHaveBeenCalled();
  });

  it('exact-fence cancels a browser claim committed as the server enters STOPPING', async () => {
    const gate = acceptingGate();
    const run = {
      id: RUN_ID,
      organizationId: ORG_ID,
      operationKey: 'sourcing.search_1688_keyword_batch',
      engineType: 'browser',
      status: 'running',
      attemptToken: OLD_TOKEN,
      attempts: 1,
      claimedBy: 'office:kiditem-os',
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
      deadlineAt: new Date('2026-08-13T01:17:03.000Z'),
      input: { keyword: '아동 가방' },
    };
    const repository = {
      claimNextBrowserRun: vi.fn().mockImplementation(async () => {
        gate.beginStopping();
        return run;
      }),
      cancelClaimedAttemptForLifecycle: vi.fn().mockResolvedValue(true),
    } as unknown as OperationRunRepositoryPort;
    const service = makeService(repository, gate);

    await expect(service.claim({
      organizationId: ORG_ID,
      runtimeId: 'kiditem-os',
      environmentId: 'office',
    })).rejects.toMatchObject({ status: 503 });
    expect(repository.cancelClaimedAttemptForLifecycle).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      runId: RUN_ID,
      expectedAttemptToken: OLD_TOKEN,
      claimedBy: 'office:kiditem-os',
      errorCode: 'operation_server_shutdown',
      finishedAt: NOW,
    });
  });
});
