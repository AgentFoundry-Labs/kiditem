import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import type {
  OperationDefinition,
  OperationHandler,
} from '../../../../../common/operation-definition';
import type {
  OperationRunRecord,
  OperationRunRepositoryPort,
} from '../../port/out/repository/operation.repository.port';
import { OperationHandlerRegistryService } from '../operation-handler-registry.service';
import { OperationRunService } from '../operation-run.service';

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

describe('OperationRunService', () => {
  it('returns the same run for an idempotent start command', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const repository = makeRepository();
    const service = new OperationRunService(registry, repository, compositeCoordinator);
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
    const service = new OperationRunService(registry, repository, compositeCoordinator);

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
    const service = new OperationRunService(registry, makeRepository(), compositeCoordinator);

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
});
