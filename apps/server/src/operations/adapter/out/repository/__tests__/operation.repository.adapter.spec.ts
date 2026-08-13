import { describe, expect, it, vi } from 'vitest';
import { OperationRepositoryAdapter } from '../operation.repository.adapter';

const ORG_ID = 'df3b198e-5b31-4f86-b054-bbf4852536a5';
const RUN_ID = 'c2e779aa-f5bf-42c2-91f2-dc10be211c71';
const ATTEMPT_TOKEN = 'ced54820-ab09-4f4b-864c-2a3f873bb24d';
const NOW = new Date('2026-08-13T01:02:03.000Z');

function makePrisma(updateMany: ReturnType<typeof vi.fn>) {
  return {
    operationRun: {
      updateMany,
      findFirst: vi.fn().mockResolvedValue({
        id: RUN_ID,
        organizationId: ORG_ID,
        input: {},
        requestedBy: null,
      }),
    },
  };
}

describe('OperationRepositoryAdapter stage and count mapping', () => {
  it('timestamps a changed heartbeat stage and derives normalized progress', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new OperationRepositoryAdapter(makePrisma(updateMany) as never);

    await repository.heartbeatBrowserRun({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
      stage: 'collecting_keyword',
      progressCurrent: 3,
      progressTotal: 12,
    });

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: ORG_ID,
        attemptToken: ATTEMPT_TOKEN,
      }),
      data: expect.objectContaining({
        stage: 'collecting_keyword',
        stageUpdatedAt: NOW,
        progressCurrent: 3,
        progressTotal: 12,
        progress: 0.25,
      }),
    }));
  });

  it('preserves stageUpdatedAt when a heartbeat repeats the current stage', async () => {
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const repository = new OperationRepositoryAdapter(makePrisma(updateMany) as never);

    await repository.heartbeatBrowserRun({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
      stage: 'collecting_keyword',
    });

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[1]?.[0].data).not.toHaveProperty('stageUpdatedAt');
  });

  it('rejects a partial count update before touching the run', async () => {
    const updateMany = vi.fn();
    const repository = new OperationRepositoryAdapter(makePrisma(updateMany) as never);

    await expect(repository.heartbeatBrowserRun({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
      progressCurrent: 3,
    })).rejects.toThrow('operation_progress_counts_must_be_paired');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('jointly clears counts and their derived normalized progress', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new OperationRepositoryAdapter(makePrisma(updateMany) as never);

    await repository.heartbeatBrowserRun({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
      progressCurrent: null,
      progressTotal: null,
    });

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progressCurrent: null,
        progressTotal: null,
        progress: null,
      }),
    }));
  });
});

describe('OperationRepositoryAdapter browser claim deadline', () => {
  it('sets the absolute deadline from persisted execution policy on first claim', async () => {
    const update = vi.fn().mockResolvedValue({ id: RUN_ID });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: RUN_ID,
        deadline_at: null,
        execution_timeout_ms: 900_000,
      }]),
      operationRun: { update },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
      operationRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: RUN_ID,
          organizationId: ORG_ID,
          input: {},
          requestedBy: null,
        }),
      },
    };
    const repository = new OperationRepositoryAdapter(prisma as never);

    await repository.claimNextBrowserRun({
      organizationId: ORG_ID,
      runtimeId: 'office:kiditem-os',
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        deadlineAt: new Date('2026-08-13T01:17:03.000Z'),
      }),
    }));
  });

  it('preserves the original deadline when a browser run is reclaimed', async () => {
    const originalDeadline = new Date('2026-08-13T01:10:00.000Z');
    const update = vi.fn().mockResolvedValue({ id: RUN_ID });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: RUN_ID,
        deadline_at: originalDeadline,
        execution_timeout_ms: 900_000,
      }]),
      operationRun: { update },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
      operationRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: RUN_ID,
          organizationId: ORG_ID,
          input: {},
          requestedBy: null,
        }),
      },
    };
    const repository = new OperationRepositoryAdapter(prisma as never);

    await repository.claimNextBrowserRun({
      organizationId: ORG_ID,
      runtimeId: 'office:kiditem-os',
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deadlineAt: originalDeadline }),
    }));
  });
});
