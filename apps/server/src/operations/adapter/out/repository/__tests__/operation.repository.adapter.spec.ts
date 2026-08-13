import { describe, expect, it, vi } from 'vitest';
import { MAX_OPERATION_PERSISTED_INT } from '@kiditem/shared/operations';
import {
  mapOperationRunRow,
  OperationRepositoryAdapter,
} from '../operation.repository.adapter';

const ORG_ID = 'df3b198e-5b31-4f86-b054-bbf4852536a5';
const RUN_ID = 'c2e779aa-f5bf-42c2-91f2-dc10be211c71';
const ATTEMPT_TOKEN = 'ced54820-ab09-4f4b-864c-2a3f873bb24d';
const NOW = new Date('2026-08-13T01:02:03.000Z');

function makeRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    organizationId: ORG_ID,
    operationKey: 'sourcing.search_1688_keyword_batch',
    definitionVersion: 1,
    ownerDomain: 'sourcing',
    title: '1688 키워드 수집',
    engineType: 'browser',
    resourceClass: 'playwright_1688',
    executionTimeoutMs: 900_000,
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
    deadlineAt: new Date('2026-08-13T01:17:03.000Z'),
    nativeRunType: null,
    nativeRunId: null,
    attempts: 1,
    maxAttempts: 3,
    claimedBy: 'office:kiditem-os',
    attemptToken: ATTEMPT_TOKEN,
    claimedAt: NOW,
    leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
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

function makeCreateRunInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG_ID,
    operationKey: 'sourcing.search_1688_keyword_batch',
    definitionVersion: 1,
    ownerDomain: 'sourcing',
    title: '1688 키워드 수집',
    engineType: 'browser',
    resourceClass: 'playwright_1688',
    executionTimeoutMs: 900_000,
    triggerSource: 'dashboard',
    requestedByUserId: null,
    parentRunId: null,
    scheduleId: null,
    idempotencyKey: null,
    input: {},
    maxAttempts: 3,
    scheduledFor: null,
    ...overrides,
  };
}

function makePrisma(updateMany: ReturnType<typeof vi.fn>) {
  return {
    operationRun: {
      updateMany,
      findFirst: vi.fn().mockResolvedValue(makeRunRow()),
    },
  };
}

describe('mapOperationRunRow persisted execution metadata', () => {
  it.each([
    ['unknown resource class', { resourceClass: 'unknown' }],
    ['missing resource class', { resourceClass: undefined }],
    ['unsafe stage', { stage: 'Collecting Keyword' }],
    ['missing stage', { stage: undefined }],
    ['nonpositive timeout', { executionTimeoutMs: 0 }],
    [
      'out-of-range timeout',
      { executionTimeoutMs: MAX_OPERATION_PERSISTED_INT + 1 },
    ],
    ['missing timeout', { executionTimeoutMs: undefined }],
    [
      'unpaired counts',
      { progressCurrent: undefined, progressTotal: 1 },
    ],
    ['negative counts', { progressCurrent: -1, progressTotal: 1 }],
    [
      'out-of-range counts',
      {
        progressCurrent: MAX_OPERATION_PERSISTED_INT + 1,
        progressTotal: MAX_OPERATION_PERSISTED_INT + 1,
      },
    ],
    ['current above total', { progressCurrent: 2, progressTotal: 1 }],
  ])('rejects %s', (_name, overrides) => {
    expect(() => mapOperationRunRow(makeRunRow(overrides) as never)).toThrow(
      'operation_run_persisted_execution_metadata_invalid',
    );
  });
});

describe('OperationRepositoryAdapter creation boundaries', () => {
  it('accepts the persisted signed-32-bit maximum timeout', async () => {
    const create = vi.fn().mockResolvedValue(makeRunRow({
      executionTimeoutMs: MAX_OPERATION_PERSISTED_INT,
    }));
    const repository = new OperationRepositoryAdapter({
      operationRun: { create },
    } as never);

    await expect(repository.createRun(makeCreateRunInput({
      executionTimeoutMs: MAX_OPERATION_PERSISTED_INT,
    }) as never)).resolves.toMatchObject({
      executionTimeoutMs: MAX_OPERATION_PERSISTED_INT,
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        executionTimeoutMs: MAX_OPERATION_PERSISTED_INT,
      }),
    }));
  });

  it('rejects an out-of-range timeout before calling Prisma', async () => {
    const create = vi.fn();
    const repository = new OperationRepositoryAdapter({
      operationRun: { create },
    } as never);

    await expect(repository.createRun(makeCreateRunInput({
      executionTimeoutMs: MAX_OPERATION_PERSISTED_INT + 1,
    }) as never)).rejects.toThrow('operation_execution_timeout_ms_invalid');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('OperationRepositoryAdapter stage and count mapping', () => {
  it('heartbeats a server attempt through the exact token, lease, deadline, stage, and count fence', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new OperationRepositoryAdapter(makePrisma(updateMany) as never);

    await repository.heartbeatRun({
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
        id: RUN_ID,
        organizationId: ORG_ID,
        status: 'running',
        attemptToken: ATTEMPT_TOKEN,
        leaseExpiresAt: { gt: NOW },
        deadlineAt: { gt: NOW },
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

  it('rejects an invalid server checkpoint stage before touching the run', async () => {
    const updateMany = vi.fn();
    const repository = new OperationRepositoryAdapter(makePrisma(updateMany) as never);

    await expect(repository.heartbeatRun({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
      stage: 'Collecting Keyword' as never,
    })).rejects.toThrow('operation_stage_invalid');
    expect(updateMany).not.toHaveBeenCalled();
  });

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
        deadlineAt: { gt: NOW },
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
    expect(updateMany.mock.calls[0]?.[0].where).toMatchObject({
      OR: [
        { stage: null },
        { stage: { not: 'collecting_keyword' } },
      ],
    });
    expect(updateMany.mock.calls[1]?.[0].where).toMatchObject({
      stage: 'collecting_keyword',
    });
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

  it('normalizes zero of zero progress to a finite persisted zero', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new OperationRepositoryAdapter(makePrisma(updateMany) as never);

    await repository.heartbeatBrowserRun({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
      progressCurrent: 0,
      progressTotal: 0,
    });

    const progress = updateMany.mock.calls[0]?.[0].data.progress;
    expect(progress).toBe(0);
    expect(Number.isFinite(progress)).toBe(true);
  });

  it('accepts the persisted signed-32-bit maximum for count updates', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new OperationRepositoryAdapter(makePrisma(updateMany) as never);

    await repository.heartbeatBrowserRun({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
      progressCurrent: MAX_OPERATION_PERSISTED_INT,
      progressTotal: MAX_OPERATION_PERSISTED_INT,
    });

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progressCurrent: MAX_OPERATION_PERSISTED_INT,
        progressTotal: MAX_OPERATION_PERSISTED_INT,
        progress: 1,
      }),
    }));
  });

  it('rejects out-of-range counts before calling Prisma', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new OperationRepositoryAdapter(makePrisma(updateMany) as never);

    await expect(repository.heartbeatBrowserRun({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
      progressCurrent: MAX_OPERATION_PERSISTED_INT + 1,
      progressTotal: MAX_OPERATION_PERSISTED_INT + 1,
    })).rejects.toThrow('operation_progress_counts_invalid');
    expect(updateMany).not.toHaveBeenCalled();
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
        findFirst: vi.fn().mockResolvedValue(makeRunRow()),
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

  it('uses the original absolute deadline instead of extending it on reclaim', async () => {
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
        findFirst: vi.fn().mockResolvedValue(makeRunRow()),
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

  it('rejects a malformed raw execution timeout before claiming the run', async () => {
    const update = vi.fn().mockResolvedValue({ id: RUN_ID });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: RUN_ID,
        deadline_at: null,
        execution_timeout_ms: MAX_OPERATION_PERSISTED_INT + 1,
      }]),
      operationRun: { update },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
      operationRun: {
        findFirst: vi.fn().mockResolvedValue(makeRunRow()),
      },
    };
    const repository = new OperationRepositoryAdapter(prisma as never);

    await expect(repository.claimNextBrowserRun({
      organizationId: ORG_ID,
      runtimeId: 'office:kiditem-os',
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
    })).rejects.toThrow('operation_run_persisted_execution_metadata_invalid');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('OperationRepositoryAdapter server claim fencing', () => {
  it('binds the requested resource class and initializes the first absolute deadline', async () => {
    const update = vi.fn().mockResolvedValue({ id: RUN_ID });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: RUN_ID,
        organization_id: ORG_ID,
        deadline_at: null,
        execution_timeout_ms: 900_000,
      }]),
      operationRun: { update },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
      operationRun: {
        findFirst: vi.fn().mockResolvedValue(makeRunRow()),
      },
    };
    const repository = new OperationRepositoryAdapter(prisma as never);

    await repository.claimNextRun({
      resourceClass: 'playwright_1688',
      workerId: 'operations:test',
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
    });

    const rawQueryArguments = transaction.$queryRaw.mock.calls[0] ?? [];
    expect(rawQueryArguments).toContain('playwright_1688');
    expect(String(rawQueryArguments[0])).toContain('resource_class =');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id_organizationId: { id: RUN_ID, organizationId: ORG_ID },
      },
      data: expect.objectContaining({
        deadlineAt: new Date('2026-08-13T01:17:03.000Z'),
      }),
    }));
  });

  it('preserves the original absolute deadline when reclaiming a server run', async () => {
    const originalDeadline = new Date('2026-08-13T01:09:00.000Z');
    const update = vi.fn().mockResolvedValue({ id: RUN_ID });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: RUN_ID,
        organization_id: ORG_ID,
        deadline_at: originalDeadline,
        execution_timeout_ms: 900_000,
      }]),
      operationRun: { update },
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
      operationRun: { findFirst: vi.fn().mockResolvedValue(makeRunRow()) },
    } as never);

    await repository.claimNextRun({
      resourceClass: 'playwright_1688',
      workerId: 'operations:test',
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deadlineAt: originalDeadline }),
    }));
  });

  it('rejects malformed raw timeout metadata before a server claim update', async () => {
    const update = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: RUN_ID,
        organization_id: ORG_ID,
        deadline_at: null,
        execution_timeout_ms: MAX_OPERATION_PERSISTED_INT + 1,
      }]),
      operationRun: { update },
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
      operationRun: { findFirst: vi.fn() },
    } as never);

    await expect(repository.claimNextRun({
      resourceClass: 'naver_api',
      workerId: 'operations:test',
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
    })).rejects.toThrow('operation_run_persisted_execution_metadata_invalid');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('OperationRepositoryAdapter deadline sweep', () => {
  it('bounds active cross-organization expiry and clears the attempt fence', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: RUN_ID,
        organization_id: ORG_ID,
      }]),
      operationRun: { updateMany },
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(repository.expirePastDeadlineRuns({
      now: NOW,
      limit: 7,
    })).resolves.toBe(1);

    const rawQueryArguments = transaction.$queryRaw.mock.calls[0] ?? [];
    expect(rawQueryArguments).toContain(NOW);
    expect(rawQueryArguments).toContain(7);
    expect(String(rawQueryArguments[0])).toContain(
      "status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')",
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: RUN_ID,
        organizationId: ORG_ID,
        status: {
          in: ['queued', 'waiting_runtime', 'waiting_dependency', 'running'],
        },
        deadlineAt: { lte: NOW },
      },
      data: {
        status: 'failed',
        errorCode: 'operation_deadline_exceeded',
        errorMessage: 'Operation execution deadline exceeded',
        finishedAt: NOW,
        claimedBy: null,
        attemptToken: null,
        claimedAt: null,
        leaseExpiresAt: null,
      },
    });
  });

  it('returns null to a late heartbeat after the sweep clears its token', async () => {
    const sweptUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const lateHeartbeatUpdate = vi.fn().mockResolvedValue({ count: 0 });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: RUN_ID,
        organization_id: ORG_ID,
      }]),
      operationRun: { updateMany: sweptUpdate },
    };
    const findFirst = vi.fn();
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
      operationRun: {
        updateMany: lateHeartbeatUpdate,
        findFirst,
      },
    } as never);

    await repository.expirePastDeadlineRuns({ now: NOW, limit: 1 });
    await expect(repository.heartbeatRun({
      organizationId: ORG_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
    })).resolves.toBeNull();

    expect(lateHeartbeatUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: ORG_ID,
        attemptToken: ATTEMPT_TOKEN,
      }),
    }));
    expect(findFirst).not.toHaveBeenCalled();
  });
});
