import { describe, expect, it, vi } from 'vitest';
import type { OperationHandlerRegistryPort } from '../../port/in/operation-handler-registry.port';
import type { OperationRunRepositoryPort } from '../../port/out/repository/operation.repository.port';
import { BrowserOperationRuntimeService } from '../browser-operation-runtime.service';

const ORG_ID = 'df3b198e-5b31-4f86-b054-bbf4852536a5';
const RUN_ID = 'c2e779aa-f5bf-42c2-91f2-dc10be211c71';
const OLD_TOKEN = 'ced54820-ab09-4f4b-864c-2a3f873bb24d';

const registry: OperationHandlerRegistryPort = {
  register: vi.fn(),
  getDefinition: vi.fn().mockReturnValue({ engineType: 'browser' }),
  getHandler: vi.fn(),
  parseInput: vi.fn(),
  listDefinitions: vi.fn(),
};

describe('BrowserOperationRuntimeService', () => {
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

  it('forwards stage and paired counts through an attempt-token-fenced report', async () => {
    const repository = {
      transition: vi.fn().mockResolvedValue({ id: RUN_ID }),
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

    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      expectedAttemptToken: OLD_TOKEN,
      stage: 'collecting_keyword',
      progressCurrent: 11,
      progressTotal: 12,
    }));
  });

  it('rejects a report from a stale browser lease token', async () => {
    const repository = {
      transition: vi.fn().mockResolvedValue(null),
    } as unknown as OperationRunRepositoryPort;
    const service = new BrowserOperationRuntimeService(registry, repository);

    await expect(
      service.report({
        organizationId: ORG_ID,
        runId: RUN_ID,
        attemptToken: OLD_TOKEN,
        status: 'succeeded',
        result: { imported: 10 },
      }),
    ).rejects.toThrow('browser_runtime_fence_lost');
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
