import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { OperationHandlerRegistryService } from '../operation-handler-registry.service';
import { OperationLifecycleGateService } from '../operation-lifecycle-gate.service';
import { OperationRunService } from '../operation-run.service';
import type {
  OperationRunRecord,
  OperationRunRepositoryPort,
} from '../../port/out/repository/operation.repository.port';
import type {
  OperationDefinition,
  OperationHandler,
} from '../../../../../common/operation-definition';

const ORG_ID = '5e29b0f8-17be-4b95-9a16-5b9cfc952e99';
const USER_ID = 'b223839e-0958-44e4-8238-fc4f5b7254ae';
const RUN_ID = '4313fb12-dc40-4b51-881b-df83f6308b6d';

const definition: OperationDefinition = {
  key: 'sourcing.collect_daily_trends',
  version: 1,
  title: '일일 트렌드 수집',
  ownerDomain: 'sourcing',
  engineType: 'composite',
  allowedTriggers: ['dashboard', 'schedule'],
  scheduleSupported: true,
  maxAttempts: 3,
  resourceClass: 'default',
  executionTimeoutMs: 900_000,
  inputSchema: z.object({ source: z.string() }).strict(),
};

const handler: OperationHandler = {
  async execute() {
    return { kind: 'completed', result: {} };
  },
};

const compositeCoordinator = {
  waitForChild: vi.fn(),
  listChildren: vi.fn().mockResolvedValue([]),
  resumeTerminalChildren: vi.fn(),
  cancelChildren: vi.fn(),
};

function makeRecord(input: Partial<OperationRunRecord> = {}): OperationRunRecord {
  return {
    id: RUN_ID,
    organizationId: ORG_ID,
    operationKey: definition.key,
    definitionVersion: definition.version,
    ownerDomain: definition.ownerDomain,
    title: definition.title,
    engineType: definition.engineType,
    resourceClass: definition.resourceClass,
    executionTimeoutMs: definition.executionTimeoutMs,
    status: 'queued',
    triggerSource: 'dashboard',
    requestedByUserId: USER_ID,
    parentRunId: null,
    scheduleId: null,
    idempotencyKey: 'dashboard:trends',
    input: { source: 'naver' },
    result: null,
    progress: null,
    stage: null,
    stageUpdatedAt: null,
    progressCurrent: null,
    progressTotal: null,
    deadlineAt: null,
    nativeRunType: null,
    nativeRunId: null,
    attempts: 0,
    maxAttempts: 3,
    claimedBy: null,
    attemptToken: null,
    claimedAt: null,
    leaseExpiresAt: null,
    scheduledFor: null,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    requestedBy: { id: USER_ID, name: '운영자', email: 'operator@example.com' },
    ...input,
  };
}

function makeRepository(): OperationRunRepositoryPort {
  return {
    findRunById: vi.fn(),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    createRun: vi.fn().mockResolvedValue(makeRecord()),
    listRuns: vi.fn().mockResolvedValue([]),
    transition: vi.fn(),
  };
}

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

describe('OperationRunService', () => {
  it('uses the atomic composite cancellation result without a separate parent transition', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, { ...handler, cancel });
    const existing = makeRecord({ status: 'waiting_dependency' });
    const cancelled = makeRecord({
      status: 'cancelled',
      finishedAt: new Date('2026-08-01T01:00:00Z'),
      errorCode: 'cancelled_by_operator',
      errorMessage: 'stop composite',
    });
    const repository = makeRepository();
    repository.findRunById = vi.fn().mockResolvedValue(existing);
    repository.transition = vi.fn();
    const coordinator = {
      ...compositeCoordinator,
      cancelChildren: vi.fn().mockResolvedValue(cancelled),
    };
    const service = new OperationRunService(
      registry,
      repository,
      coordinator,
      acceptingGate(),
    );

    await expect(service.cancel({
      organizationId: ORG_ID,
      runId: RUN_ID,
      requestedByUserId: USER_ID,
      reason: 'stop composite',
    })).resolves.toMatchObject({
      status: 'cancelled',
      error: { code: 'cancelled_by_operator', message: 'stop composite' },
    });

    expect(coordinator.cancelChildren).toHaveBeenCalledWith(existing, 'stop composite');
    expect(repository.transition).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({
      runId: RUN_ID,
      organizationId: ORG_ID,
      reason: 'stop composite',
    }));
  });

  it('returns the same run for an idempotent start command', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const repository = makeRepository();
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );
    const command = {
      organizationId: ORG_ID,
      operationKey: definition.key,
      triggerSource: 'dashboard' as const,
      input: { source: 'naver' },
      requestedByUserId: USER_ID,
      idempotencyKey: 'dashboard:trends',
    };

    const first = await service.start(command);
    repository.findByIdempotencyKey = vi.fn().mockResolvedValue(makeRecord());
    const second = await service.start(command);

    expect(first.id).toBe(second.id);
    expect(repository.createRun).toHaveBeenCalledTimes(1);
  });

  it('copies definition policy into the run and returns persisted execution metadata', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const repository = makeRepository();
    repository.createRun = vi.fn().mockResolvedValue(
      makeRecord({
        resourceClass: 'playwright_1688',
        executionTimeoutMs: 1_200_000,
        stage: 'collecting_keyword',
        stageUpdatedAt: new Date('2026-08-01T00:01:00Z'),
        progressCurrent: 11,
        progressTotal: 12,
        progress: 11 / 12,
        deadlineAt: new Date('2026-08-01T00:20:00Z'),
      }),
    );
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );

    const run = await service.start({
      organizationId: ORG_ID,
      operationKey: definition.key,
      triggerSource: 'dashboard',
      input: { source: 'naver' },
      requestedByUserId: USER_ID,
      idempotencyKey: null,
    });

    expect(repository.createRun).toHaveBeenCalledWith(expect.objectContaining({
      resourceClass: 'default',
      executionTimeoutMs: 900_000,
    }));
    expect(run).toMatchObject({
      resourceClass: 'playwright_1688',
      executionTimeoutMs: 1_200_000,
      stage: 'collecting_keyword',
      progressCurrent: 11,
      progressTotal: 12,
      deadlineAt: new Date('2026-08-01T00:20:00Z'),
    });
  });

  it('rejects a trigger that the definition does not allow', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const service = new OperationRunService(
      registry,
      makeRepository(),
      compositeCoordinator,
      acceptingGate(),
    );

    await expect(
      service.start({
        organizationId: ORG_ID,
        operationKey: definition.key,
        triggerSource: 'agent',
        input: { source: 'naver' },
        requestedByUserId: USER_ID,
        idempotencyKey: null,
      }),
    ).rejects.toThrow('trigger_not_allowed');
  });

  it.each(['BOOTSTRAPPING', 'STOPPING', 'STOPPED'] as const)(
    'rejects a start in %s before any repository mutation',
    async (state) => {
      const registry = new OperationHandlerRegistryService();
      registry.register(definition, handler);
      const repository = makeRepository();
      const service = new OperationRunService(
        registry,
        repository,
        compositeCoordinator,
        gateIn(state),
      );

      await expect(service.start({
        organizationId: ORG_ID,
        operationKey: definition.key,
        triggerSource: 'dashboard',
        input: { source: 'naver' },
        requestedByUserId: USER_ID,
        idempotencyKey: null,
      })).rejects.toMatchObject({ status: 503 });
      expect(repository.findByIdempotencyKey).not.toHaveBeenCalled();
      expect(repository.createRun).not.toHaveBeenCalled();
    },
  );

  it('passes the process shutdown signal into the persisted start transaction', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const repository = makeRepository();
    const gate = acceptingGate();
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      gate,
    );

    await service.start({
      organizationId: ORG_ID,
      operationKey: definition.key,
      triggerSource: 'dashboard',
      input: { source: 'naver' },
      requestedByUserId: USER_ID,
      idempotencyKey: null,
    });

    expect(repository.createRun).toHaveBeenCalledWith(expect.objectContaining({
      signal: gate.signal(),
    }));
  });
});
