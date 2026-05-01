import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdExecutionService } from '../ad-execution.service';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    actionId: 'action-1',
    workerId: 'worker-1',
    status: 'queued',
    startedAt: null,
    beforeJson: null,
    afterJson: null,
    screenshotPath: null,
    worker: { workerKey: 'worker-key' },
    action: {
      id: 'action-1',
      actionType: 'change_bid',
      targetType: 'keyword',
      targetLabel: 'keyword',
      externalId: 'KW-1',
      priority: 'high',
      payload: { pageType: 'keyword' },
      beforeJson: null,
      afterJson: null,
    },
    ...overrides,
  };
}

function makePrisma() {
  const tx = {
    executionTask: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    executionWorker: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    adAction: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    executionLog: {
      createMany: vi.fn(async () => ({ count: 1 })),
    },
  };

  return {
    tx,
    prisma: {
      executionWorker: {
        findFirst: vi.fn(async () => ({ id: 'worker-1', workerKey: 'worker-key' })),
        update: vi.fn(async () => ({ id: 'worker-1', workerKey: 'worker-key' })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async () => ({ id: 'worker-1', workerKey: 'worker-key' })),
      },
      executionTask: {
        findMany: vi.fn(async () => [makeTask()]),
        findFirst: vi.fn(async () => makeTask()),
      },
      $transaction: vi.fn(async (fn: (txArg: typeof tx) => Promise<void>) => fn(tx)),
    },
  };
}

describe('AdExecutionService tenant-scoped runtime writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lease scopes task leasing through the owning action organization and worker update through organizationId', async () => {
    const { prisma, tx } = makePrisma();
    const service = new AdExecutionService(prisma as never);

    const result = await service.lease(
      'worker-key',
      { pageType: 'keyword', label: 'Worker' },
      ORGANIZATION_ID,
    );

    expect(result.tasks).toHaveLength(1);
    expect(tx.executionTask.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', status: 'queued', action: { organizationId: ORGANIZATION_ID } },
      data: expect.objectContaining({
        status: 'leased',
        workerId: 'worker-1',
        attempt: { increment: 1 },
      }),
    });
    expect(tx.executionWorker.updateMany).toHaveBeenCalledWith({
      where: { id: 'worker-1', organizationId: ORGANIZATION_ID },
      data: expect.objectContaining({
        currentTaskRef: 'task-1',
      }),
    });
  });

  it('report scopes task and action updates to the request organization', async () => {
    const { prisma, tx } = makePrisma();
    const service = new AdExecutionService(prisma as never);

    await service.report(
      {
        taskId: 'task-1',
        workerKey: 'worker-key',
        status: 'done',
        before: { bid: 1200 },
        after: { bid: 1000 },
      },
      ORGANIZATION_ID,
    );

    expect(tx.executionTask.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', action: { organizationId: ORGANIZATION_ID } },
      data: expect.objectContaining({
        status: 'done',
        errorMessage: null,
      }),
    });
    expect(tx.adAction.updateMany).toHaveBeenCalledWith({
      where: { id: 'action-1', organizationId: ORGANIZATION_ID },
      data: expect.objectContaining({
        executeStatus: 'done',
        errorMessage: null,
      }),
    });
    expect(prisma.executionWorker.findFirst).toHaveBeenCalledWith({
      where: { id: 'worker-1', organizationId: ORGANIZATION_ID },
      select: { workerKey: true },
    });
  });

  it('report fails instead of writing when a scoped task update becomes a no-op', async () => {
    const { prisma, tx } = makePrisma();
    tx.executionTask.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = new AdExecutionService(prisma as never);

    await expect(
      service.report(
        {
          taskId: 'task-1',
          workerKey: 'worker-key',
          status: 'running',
        },
        ORGANIZATION_ID,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.adAction.updateMany).not.toHaveBeenCalled();
  });

  it('report rejects a task leased by another worker before any runtime write', async () => {
    const { prisma, tx } = makePrisma();
    prisma.executionTask.findFirst.mockResolvedValueOnce(
      makeTask(),
    );
    prisma.executionWorker.findFirst.mockResolvedValueOnce(
      { workerKey: 'other-worker' },
    );
    const service = new AdExecutionService(prisma as never);

    await expect(
      service.report(
        {
          taskId: 'task-1',
          workerKey: 'worker-key',
          status: 'running',
        },
        ORGANIZATION_ID,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.executionTask.updateMany).not.toHaveBeenCalled();
  });
});
