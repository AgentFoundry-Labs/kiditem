import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import type { OperationDefinition } from '../../../../../common/operation-definition';
import type { OperationRunRecord } from '../../port/out/repository/operation.repository.port';
import { CompositeOperationCoordinatorService } from '../composite-operation-coordinator.service';

const ORG_ID = '5e29b0f8-17be-4b95-9a16-5b9cfc952e99';
const PARENT_ID = '4313fb12-dc40-4b51-881b-df83f6308b6d';
const CHILD_ID = '4413fb12-dc40-4b51-881b-df83f6308b6d';

const definition: OperationDefinition = {
  key: 'inventory.refresh_sellpia_snapshot',
  version: 1,
  title: '셀피아 재고 스냅샷 갱신',
  ownerDomain: 'inventory',
  engineType: 'browser',
  allowedTriggers: ['domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  inputSchema: z.object({ scope: z.literal('full') }).strict(),
};

function run(input: Partial<OperationRunRecord> = {}): OperationRunRecord {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return {
    id: PARENT_ID,
    organizationId: ORG_ID,
    operationKey: 'products.refresh_profitability_evidence',
    definitionVersion: 1,
    ownerDomain: 'products',
    title: '수익성 데이터 갱신',
    engineType: 'composite',
    status: 'running',
    triggerSource: 'domain_screen',
    requestedByUserId: null,
    parentRunId: null,
    scheduleId: null,
    idempotencyKey: 'profitability:parent',
    input: {},
    result: null,
    progress: null,
    nativeRunType: null,
    nativeRunId: null,
    attempts: 1,
    maxAttempts: 3,
    claimedBy: 'worker',
    attemptToken: '5113fb12-dc40-4b51-881b-df83f6308b6d',
    claimedAt: now,
    leaseExpiresAt: now,
    scheduledFor: null,
    errorCode: null,
    errorMessage: null,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    requestedBy: null,
    ...input,
  };
}

describe('CompositeOperationCoordinatorService', () => {
  it('creates one fenced child before moving its parent to waiting_dependency', async () => {
    const parent = run();
    const child = run({
      id: CHILD_ID,
      operationKey: definition.key,
      ownerDomain: definition.ownerDomain,
      title: definition.title,
      engineType: definition.engineType,
      parentRunId: parent.id,
      idempotencyKey: `profitability:${parent.id}:${definition.key}`,
      status: 'queued',
    });
    const repository = {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      createRun: vi.fn().mockResolvedValue(child),
      transition: vi.fn().mockResolvedValue(run({ status: 'waiting_dependency' })),
    };
    const registry = {
      getDefinition: vi.fn().mockReturnValue(definition),
      parseInput: vi.fn().mockReturnValue({ scope: 'full' }),
    };
    const service = new CompositeOperationCoordinatorService(
      registry as never,
      repository as never,
    );

    await service.waitForChild({
      parent,
      child: {
        operationKey: definition.key,
        input: { scope: 'full' },
        idempotencyKey: `profitability:${parent.id}:${definition.key}`,
      },
    });

    expect(repository.createRun).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      parentRunId: PARENT_ID,
      operationKey: definition.key,
    }));
    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      runId: PARENT_ID,
      status: 'waiting_dependency',
      expectedAttemptToken: parent.attemptToken,
    }));
  });

  it('requeues a parent after a succeeded child without consuming another attempt', async () => {
    const parent = run({ status: 'waiting_dependency', attemptToken: null, claimedBy: null });
    const child = run({ id: CHILD_ID, parentRunId: PARENT_ID, status: 'succeeded' });
    const repository = {
      listWaitingDependencyParents: vi.fn().mockResolvedValue([parent]),
      listChildRuns: vi.fn().mockResolvedValue([child]),
      transition: vi.fn().mockResolvedValue(parent),
    };
    const service = new CompositeOperationCoordinatorService({
      getHandler: vi.fn().mockReturnValue({}),
    } as never, repository as never);

    await service.resumeTerminalChildren(new Date('2026-08-01T01:00:00.000Z'));

    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      runId: PARENT_ID,
      expectedStatuses: ['waiting_dependency'],
      status: 'queued',
      attemptDelta: -1,
    }));
  });

  it('cancels only the non-terminal children of the selected parent', async () => {
    const parent = run({ status: 'waiting_dependency', attemptToken: null, claimedBy: null });
    const child = run({ id: CHILD_ID, parentRunId: PARENT_ID, status: 'running' });
    const terminalChild = run({ id: '5513fb12-dc40-4b51-881b-df83f6308b6d', parentRunId: PARENT_ID, status: 'succeeded' });
    const repository = {
      listChildRuns: vi.fn().mockResolvedValue([child, terminalChild]),
      transition: vi.fn().mockResolvedValue(child),
    };
    const service = new CompositeOperationCoordinatorService({
      getHandler: vi.fn().mockReturnValue({}),
    } as never, repository as never);

    await service.cancelChildren(parent, 'operator_cancelled');

    expect(repository.transition).toHaveBeenCalledTimes(1);
    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      runId: CHILD_ID,
      status: 'cancelled',
    }));
  });
});
