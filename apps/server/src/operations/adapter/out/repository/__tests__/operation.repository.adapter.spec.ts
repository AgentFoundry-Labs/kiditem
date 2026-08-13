import { describe, expect, it, vi } from 'vitest';
import { MAX_OPERATION_PERSISTED_INT } from '@kiditem/shared/operations';
import {
  mapOperationRunRow,
  OperationRepositoryAdapter,
} from '../operation.repository.adapter';

const ORG_ID = 'df3b198e-5b31-4f86-b054-bbf4852536a5';
const RUN_ID = 'c2e779aa-f5bf-42c2-91f2-dc10be211c71';
const CHILD_ID = 'c3e779aa-f5bf-42c2-91f2-dc10be211c71';
const ATTEMPT_TOKEN = 'ced54820-ab09-4f4b-864c-2a3f873bb24d';
const NOW = new Date('2026-08-13T01:02:03.000Z');

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function sqlText(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as { strings?: unknown }).strings)
  ) {
    return String(value);
  }
  const sql = value as { strings: string[]; values?: unknown[] };
  return sql.strings.reduce(
    (rendered, part, index) =>
      rendered + part + (index < sql.strings.length - 1
        ? sqlText(sql.values?.[index])
        : ''),
    '',
  );
}

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
    signal: new AbortController().signal,
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
      $transaction: vi.fn((callback) => callback({ operationRun: { create } })),
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

describe('OperationRepositoryAdapter lifecycle-gated transition', () => {
  it('keeps a shutdown observed after mutation inside the transaction rollback boundary', async () => {
    const controller = new AbortController();
    const reason = new Error('operation_server_shutdown');
    const updateMany = vi.fn().mockImplementation(async () => {
      controller.abort(reason);
      return { count: 1 };
    });
    const transaction = { operationRun: { updateMany } };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
      operationRun: { findFirst: vi.fn() },
    };
    const repository = new OperationRepositoryAdapter(prisma as never);

    await expect(repository.transition({
      signal: controller.signal,
      organizationId: ORG_ID,
      runId: RUN_ID,
      expectedStatuses: ['waiting_dependency'],
      status: 'queued',
    })).rejects.toBe(reason);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('OperationRepositoryAdapter composite child fencing', () => {
  it('does not read or create a child when the parent active-attempt fence is lost', async () => {
    const findFirst = vi.fn();
    const create = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      operationRun: { findFirst, create },
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
      operationRun: { findFirst: vi.fn() },
    } as never);

    await expect(repository.createChildAndWaitForDependency({
      signal: new AbortController().signal,
      parentOrganizationId: ORG_ID,
      parentRunId: RUN_ID,
      expectedAttemptToken: ATTEMPT_TOKEN,
      child: makeCreateRunInput({
        parentRunId: RUN_ID,
        idempotencyKey: `child:${RUN_ID}`,
      }) as never,
    })).resolves.toBeNull();

    expect(findFirst).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('creates the child only inside a valid parent fence and atomically waits', async () => {
    const findChild = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({
      id: CHILD_ID,
      organizationId: ORG_ID,
    });
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ id: RUN_ID }])
      .mockResolvedValueOnce([{ id: RUN_ID }]);
    const findRun = vi.fn().mockResolvedValue(makeRunRow({
      id: CHILD_ID,
      parentRunId: RUN_ID,
      idempotencyKey: `child:${RUN_ID}`,
      status: 'queued',
    }));
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback({
        $queryRaw: queryRaw,
        operationRun: { findFirst: findChild, create },
      })),
      operationRun: { findFirst: findRun },
    } as never);

    await expect(repository.createChildAndWaitForDependency({
      signal: new AbortController().signal,
      parentOrganizationId: ORG_ID,
      parentRunId: RUN_ID,
      expectedAttemptToken: ATTEMPT_TOKEN,
      child: makeCreateRunInput({
        parentRunId: RUN_ID,
        idempotencyKey: `child:${RUN_ID}`,
      }) as never,
    })).resolves.toMatchObject({ id: CHILD_ID, parentRunId: RUN_ID });

    const lockArguments = queryRaw.mock.calls[0] ?? [];
    expect(String(lockArguments[0])).toContain('WITH locked_parent AS MATERIALIZED');
    expect(String(lockArguments[0])).toContain('FOR UPDATE');
    expect(String(lockArguments[0])).toContain('clock_timestamp() AS locked_at');
    expect(lockArguments).toContain(ORG_ID);
    expect(lockArguments).toContain(RUN_ID);
    expect(lockArguments).toContain(ATTEMPT_TOKEN);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: ORG_ID,
        parentRunId: RUN_ID,
        idempotencyKey: `child:${RUN_ID}`,
      }),
    }));
    expect(String(queryRaw.mock.calls[1]?.[0])).toContain(
      "SET status = 'waiting_dependency'",
    );
  });

  it('reuses an existing idempotent child without creating a duplicate', async () => {
    const create = vi.fn();
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback({
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([{ id: RUN_ID }])
          .mockResolvedValueOnce([{ id: RUN_ID }]),
        operationRun: {
          findFirst: vi.fn().mockResolvedValue({
            id: CHILD_ID,
            organizationId: ORG_ID,
          }),
          create,
        },
      })),
      operationRun: {
        findFirst: vi.fn().mockResolvedValue(makeRunRow({ id: CHILD_ID })),
      },
    } as never);

    await expect(repository.createChildAndWaitForDependency({
      signal: new AbortController().signal,
      parentOrganizationId: ORG_ID,
      parentRunId: RUN_ID,
      expectedAttemptToken: ATTEMPT_TOKEN,
      child: makeCreateRunInput({
        parentRunId: RUN_ID,
        idempotencyKey: `child:${RUN_ID}`,
      }) as never,
    })).resolves.toMatchObject({ id: CHILD_ID });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns null and skips the child read when the final parent fence is lost', async () => {
    const findRun = vi.fn();
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback({
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([{ id: RUN_ID }])
          .mockResolvedValueOnce([]),
        operationRun: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: CHILD_ID,
            organizationId: ORG_ID,
          }),
        },
      })),
      operationRun: { findFirst: findRun },
    } as never);

    await expect(repository.createChildAndWaitForDependency({
      signal: new AbortController().signal,
      parentOrganizationId: ORG_ID,
      parentRunId: RUN_ID,
      expectedAttemptToken: ATTEMPT_TOKEN,
      child: makeCreateRunInput({
        parentRunId: RUN_ID,
        idempotencyKey: `child:${RUN_ID}`,
      }) as never,
    })).resolves.toBeNull();
    expect(findRun).not.toHaveBeenCalled();
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
      signal: new AbortController().signal,
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
      signal: new AbortController().signal,
      organizationId: ORG_ID,
      runtimeId: 'office:kiditem-os',
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deadlineAt: originalDeadline }),
    }));
  });

  it('binds the current wall clock to exclude past-deadline browser claims', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      operationRun: { update: vi.fn() },
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(repository.claimNextBrowserRun({
      signal: new AbortController().signal,
      organizationId: ORG_ID,
      runtimeId: 'office:kiditem-os',
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
    })).resolves.toBeNull();

    const rawQueryArguments = transaction.$queryRaw.mock.calls[0] ?? [];
    const queryText = String(rawQueryArguments[0]);
    expect(queryText).toContain(
      'deadline_at IS NULL OR deadline_at >',
    );
    expect(rawQueryArguments).toContain(NOW);
    expect(transaction.operationRun.update).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', {}],
    ['malformed', { deadline_at: '2026-08-13T01:10:00.000Z' }],
    ['invalid Date', { deadline_at: new Date(Number.NaN) }],
  ])('rejects a %s raw browser deadline before mutation', async (
    _name,
    deadlineFields,
  ) => {
    const update = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: RUN_ID,
        execution_timeout_ms: 900_000,
        ...deadlineFields,
      }]),
      operationRun: { update },
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(repository.claimNextBrowserRun({
      signal: new AbortController().signal,
      organizationId: ORG_ID,
      runtimeId: 'office:kiditem-os',
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
    })).rejects.toThrow('operation_run_persisted_execution_metadata_invalid');
    expect(update).not.toHaveBeenCalled();
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
      signal: new AbortController().signal,
      organizationId: ORG_ID,
      runtimeId: 'office:kiditem-os',
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
    })).rejects.toThrow('operation_run_persisted_execution_metadata_invalid');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('OperationRepositoryAdapter server claim fencing', () => {
  it('selects only queued work and never reclaims an expired running lease', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      operationRun: { update: vi.fn() },
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
      operationRun: { findFirst: vi.fn() },
    } as never);

    await repository.claimNextRun({
      resourceClass: 'default',
      workerId: 'operations:test',
      now: NOW,
      leaseExpiresAt: new Date(NOW.getTime() + 60_000),
      signal: new AbortController().signal,
    });

    const queryText = String(transaction.$queryRaw.mock.calls[0]?.[0]);
    expect(queryText).toContain("status = 'queued'");
    expect(queryText).not.toContain("status = 'running'");
    expect(queryText).not.toContain('lease_expires_at <=');
  });

  it('cancels after candidate selection without mutating the selected run', async () => {
    const selection = deferred<Array<{
      id: string;
      organization_id: string;
      deadline_at: Date | null;
      execution_timeout_ms: number;
    }>>();
    const update = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockReturnValue(selection.promise),
      operationRun: { update },
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
      operationRun: { findFirst: vi.fn() },
    } as never);
    const controller = new AbortController();
    const reason = new Error('operation_worker_shutdown');

    const claim = repository.claimNextRun({
      resourceClass: 'naver_api',
      workerId: 'operations:test',
      now: NOW,
      leaseExpiresAt: new Date('2026-08-13T01:03:03.000Z'),
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(transaction.$queryRaw).toHaveBeenCalledOnce());
    controller.abort(reason);
    selection.resolve([{
      id: RUN_ID,
      organization_id: ORG_ID,
      deadline_at: null,
      execution_timeout_ms: 900_000,
    }]);

    await expect(claim).rejects.toBe(reason);
    expect(update).not.toHaveBeenCalled();
  });

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
      signal: new AbortController().signal,
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
      signal: new AbortController().signal,
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
      signal: new AbortController().signal,
    })).rejects.toThrow('operation_run_persisted_execution_metadata_invalid');
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['non-Date', '2026-08-13T01:09:00.000Z'],
    ['invalid Date', new Date(Number.NaN)],
  ])('rejects %s raw deadline metadata before a server claim update', async (
    _case,
    deadlineAt,
  ) => {
    const update = vi.fn();
    const candidate: Record<string, unknown> = {
      id: RUN_ID,
      organization_id: ORG_ID,
      execution_timeout_ms: 900_000,
    };
    if (_case !== 'missing') candidate.deadline_at = deadlineAt;
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([candidate]),
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
      signal: new AbortController().signal,
    })).rejects.toThrow('operation_run_persisted_execution_metadata_invalid');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('OperationRepositoryAdapter lifecycle database boundary', () => {
  it('reads the lifecycle cutoff from PostgreSQL', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ database_time: NOW }]);
    const repository = new OperationRepositoryAdapter({ $queryRaw: queryRaw } as never);

    await expect(repository.readLifecycleDatabaseTime()).resolves.toEqual(NOW);
    expect(sqlText(queryRaw.mock.calls[0]?.[0])).toContain(
      'clock_timestamp() AS database_time',
    );
  });

  it('cancels every owner domain in the four active statuses through one bounded transaction', async () => {
    const transaction = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ set_config: '250' }])
        .mockResolvedValueOnce([{ id: RUN_ID, organization_id: ORG_ID }])
        .mockResolvedValueOnce([{ remaining: true }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);
    const errorMessage = 'API process lifecycle expired';

    await expect(repository.cancelRunsForLifecycle({
      cutoff: NOW,
      errorCode: 'operation_server_lifecycle_expired',
      errorMessage,
      finishedAt: NOW,
      limit: 100,
      statementTimeoutMs: 250,
    })).resolves.toEqual({ updated: 1, remaining: true });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(3);
    const timeoutCall = transaction.$queryRaw.mock.calls[0] ?? [];
    expect(sqlText(timeoutCall[0])).toContain("set_config('statement_timeout'");
    expect(timeoutCall).toContain('250');

    const selectCall = transaction.$queryRaw.mock.calls[1] ?? [];
    const selectSql = sqlText(selectCall[0]);
    expect(selectSql).toContain(
      "status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')",
    );
    expect(selectSql).toContain('created_at <=');
    expect(selectSql).not.toContain('owner_domain');
    expect(selectSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(selectSql).toContain('LIMIT');
    expect(selectCall).toContain(NOW);
    expect(selectCall).toContain(100);

    const updateCall = transaction.$executeRaw.mock.calls[0] ?? [];
    const updateSql = sqlText(updateCall[0]);
    expect(updateSql).toContain("SET status = 'cancelled'");
    expect(updateSql).toContain('error_code =');
    expect(updateSql).toContain('error_message =');
    expect(updateSql).toContain('finished_at =');
    expect(updateSql).toContain('claimed_by = NULL');
    expect(updateSql).toContain('attempt_token = NULL');
    expect(updateSql).toContain('claimed_at = NULL');
    expect(updateSql).toContain('lease_expires_at = NULL');
    expect(updateSql).toContain('id =');
    expect(updateSql).toContain('organization_id =');
    expect(updateSql).not.toContain('attempts =');
    expect(updateSql).not.toContain('started_at =');
    expect(updateSql).not.toContain('progress =');
    expect(updateSql).not.toContain('stage =');
    expect(updateSql).not.toContain('deadline_at =');
    expect(updateSql).not.toContain('schedule_id =');
    expect(updateSql).not.toContain('idempotency_key =');
    expect(updateSql).not.toContain('parent_run_id =');
    expect(updateSql).not.toContain('result =');
    expect(updateCall).toEqual(expect.arrayContaining([
      'operation_server_lifecycle_expired',
      errorMessage,
      NOW,
      RUN_ID,
      ORG_ID,
    ]));

    const remainingSql = sqlText(transaction.$queryRaw.mock.calls[2]?.[0]);
    expect(remainingSql).toContain('SELECT EXISTS');
    expect(remainingSql).toContain('created_at <=');
    expect(remainingSql).not.toContain('FOR UPDATE');
  });

  it('uses no cutoff predicate for graceful all-current cancellation', async () => {
    const transaction = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ set_config: '100' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ remaining: false }]),
      $executeRaw: vi.fn(),
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(repository.cancelRunsForLifecycle({
      cutoff: null,
      errorCode: 'operation_server_shutdown',
      errorMessage: 'API server shutdown',
      finishedAt: NOW,
      limit: 100,
      statementTimeoutMs: 100,
    })).resolves.toEqual({ updated: 0, remaining: false });

    expect(sqlText(transaction.$queryRaw.mock.calls[1]?.[0])).not.toContain(
      'created_at <=',
    );
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('fails closed when PostgreSQL does not return the remaining predicate', async () => {
    const transaction = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ set_config: '100' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      $executeRaw: vi.fn(),
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(repository.cancelRunsForLifecycle({
      cutoff: NOW,
      errorCode: 'operation_server_lifecycle_expired',
      errorMessage: 'Expired lifecycle',
      finishedAt: NOW,
      limit: 100,
      statementTimeoutMs: 100,
    })).rejects.toThrow('operation_lifecycle_remaining_invalid');
  });

  it.each([
    ['zero limit', { limit: 0, statementTimeoutMs: 100 }],
    ['overlarge limit', { limit: 101, statementTimeoutMs: 100 }],
    ['zero timeout', { limit: 100, statementTimeoutMs: 0 }],
    ['fractional timeout', { limit: 100, statementTimeoutMs: 1.5 }],
  ])('rejects %s before starting a transaction', async (_case, invalid) => {
    const transaction = vi.fn();
    const repository = new OperationRepositoryAdapter({
      $transaction: transaction,
    } as never);

    await expect(repository.cancelRunsForLifecycle({
      cutoff: NOW,
      errorCode: 'operation_server_shutdown',
      errorMessage: 'API server shutdown',
      finishedAt: NOW,
      ...invalid,
    })).rejects.toThrow('operation_lifecycle_batch_options_invalid');
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('OperationRepositoryAdapter lifecycle schedule boundary', () => {
  it('advances both policies strictly past cutoff without dispatch or lastScheduledFor writes', async () => {
    const firstScheduleId = 'c4e779aa-f5bf-42c2-91f2-dc10be211c71';
    const secondScheduleId = 'c5e779aa-f5bf-42c2-91f2-dc10be211c71';
    const dueAt = new Date('2026-08-13T01:00:00.000Z');
    const transaction = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ set_config: '250' }])
        .mockResolvedValueOnce([
          {
            id: firstScheduleId,
            organization_id: ORG_ID,
            cron_expression: '0 * * * *',
            time_zone: 'UTC',
            next_run_at: dueAt,
            misfire_policy: 'skip',
          },
          {
            id: secondScheduleId,
            organization_id: ORG_ID,
            cron_expression: '0 * * * *',
            time_zone: 'UTC',
            next_run_at: dueAt,
            misfire_policy: 'catch_up_once',
          },
        ])
        .mockResolvedValueOnce([{ remaining: false }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(repository.advanceSchedulesPastLifecycleCutoff({
      cutoff: NOW,
      limit: 100,
      statementTimeoutMs: 250,
    })).resolves.toEqual({ updated: 2, remaining: false });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(2);
    for (const updateCall of transaction.$executeRaw.mock.calls) {
      const updateSql = sqlText(updateCall[0]);
      expect(updateSql).toContain('UPDATE operation_schedules');
      expect(updateSql).toContain('SET next_run_at =');
      expect(updateSql).toContain('id =');
      expect(updateSql).toContain('organization_id =');
      expect(updateSql).toContain('enabled = TRUE');
      expect(updateSql).toContain('next_run_at =');
      expect(updateSql).not.toContain('last_scheduled_for');
      expect(updateCall.some(
        (value) => value instanceof Date &&
          value.getTime() === new Date('2026-08-13T02:00:00.000Z').getTime(),
      )).toBe(true);
      expect(updateCall).toContain(dueAt);
    }
    expect(sqlText(transaction.$queryRaw.mock.calls[1]?.[0])).toContain(
      'next_run_at <=',
    );
    expect(sqlText(transaction.$queryRaw.mock.calls[2]?.[0])).toContain(
      'SELECT EXISTS',
    );
  });

  it('fails closed when PostgreSQL omits schedule remaining state', async () => {
    const transaction = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ set_config: '100' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      $executeRaw: vi.fn(),
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(repository.advanceSchedulesPastLifecycleCutoff({
      cutoff: NOW,
      limit: 100,
      statementTimeoutMs: 100,
    })).rejects.toThrow('operation_lifecycle_remaining_invalid');
  });
});

describe('OperationRepositoryAdapter exact lifecycle attempt cancellation', () => {
  it('terminal-cancels only the exact claimed server attempt without decrementing it', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const repository = new OperationRepositoryAdapter({ $executeRaw: executeRaw } as never);

    await expect(repository.cancelClaimedAttemptForLifecycle({
      organizationId: ORG_ID,
      runId: RUN_ID,
      expectedAttemptToken: ATTEMPT_TOKEN,
      claimedBy: 'operations:test',
      errorCode: 'operation_server_shutdown',
      finishedAt: NOW,
    })).resolves.toBe(true);

    const rawCall = executeRaw.mock.calls[0] ?? [];
    const queryText = sqlText(rawCall[0]);
    expect(queryText).toContain("SET status = 'cancelled'");
    expect(queryText).toContain("status = 'running'");
    expect(queryText).toContain('attempt_token =');
    expect(queryText).toContain('claimed_by =');
    expect(queryText).toContain('claimed_by = NULL');
    expect(queryText).toContain('attempt_token = NULL');
    expect(queryText).toContain('claimed_at = NULL');
    expect(queryText).toContain('lease_expires_at = NULL');
    expect(queryText).not.toContain('attempts =');
    expect(rawCall).toEqual(expect.arrayContaining([
      ORG_ID,
      RUN_ID,
      ATTEMPT_TOKEN,
      'operations:test',
      'operation_server_shutdown',
      NOW,
    ]));
  });
});

describe('OperationRepositoryAdapter lost worker attempt sweep', () => {
  it('boundedly terminal-cancels only exact expired running worker attempts', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: RUN_ID,
        organization_id: ORG_ID,
        attempt_token: ATTEMPT_TOKEN,
        claimed_by: 'operations-1234',
      }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const repository = new OperationRepositoryAdapter({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(repository.cancelExpiredWorkerAttempts({
      now: NOW,
      limit: 7,
    })).resolves.toBe(1);

    const selectCall = transaction.$queryRaw.mock.calls[0] ?? [];
    const selectSql = sqlText(selectCall[0]);
    expect(selectSql).toContain("status = 'running'");
    expect(selectSql).toContain("claimed_by LIKE 'operations-%'");
    expect(selectSql).toContain('lease_expires_at <=');
    expect(selectSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(selectSql).not.toContain("status = 'queued'");
    expect(selectCall).toContain(NOW);
    expect(selectCall).toContain(7);

    const updateCall = transaction.$executeRaw.mock.calls[0] ?? [];
    const updateSql = sqlText(updateCall[0]);
    expect(updateSql).toContain("error_code = 'operation_worker_lost'");
    expect(updateSql).toContain('organization_id =');
    expect(updateSql).toContain('attempt_token =');
    expect(updateSql).toContain('claimed_by =');
    expect(updateSql).not.toContain('attempts =');
    expect(updateCall).toEqual(expect.arrayContaining([
      RUN_ID,
      ORG_ID,
      ATTEMPT_TOKEN,
      'operations-1234',
      NOW,
    ]));
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

describe('OperationRepositoryAdapter active-attempt transition fence', () => {
  it('atomically persists validated stage and normalized paired counts', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: RUN_ID }]);
    const repository = new OperationRepositoryAdapter({
      $queryRaw: queryRaw,
      operationRun: { findFirst: vi.fn().mockResolvedValue(makeRunRow()) },
    } as never);

    await repository.transitionActiveAttempt({
      organizationId: ORG_ID,
      runId: RUN_ID,
      expectedStatuses: ['running'],
      expectedAttemptToken: ATTEMPT_TOKEN,
      status: 'succeeded',
      progress: 1,
      stage: 'completed',
      progressCurrent: 11,
      progressTotal: 12,
      result: { outcome: 'partial', imported: 11 },
    });

    const rawQueryArguments = queryRaw.mock.calls[0] ?? [];
    const assignments = rawQueryArguments.find(
      (argument) =>
        typeof argument === 'object' &&
        argument !== null &&
        Array.isArray((argument as { strings?: unknown }).strings),
    ) as { strings: string[]; values: unknown[] };
    const assignmentText = assignments.strings.join('?');
    expect(assignmentText).toContain('stage_updated_at = CASE');
    expect(assignmentText).toContain('stage IS DISTINCT FROM');
    expect(assignmentText).toContain('progress_current =');
    expect(assignmentText).toContain('progress_total =');
    expect(assignments.values).toContain('completed');
    expect(assignments.values).toContain(11);
    expect(assignments.values).toContain(12);
    expect(assignments.values).toContain(11 / 12);
  });

  it('atomically requires the exact token and database-current lease and deadline', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: RUN_ID }]);
    const findFirst = vi.fn().mockResolvedValue(makeRunRow({ status: 'succeeded' }));
    const repository = new OperationRepositoryAdapter({
      $queryRaw: queryRaw,
      operationRun: { findFirst },
    } as never);

    await repository.transitionActiveAttempt({
      organizationId: ORG_ID,
      runId: RUN_ID,
      expectedStatuses: ['running'],
      expectedAttemptToken: ATTEMPT_TOKEN,
      status: 'succeeded',
      result: { collected: 3 },
      progress: 1,
      finishedAt: NOW,
      claimedBy: null,
      attemptToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
    });

    const rawQueryArguments = queryRaw.mock.calls[0] ?? [];
    const queryText = String(rawQueryArguments[0]);
    expect(queryText).toContain('attempt_token =');
    expect(queryText).toContain('WITH locked_attempt AS MATERIALIZED');
    expect(queryText).toContain('FOR UPDATE');
    expect(queryText).toContain('clock_timestamp() AS locked_at');
    expect(queryText).toContain(
      'lease_expires_at > fenced_attempt.locked_at',
    );
    expect(queryText).toContain('deadline_at > fenced_attempt.locked_at');
    expect(rawQueryArguments).toContain(ORG_ID);
    expect(rawQueryArguments).toContain(RUN_ID);
    expect(rawQueryArguments).toContain(ATTEMPT_TOKEN);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: RUN_ID, organizationId: ORG_ID },
    }));
  });

  it('returns null without reading when the atomic active-attempt update loses its fence', async () => {
    const findFirst = vi.fn();
    const repository = new OperationRepositoryAdapter({
      $queryRaw: vi.fn().mockResolvedValue([]),
      operationRun: { findFirst },
    } as never);

    await expect(repository.transitionActiveAttempt({
      organizationId: ORG_ID,
      runId: RUN_ID,
      expectedStatuses: ['running'],
      expectedAttemptToken: ATTEMPT_TOKEN,
      status: 'queued',
      claimedBy: null,
      attemptToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
    })).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
