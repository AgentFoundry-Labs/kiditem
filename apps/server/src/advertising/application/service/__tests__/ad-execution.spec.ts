import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdExecutionService } from '../ad-execution.service';
import type {
  AdExecutionRepositoryPort,
  ScopedExecutionTaskRow,
} from '../../port/out/repository/ad-execution.repository.port';
import {
  buildMockAdExecutionRepo,
  type MockAdExecutionRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function makeScopedTask(
  overrides: Partial<ScopedExecutionTaskRow> = {},
): ScopedExecutionTaskRow {
  return {
    id: 'task-1',
    actionId: 'action-1',
    status: 'queued',
    workerId: 'worker-1',
    startedAt: null,
    finishedAt: null,
    attempt: 0,
    beforeJson: null,
    afterJson: null,
    screenshotPath: null,
    errorMessage: null,
    action: {
      organizationId: ORGANIZATION_ID,
      actionType: 'change_bid',
      targetType: 'keyword',
      targetLabel: 'keyword',
      externalId: 'KW-1',
      priority: 'high',
      payload: { pageType: 'keyword' },
      beforeJson: null,
      afterJson: null,
      errorMessage: null,
    },
    ...overrides,
  };
}

describe('AdExecutionService tenant-scoped runtime writes', () => {
  let repo: MockAdExecutionRepo;
  let service: AdExecutionService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = buildMockAdExecutionRepo();
    service = new AdExecutionService(
      repo as unknown as AdExecutionRepositoryPort,
    );
  });

  it('lease scopes task leasing through the owning action organization and worker update through organizationId', async () => {
    repo.upsertWorkerForLease.mockResolvedValue({
      id: 'worker-1',
      workerKey: 'worker-key',
    });
    repo.leaseQueuedTasks.mockResolvedValue([
      {
        actionId: 'action-1',
        taskId: 'task-1',
        actionType: 'change_bid',
        targetType: 'keyword',
        targetLabel: 'keyword',
        targetRef: 'KW-1',
        priority: 'high',
        executionMode: 'browser',
        payload: { pageType: 'keyword' },
      },
    ]);

    const result = await service.lease(
      'worker-key',
      { pageType: 'keyword', label: 'Worker' },
      ORGANIZATION_ID,
    );

    expect(result.tasks).toHaveLength(1);
    expect(repo.upsertWorkerForLease).toHaveBeenCalledWith(
      'worker-key',
      { pageType: 'keyword', label: 'Worker' },
      ORGANIZATION_ID,
    );
    expect(repo.leaseQueuedTasks).toHaveBeenCalledWith(
      { id: 'worker-1', workerKey: 'worker-key' },
      'keyword',
      expect.any(Number),
      ORGANIZATION_ID,
    );
  });

  it('report scopes task and action updates to the request organization', async () => {
    const task = makeScopedTask();
    repo.findScopedExecutionTask.mockResolvedValue(task);
    repo.findTaskWorkerKey.mockResolvedValue('worker-key');

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

    expect(repo.findScopedExecutionTask).toHaveBeenCalledWith(
      'task-1',
      ORGANIZATION_ID,
    );
    expect(repo.findTaskWorkerKey).toHaveBeenCalledWith(
      'worker-1',
      ORGANIZATION_ID,
    );
    expect(repo.reportExecutionTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        workerKey: 'worker-key',
        status: 'done',
      }),
      task,
      ORGANIZATION_ID,
    );
  });

  it('report fails instead of writing when a scoped task lookup misses', async () => {
    repo.findScopedExecutionTask.mockResolvedValue(null);

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
    expect(repo.reportExecutionTask).not.toHaveBeenCalled();
  });

  it('report rejects a task leased by another worker before any runtime write', async () => {
    repo.findScopedExecutionTask.mockResolvedValue(makeScopedTask());
    repo.findTaskWorkerKey.mockResolvedValue('other-worker');

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
    expect(repo.reportExecutionTask).not.toHaveBeenCalled();
  });
});
