import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { CompositeOperationCoordinatorService } from '../composite-operation-coordinator.service';
import { OperationLifecycleGateService } from '../operation-lifecycle-gate.service';
import type { OperationDefinition } from '../../../../../common/operation-definition';
import type { OperationRunRecord } from '../../port/out/repository/operation.repository.port';

const ORG_ID = '5e29b0f8-17be-4b95-9a16-5b9cfc952e99';
const PARENT_ID = '4313fb12-dc40-4b51-881b-df83f6308b6d';
const CHILD_ID = '4413fb12-dc40-4b51-881b-df83f6308b6d';
const SECOND_CHILD_ID = '4513fb12-dc40-4b51-881b-df83f6308b6d';
const THIRD_CHILD_ID = '4613fb12-dc40-4b51-881b-df83f6308b6d';

const definition: OperationDefinition = {
  key: 'inventory.refresh_sellpia_snapshot',
  version: 1,
  title: '셀피아 재고 스냅샷 갱신',
  ownerDomain: 'inventory',
  engineType: 'browser',
  allowedTriggers: ['domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'default',
  executionTimeoutMs: 900_000,
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
    resourceClass: 'default',
    executionTimeoutMs: 900_000,
    status: 'running',
    triggerSource: 'domain_screen',
    requestedByUserId: null,
    parentRunId: null,
    scheduleId: null,
    idempotencyKey: 'profitability:parent',
    input: {},
    result: null,
    progress: null,
    stage: null,
    stageUpdatedAt: null,
    progressCurrent: null,
    progressTotal: null,
    deadlineAt: null,
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

function acceptingGate(): OperationLifecycleGateService {
  const gate = new OperationLifecycleGateService();
  gate.open();
  return gate;
}

describe('CompositeOperationCoordinatorService', () => {
  it('atomically fences its parent, creates 2-20 distinct children, and waits for all dependencies', async () => {
    const parent = run();
    const definitions = [
      {
        ...definition,
        key: 'sourcing.collect_naver_trends',
        resourceClass: 'naver_api' as const,
      },
      {
        ...definition,
        key: 'sourcing.collect_1688_trends',
        resourceClass: 'playwright_1688' as const,
      },
      {
        ...definition,
        key: 'sourcing.collect_shorts_trends',
        resourceClass: 'default' as const,
      },
    ];
    const repository = {
      createChildrenAndWaitForDependencies: vi.fn().mockResolvedValue([
        run({ id: CHILD_ID, parentRunId: parent.id, operationKey: definitions[0].key }),
        run({ id: SECOND_CHILD_ID, parentRunId: parent.id, operationKey: definitions[1].key }),
        run({ id: THIRD_CHILD_ID, parentRunId: parent.id, operationKey: definitions[2].key }),
      ]),
    };
    const registry = {
      getDefinition: vi.fn((key: string) => definitions.find((item) => item.key === key)),
      parseInput: vi.fn((_key: string, input: Record<string, unknown>) => input),
    };
    const service = new CompositeOperationCoordinatorService(
      registry as never,
      repository as never,
      acceptingGate(),
    );
    const children = definitions.map((item) => ({
      operationKey: item.key,
      input: { source: item.key.split('.')[1] },
      idempotencyKey: `${parent.id}:${item.key}`,
    }));

    await service.waitForChildren({ parent, children });

    expect(repository.createChildrenAndWaitForDependencies).toHaveBeenCalledOnce();
    expect(repository.createChildrenAndWaitForDependencies).toHaveBeenCalledWith({
      parentOrganizationId: ORG_ID,
      parentRunId: PARENT_ID,
      expectedAttemptToken: parent.attemptToken,
      signal: expect.any(AbortSignal),
      children: definitions.map((item) => expect.objectContaining({
        organizationId: ORG_ID,
        parentRunId: PARENT_ID,
        operationKey: item.key,
        resourceClass: item.resourceClass,
        idempotencyKey: `${parent.id}:${item.key}`,
      })),
    });
  });

  it.each([
    {
      label: 'one child',
      children: [{ operationKey: definition.key, input: {}, idempotencyKey: 'only-child' }],
    },
    {
      label: 'duplicate operation keys',
      children: [
        { operationKey: definition.key, input: {}, idempotencyKey: 'child-a' },
        { operationKey: definition.key, input: {}, idempotencyKey: 'child-b' },
      ],
    },
    {
      label: 'duplicate idempotency keys',
      children: [
        { operationKey: 'sourcing.collect_naver_trends', input: {}, idempotencyKey: 'same' },
        { operationKey: 'sourcing.collect_1688_trends', input: {}, idempotencyKey: 'same' },
      ],
    },
    {
      label: 'twenty-one children',
      children: Array.from({ length: 21 }, (_, index) => ({
        operationKey: `sourcing.child_${index}`,
        input: {},
        idempotencyKey: `child-${index}`,
      })),
    },
  ])('rejects an invalid multi-child contract: $label', async ({ children }) => {
    const repository = { createChildrenAndWaitForDependencies: vi.fn() };
    const service = new CompositeOperationCoordinatorService({
      getDefinition: vi.fn().mockReturnValue(definition),
      parseInput: vi.fn().mockReturnValue({ scope: 'full' }),
    } as never, repository as never, acceptingGate());

    await expect(service.waitForChildren({ parent: run(), children }))
      .rejects.toThrow('operation_composite_children_invalid');
    expect(repository.createChildrenAndWaitForDependencies).not.toHaveBeenCalled();
  });

  it('atomically fences its parent, creates one child, and waits for dependency', async () => {
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
      createChildAndWaitForDependency: vi.fn().mockResolvedValue(child),
      findByIdempotencyKey: vi.fn(),
      createRun: vi.fn(),
      transitionActiveAttempt: vi.fn(),
    };
    const registry = {
      getDefinition: vi.fn().mockReturnValue(definition),
      parseInput: vi.fn().mockReturnValue({ scope: 'full' }),
    };
    const service = new CompositeOperationCoordinatorService(
      registry as never,
      repository as never,
      acceptingGate(),
    );

    await service.waitForChild({
      parent,
      child: {
        operationKey: definition.key,
        input: { scope: 'full' },
        idempotencyKey: `profitability:${parent.id}:${definition.key}`,
      },
    });

    expect(repository.createChildAndWaitForDependency).toHaveBeenCalledWith({
      parentOrganizationId: ORG_ID,
      parentRunId: PARENT_ID,
      expectedAttemptToken: parent.attemptToken,
      signal: expect.any(AbortSignal),
      child: expect.objectContaining({
        organizationId: ORG_ID,
        parentRunId: PARENT_ID,
        operationKey: definition.key,
        resourceClass: definition.resourceClass,
        executionTimeoutMs: definition.executionTimeoutMs,
      }),
    });
    expect(repository.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(repository.createRun).not.toHaveBeenCalled();
    expect(repository.transitionActiveAttempt).not.toHaveBeenCalled();
  });

  it('rejects a lost parent fence without falling back to child creation', async () => {
    const parent = run();
    const repository = {
      createChildAndWaitForDependency: vi.fn().mockResolvedValue(null),
      findByIdempotencyKey: vi.fn(),
      createRun: vi.fn(),
      transitionActiveAttempt: vi.fn(),
    };
    const service = new CompositeOperationCoordinatorService({
      getDefinition: vi.fn().mockReturnValue(definition),
      parseInput: vi.fn().mockReturnValue({ scope: 'full' }),
    } as never, repository as never, acceptingGate());

    await expect(service.waitForChild({
      parent,
      child: {
        operationKey: definition.key,
        input: { scope: 'full' },
        idempotencyKey: `profitability:${parent.id}:${definition.key}`,
      },
    })).rejects.toThrow('operation_attempt_fence_lost');
    expect(repository.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(repository.createRun).not.toHaveBeenCalled();
    expect(repository.transitionActiveAttempt).not.toHaveBeenCalled();
  });

  it('requeues a parent after a succeeded child without decrementing its attempt history', async () => {
    const parent = run({ status: 'waiting_dependency', attemptToken: null, claimedBy: null });
    const child = run({ id: CHILD_ID, parentRunId: PARENT_ID, status: 'succeeded' });
    const repository = {
      listWaitingDependencyParents: vi.fn().mockResolvedValue([parent]),
      listChildRuns: vi.fn().mockResolvedValue([child]),
      transition: vi.fn().mockResolvedValue(parent),
    };
    const service = new CompositeOperationCoordinatorService({
      getHandler: vi.fn().mockReturnValue({}),
    } as never, repository as never, acceptingGate());

    await service.resumeTerminalChildren(new Date('2026-08-01T01:00:00.000Z'));

    const transition = repository.transition.mock.calls[0]?.[0];
    expect(transition).toEqual(expect.objectContaining({
      runId: PARENT_ID,
      expectedStatuses: ['waiting_dependency'],
      status: 'queued',
    }));
    expect(transition).not.toHaveProperty('attemptDelta');
  });

  it('waits until every child is terminal, then requeues once for all-settled aggregation', async () => {
    const parent = run({ status: 'waiting_dependency', attemptToken: null, claimedBy: null });
    const running = run({ id: CHILD_ID, parentRunId: PARENT_ID, status: 'running' });
    const succeeded = run({ id: SECOND_CHILD_ID, parentRunId: PARENT_ID, status: 'succeeded' });
    const failed = run({ id: THIRD_CHILD_ID, parentRunId: PARENT_ID, status: 'failed' });
    const repository = {
      listWaitingDependencyParents: vi.fn().mockResolvedValue([parent]),
      listChildRuns: vi.fn()
        .mockResolvedValueOnce([running, succeeded, failed])
        .mockResolvedValueOnce([{ ...running, status: 'cancelled' }, succeeded, failed]),
      transition: vi.fn().mockResolvedValue(parent),
    };
    const service = new CompositeOperationCoordinatorService({
      getHandler: vi.fn().mockReturnValue({}),
    } as never, repository as never, acceptingGate());

    await service.resumeTerminalChildren(new Date('2026-08-01T01:00:00.000Z'));
    expect(repository.transition).not.toHaveBeenCalled();

    await service.resumeTerminalChildren(new Date('2026-08-01T01:00:01.000Z'));
    expect(repository.transition).toHaveBeenCalledOnce();
    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      runId: PARENT_ID,
      expectedStatuses: ['waiting_dependency'],
      status: 'queued',
      signal: expect.any(AbortSignal),
    }));
  });

  it('propagates attention only after every child is terminal', async () => {
    const parent = run({ status: 'waiting_dependency', attemptToken: null, claimedBy: null });
    const attention = run({
      id: CHILD_ID,
      parentRunId: PARENT_ID,
      status: 'attention_required',
      errorCode: 'child_attention',
      errorMessage: 'Sign in required',
    });
    const succeeded = run({ id: SECOND_CHILD_ID, parentRunId: PARENT_ID, status: 'succeeded' });
    const repository = {
      listWaitingDependencyParents: vi.fn().mockResolvedValue([parent]),
      listChildRuns: vi.fn().mockResolvedValue([attention, succeeded]),
      transition: vi.fn().mockResolvedValue(parent),
    };
    const service = new CompositeOperationCoordinatorService({
      getHandler: vi.fn().mockReturnValue({}),
    } as never, repository as never, acceptingGate());

    await service.resumeTerminalChildren(new Date('2026-08-01T01:00:00.000Z'));

    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      runId: PARENT_ID,
      expectedStatuses: ['waiting_dependency'],
      status: 'attention_required',
      errorCode: 'child_attention',
      errorMessage: 'Sign in required',
      signal: expect.any(AbortSignal),
    }));
  });

  it('cancels only the non-terminal children of the selected parent', async () => {
    const parent = run({ status: 'waiting_dependency', attemptToken: null, claimedBy: null });
    const child = run({ id: CHILD_ID, parentRunId: PARENT_ID, status: 'running' });
    const terminalChild = run({ id: '5513fb12-dc40-4b51-881b-df83f6308b6d', parentRunId: PARENT_ID, status: 'succeeded' });
    const repository = {
      cancelRunAndActiveChildren: vi.fn().mockResolvedValue({
        parent: run({ status: 'cancelled' }),
        children: [child],
      }),
    };
    const service = new CompositeOperationCoordinatorService({
      getHandler: vi.fn().mockReturnValue({}),
    } as never, repository as never, acceptingGate());

    await service.cancelChildren(parent, 'operator_cancelled');

    expect(repository.cancelRunAndActiveChildren).toHaveBeenCalledOnce();
    expect(repository.cancelRunAndActiveChildren).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      parentRunId: PARENT_ID,
      signal: expect.any(AbortSignal),
    }));
    expect(terminalChild.status).toBe('succeeded');
  });

  it('cancels every active child lane of the selected parent', async () => {
    const parent = run({ status: 'waiting_dependency', attemptToken: null, claimedBy: null });
    const statuses = [
      'queued',
      'waiting_runtime',
      'waiting_dependency',
      'running',
      'attention_required',
    ] as const;
    const children = statuses.map((status, index) => run({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      parentRunId: PARENT_ID,
      operationKey: `sourcing.child_${index}`,
      status,
    }));
    const cancel = vi.fn().mockResolvedValue(undefined);
    const repository = {
      cancelRunAndActiveChildren: vi.fn().mockResolvedValue({
        parent: run({ status: 'cancelled' }),
        children,
      }),
    };
    const service = new CompositeOperationCoordinatorService({
      getHandler: vi.fn().mockReturnValue({ cancel }),
    } as never, repository as never, acceptingGate());

    await service.cancelChildren(parent, 'operator_cancelled');

    expect(cancel).toHaveBeenCalledTimes(statuses.length);
    expect(repository.cancelRunAndActiveChildren).toHaveBeenCalledWith(expect.objectContaining({
      signal: expect.any(AbortSignal),
      organizationId: ORG_ID,
      parentRunId: PARENT_ID,
      childErrorCode: 'cancelled_by_operator',
    }));
  });

  it.each(['BOOTSTRAPPING', 'STOPPING', 'STOPPED'] as const)(
    'blocks child creation and composite resume in %s with zero mutation',
    async (state) => {
      const gate = new OperationLifecycleGateService();
      if (state !== 'BOOTSTRAPPING') gate.beginStopping();
      if (state === 'STOPPED') gate.finishStopping();
      const repository = {
        createChildAndWaitForDependency: vi.fn(),
        createChildrenAndWaitForDependencies: vi.fn(),
        cancelRunAndActiveChildren: vi.fn(),
        listWaitingDependencyParents: vi.fn(),
        transition: vi.fn(),
      };
      const service = new CompositeOperationCoordinatorService({
        getDefinition: vi.fn().mockReturnValue(definition),
        parseInput: vi.fn().mockReturnValue({ scope: 'full' }),
      } as never, repository as never, gate);

      await expect(service.waitForChild({
        parent: run(),
        child: {
          operationKey: definition.key,
          input: { scope: 'full' },
          idempotencyKey: 'child-key',
        },
      })).rejects.toMatchObject({ status: 503 });
      await expect(service.waitForChildren({
        parent: run(),
        children: [
          { operationKey: 'sourcing.child_a', input: {}, idempotencyKey: 'child-a' },
          { operationKey: 'sourcing.child_b', input: {}, idempotencyKey: 'child-b' },
        ],
      })).rejects.toMatchObject({ status: 503 });
      await expect(service.resumeTerminalChildren(new Date()))
        .rejects.toMatchObject({ status: 503 });
      await expect(service.cancelChildren(run(), 'operator_cancelled'))
        .rejects.toMatchObject({ status: 503 });
      expect(repository.createChildAndWaitForDependency).not.toHaveBeenCalled();
      expect(repository.createChildrenAndWaitForDependencies).not.toHaveBeenCalled();
      expect(repository.cancelRunAndActiveChildren).not.toHaveBeenCalled();
      expect(repository.listWaitingDependencyParents).not.toHaveBeenCalled();
      expect(repository.transition).not.toHaveBeenCalled();
    },
  );
});
