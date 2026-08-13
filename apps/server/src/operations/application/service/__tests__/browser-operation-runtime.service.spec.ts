import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationHandlerRegistryPort } from '../../port/in/operation-handler-registry.port';
import type { OperationRunRepositoryPort } from '../../port/out/repository/operation.repository.port';
import { BrowserOperationRuntimeService } from '../browser-operation-runtime.service';

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
    const service = new BrowserOperationRuntimeService(registry, repository);

    await expect(service.claim({
      organizationId: ORG_ID,
      runtimeId: 'kiditem-os',
      environmentId: 'office',
    })).resolves.toMatchObject({ deadlineAt: deadlineAt.toISOString() });
  });

  it('forwards stage and paired counts on heartbeat without losing the fence', async () => {
    const repository = {
      heartbeatBrowserRun: vi.fn().mockResolvedValue({ id: RUN_ID }),
    } as unknown as OperationRunRepositoryPort;
    const service = new BrowserOperationRuntimeService(registry, repository);

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

  it('routes every valid report outcome through its active lease and deadline fence', async () => {
    const repository = {
      heartbeatBrowserRun: vi.fn().mockResolvedValue({ id: RUN_ID }),
      transitionActiveAttempt: vi.fn().mockResolvedValue({ id: RUN_ID }),
      transition: vi.fn(),
    } as unknown as OperationRunRepositoryPort;
    const service = new BrowserOperationRuntimeService(registry, repository);

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
    const service = new BrowserOperationRuntimeService(registry, repository);

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

  it('grants one retry without clearing or extending the absolute deadline', async () => {
    const deadlineAt = new Date('2026-08-13T01:17:03.000Z');
    const current = {
      id: RUN_ID,
      organizationId: ORG_ID,
      engineType: 'browser',
      status: 'attention_required',
      attempts: 3,
      maxAttempts: 3,
      deadlineAt,
    };
    const repository = {
      findRunById: vi.fn().mockResolvedValue(current),
      transition: vi.fn().mockResolvedValue({ ...current, status: 'waiting_runtime' }),
    } as unknown as OperationRunRepositoryPort;
    const service = new BrowserOperationRuntimeService(registry, repository);

    await service.retry({ organizationId: ORG_ID, runId: RUN_ID });

    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      runId: RUN_ID,
      status: 'waiting_runtime',
      attemptDelta: -1,
    }));
    expect(repository.transition).toHaveBeenCalledTimes(1);
    expect(vi.mocked(repository.transition).mock.calls[0]?.[0]).not.toHaveProperty(
      'deadlineAt',
    );
  });
});
