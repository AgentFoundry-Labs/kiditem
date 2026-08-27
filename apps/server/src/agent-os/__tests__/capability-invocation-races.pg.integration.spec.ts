import { z } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaCapabilityInvocationRepository } from '../adapter/out/repository/prisma-capability-invocation.repository';
import { CapabilityApprovalService } from '../application/service/capability-approval.service';
import {
  CapabilityInvocationService,
  OwnerResultAmbiguousError,
} from '../application/service/capability-invocation.service';
import { AgentCapabilityRegistry } from '../application/service/agent-capability-registry.service';
import { OperationRepositoryAdapter } from '../../operations/adapter/out/repository/operation.repository.adapter';
import { OperationHandlerRegistryService } from '../../operations/application/service/operation-handler-registry.service';
import { OperationLifecycleGateService } from '../../operations/application/service/operation-lifecycle-gate.service';
import { OperationRunService } from '../../operations/application/service/operation-run.service';
import { SourcingCapabilityCompositionAdapter } from '../../sourcing/adapter/in/agent/sourcing-capability-composition.adapter';
import { SourcingFinalCapabilityAdapter } from '../../sourcing/adapter/in/agent/sourcing-final-capability.adapter';
import { SourcingScrapeSnapshotAdmissionGuard } from '../../sourcing/adapter/in/agent/sourcing-scrape-snapshot-admission.guard';
import { SOURCING_SCRAPE_URL_OPERATION } from '../../sourcing/domain/operation/sourcing.operations';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type {
  CapabilityDefinition,
  CapabilityApprovalRisk,
} from '../../common/capability-definition';
import type { CapabilityExecutionContext } from '../../common/capability-composition';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';
import type { CapabilityResultEnvelope } from '@kiditem/shared/agent-interaction';
import type { OperationRunnerPort } from '../../operations/application/port/in/operation-runner.port';
import { ownerInvocationKey } from '../domain/capability/capability-invocation.policy';

const OPERATION_KEY = 'sourcing.capability_invocation_race';
const REQUEST_KEY = 'capability-invocation-race-request';
const INPUT = {
  candidateId: '00000000-0000-4000-8000-000000000004',
  mode: 'reconcile',
};
const SCRAPE_WORKFLOW_REQUEST_KEY = 'sourcing-scrape-workflow-restart-request';
const SCRAPE_WORKFLOW_INPUT = {
  sourceUrl: 'https://detail.1688.com/offer/712345678901.html',
};

describe('CapabilityInvocation PostgreSQL races', () => {
  let primaryPrisma: PrismaClient;
  let contenderPrisma: PrismaClient;

  beforeAll(async () => {
    primaryPrisma = makeTestPrisma();
    contenderPrisma = makeTestPrisma();
    await Promise.all([primaryPrisma.$connect(), contenderPrisma.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([
      primaryPrisma?.$disconnect(),
      contenderPrisma?.$disconnect(),
    ]);
  });

  beforeEach(async () => {
    await resetDb(primaryPrisma);
    await seedBaseFixture(primaryPrisma);
  });

  it('converges concurrent exact admissions on one durable Invocation ID', async () => {
    const owner = new OperationBackedOwner(primaryPrisma);
    const left = invocationService(primaryPrisma, mutationDefinition('low'), owner);
    const right = invocationService(contenderPrisma, mutationDefinition('low'), owner);

    const [first, replay] = await Promise.all([
      left.invoke(mutationRequest()),
      right.invoke(mutationRequest()),
    ]);

    expect(first).toMatchObject({ kind: 'completed' });
    expect(replay).toMatchObject({ kind: 'completed' });
    const rows = await primaryPrisma.capabilityInvocation.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        requestKey: REQUEST_KEY,
      },
    });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error('expected one durable CapabilityInvocation');
    expect(invocationId(first)).toBe(row.id);
    expect(invocationId(replay)).toBe(row.id);
    expect(row.canonicalInput).toEqual(INPUT);
    expect(row.status).toBe('succeeded');
  });

  it('leaves one winner and returns REQUEST_KEY_CONFLICT for concurrent input drift', async () => {
    const owner = new OperationBackedOwner(primaryPrisma);
    const left = invocationService(primaryPrisma, mutationDefinition('low'), owner);
    const right = invocationService(contenderPrisma, mutationDefinition('low'), owner);

    const outcomes = await Promise.allSettled([
      left.invoke(mutationRequest()),
      right.invoke(mutationRequest({ input: { ...INPUT, mode: 'changed' } })),
    ]);

    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof left.invoke>>> =>
        outcome.status === 'fulfilled',
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'REQUEST_KEY_CONFLICT' });
    expect(await primaryPrisma.capabilityInvocation.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        requestKey: REQUEST_KEY,
      },
    })).toBe(1);
  });

  it('converges concurrent identical approval decisions without execution', async () => {
    const owner = new OperationBackedOwner(primaryPrisma);
    const definition = mutationDefinition('medium');
    const service = invocationService(primaryPrisma, definition, owner);
    const receipt = await service.invoke(mutationRequest());
    const invocationId = inputRequiredInvocationId(receipt);
    const left = approvalService(primaryPrisma);
    const right = approvalService(contenderPrisma);

    const [first, replay] = await Promise.all([
      left.decide(approvalRequest(invocationId, 'approved')),
      right.decide(approvalRequest(invocationId, 'approved')),
    ]);

    expect(first).toMatchObject({
      id: invocationId,
      status: 'pending',
      approvalStatus: 'approved',
    });
    expect(replay).toMatchObject({
      id: invocationId,
      status: 'pending',
      approvalStatus: 'approved',
    });
    expect(owner.ownerKeys).toEqual([]);
  });

  it('permits only one winner for concurrent opposing approval decisions', async () => {
    const owner = new OperationBackedOwner(primaryPrisma);
    const definition = mutationDefinition('medium');
    const service = invocationService(primaryPrisma, definition, owner);
    const receipt = await service.invoke(mutationRequest());
    const invocationId = inputRequiredInvocationId(receipt);
    const left = approvalService(primaryPrisma);
    const right = approvalService(contenderPrisma);

    const outcomes = await Promise.allSettled([
      left.decide(approvalRequest(invocationId, 'approved')),
      right.decide(approvalRequest(invocationId, 'rejected')),
    ]);

    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<unknown> => outcome.status === 'fulfilled',
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'APPROVAL_REJECTED' });
    expect(owner.ownerKeys).toEqual([]);
  });

  it('expires an approval before a replay can execute its owner', async () => {
    let now = new Date('2026-08-26T00:00:00.000Z');
    const owner = new OperationBackedOwner(primaryPrisma);
    const definition = mutationDefinition('medium');
    const repository = new PrismaCapabilityInvocationRepository(
      primaryPrisma as unknown as PrismaService,
      () => now,
    );
    const service = invocationService(primaryPrisma, definition, owner, repository, () => now);

    const receipt = await service.invoke(mutationRequest());
    const invocationId = inputRequiredInvocationId(receipt);
    now = new Date('2026-08-26T00:30:00.001Z');

    await expect(service.invoke(mutationRequest())).rejects.toMatchObject({
      code: 'APPROVAL_EXPIRED',
    });
    const invocation = await repository.findById({
      organizationId: TEST_ORGANIZATION_ID,
      invocationId,
    });
    expect(invocation).toMatchObject({
      status: 'failed',
      approvalStatus: 'expired',
      error: { code: 'APPROVAL_EXPIRED' },
    });
    expect(owner.ownerKeys).toEqual([]);
  });

  it('keeps an Invocation pending when its owner result is ambiguous', async () => {
    const owner = new AmbiguousOwner();
    const repository = new PrismaCapabilityInvocationRepository(
      primaryPrisma as unknown as PrismaService,
    );
    const service = invocationService(
      primaryPrisma,
      mutationDefinition('low'),
      owner,
      repository,
    );

    await expect(service.invoke(mutationRequest())).rejects.toBeInstanceOf(
      OwnerResultAmbiguousError,
    );
    const invocation = await primaryPrisma.capabilityInvocation.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        requestKey: REQUEST_KEY,
      },
    });
    expect(invocation).toMatchObject({
      status: 'pending',
      approvalStatus: 'not_required',
      result: null,
      error: null,
    });
    expect(owner.ownerKeys).toHaveLength(1);
  });

  it('retries an ambiguous owner commit through a fresh service with one exact owner key and one OperationRun', async () => {
    const owner = new OperationBackedOwner(primaryPrisma, { failAfterFirstCommit: true });
    const service = invocationService(primaryPrisma, mutationDefinition('low'), owner);

    await expect(service.invoke(mutationRequest())).rejects.toBeInstanceOf(
      OwnerResultAmbiguousError,
    );
    const pending = await primaryPrisma.capabilityInvocation.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        requestKey: REQUEST_KEY,
      },
    });
    expect(pending.status).toBe('pending');

    const restartedService = invocationService(
      primaryPrisma,
      mutationDefinition('low'),
      owner,
    );
    const replay = await restartedService.invoke(mutationRequest());

    expect(invocationId(replay)).toBe(pending.id);
    expect(owner.ownerKeys).toEqual([
      `capability-invocation:${pending.id}`,
      `capability-invocation:${pending.id}`,
    ]);
    const operations = await primaryPrisma.operationRun.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: OPERATION_KEY,
        idempotencyKey: `capability-invocation:${pending.id}`,
      },
      select: { idempotencyKey: true, input: true },
    });
    expect(operations).toEqual([
      expect.objectContaining({
        idempotencyKey: `capability-invocation:${pending.id}`,
        input: expect.objectContaining({ ownerInputHash: pending.inputHash }),
      }),
    ]);
    await expect(primaryPrisma.capabilityInvocation.findFirstOrThrow({
      where: { id: pending.id, organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toMatchObject({ status: 'succeeded' });
    await expect(restartedService.invoke(mutationRequest({
      input: { ...INPUT, mode: 'changed-after-restart' },
    }))).rejects.toMatchObject({ code: 'REQUEST_KEY_CONFLICT' });
    expect(await primaryPrisma.operationRun.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: OPERATION_KEY,
        idempotencyKey: `capability-invocation:${pending.id}`,
      },
    })).toBe(1);
  });

  it('replays a committed scrapeUrlWorkflow after response loss through a fresh API boundary and rejects request and owner input drift', async () => {
    const candidatesBefore = await primaryPrisma.sourcingCandidate.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });
    const firstService = sourcingWorkflowInvocationService(
      primaryPrisma,
      new CommitThenLoseScrapeWorkflowOperations(primaryPrisma, true),
      new SourcingScrapeSnapshotAdmissionGuard(),
    );

    await expect(firstService.invoke(sourcingWorkflowRequest())).rejects.toBeInstanceOf(
      OwnerResultAmbiguousError,
    );
    const pending = await primaryPrisma.capabilityInvocation.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        requestKey: SCRAPE_WORKFLOW_REQUEST_KEY,
      },
    });
    expect(pending.status).toBe('pending');

    await primaryPrisma.$disconnect();
    const restartedPrisma = makeTestPrisma();
    try {
      await restartedPrisma.$connect();
      const restartedAdmission = new SourcingScrapeSnapshotAdmissionGuard();
      const restartedAdmissionSpy = vi.spyOn(restartedAdmission, 'admit');
      const restartedOperations = new CommitThenLoseScrapeWorkflowOperations(
        restartedPrisma,
        false,
      );
      const restartedService = sourcingWorkflowInvocationService(
        restartedPrisma,
        restartedOperations,
        restartedAdmission,
      );
      const replay = await restartedService.invoke(sourcingWorkflowRequest(
        SCRAPE_WORKFLOW_INPUT,
        { executionId: 'scrape-workflow-execution-after-api-restart' },
      ));

      expect(restartedAdmissionSpy).toHaveBeenCalledWith(expect.objectContaining({
        capabilityKey: 'sourcing.scrapeUrlWorkflow',
        organizationId: TEST_ORGANIZATION_ID,
        initiatingUserId: TEST_USER_ID,
        executionId: 'scrape-workflow-execution-after-api-restart',
        input: SCRAPE_WORKFLOW_INPUT,
      }));
      expect(invocationId(replay)).toBe(pending.id);
      const operation = await restartedPrisma.operationRun.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          operationKey: SOURCING_SCRAPE_URL_OPERATION.key,
          idempotencyKey: ownerInvocationKey(pending.id),
        },
      });
      expect(replay).toEqual({
        kind: 'completed',
        invocationId: pending.id,
        status: 'succeeded',
        result: {
          summary: '상품 수집 작업을 처리했습니다.',
          resourceRefs: [],
          operationRefs: [{ kind: 'operation_run', id: operation.id }],
        },
      });
      expect(operation.input).toEqual(SCRAPE_WORKFLOW_INPUT);

      await expect(restartedService.invoke(sourcingWorkflowRequest({
        sourceUrl: 'https://detail.1688.com/offer/712345678902.html',
      }, {
        executionId: 'scrape-workflow-execution-after-api-restart-drift',
      }))).rejects.toMatchObject({ code: 'REQUEST_KEY_CONFLICT' });

      const restartedOwner = sourcingWorkflowOwner(restartedOperations);
      const changedInput = {
        sourceUrl: 'https://detail.1688.com/offer/712345678902.html',
      };
      await expect(restartedOwner.scrapeUrlWorkflow({
        context: {
          organizationId: TEST_ORGANIZATION_ID,
          initiatingUserId: TEST_USER_ID,
          executionId: 'fresh-api-execution',
          ownerIdempotencyKey: ownerInvocationKey(pending.id),
          ownerInputHash: canonicalOwnerInputHash(changedInput),
        },
        input: changedInput,
      })).rejects.toThrow('idempotency_key_input_conflict');

      expect(await restartedPrisma.operationRun.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          operationKey: SOURCING_SCRAPE_URL_OPERATION.key,
          idempotencyKey: ownerInvocationKey(pending.id),
        },
      })).toBe(1);
      expect(await restartedPrisma.sourcingCandidate.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      })).toBe(candidatesBefore);
    } finally {
      await restartedPrisma.$disconnect();
      await primaryPrisma.$connect();
    }
  });
});

function mutationDefinition(approvalRisk: CapabilityApprovalRisk): CapabilityDefinition {
  return {
    key: 'sourcing.capability_invocation_race',
    ownerDomain: 'sourcing',
    ownerInputPort: 'sourcing.capability_invocation_race',
    description: 'PostgreSQL race integration fixture.',
    inputSchema: z.object({
      candidateId: z.string().uuid(),
      mode: z.string().min(1),
    }).strict(),
    outputSchema: z.object({ operationRunId: z.string().uuid() }).strict(),
    effects: ['db_write'],
    approvalRisk,
    idempotency: 'required',
  };
}

function invocationService(
  prisma: PrismaClient,
  definition: CapabilityDefinition,
  owner: { invoke(input: OwnerInvocation): Promise<CapabilityResultEnvelope> },
  repository = new PrismaCapabilityInvocationRepository(prisma as unknown as PrismaService),
  now?: () => Date,
): CapabilityInvocationService {
  const registry = new AgentCapabilityRegistry();
  registry.registerDefinition(definition);
  registry.registerImplementation({
    capabilityKey: definition.key,
    invoke: owner.invoke.bind(owner),
  });
  return new CapabilityInvocationService(repository, registry, now);
}

function approvalService(prisma: PrismaClient): CapabilityApprovalService {
  return new CapabilityApprovalService(
    new PrismaCapabilityInvocationRepository(prisma as unknown as PrismaService),
  );
}

function sourcingWorkflowInvocationService(
  prisma: PrismaClient,
  operations: CommitThenLoseScrapeWorkflowOperations,
  sourcingAdmission: SourcingScrapeSnapshotAdmissionGuard,
): CapabilityInvocationService {
  const registry = new AgentCapabilityRegistry();
  const composition = new SourcingCapabilityCompositionAdapter(
    sourcingWorkflowOwner(operations),
  ).compositions.find(
    (candidate) => candidate.definition.key === 'sourcing.scrapeUrlWorkflow',
  );
  if (!composition) throw new Error('sourcing_scrape_workflow_composition_missing');
  registry.registerComposition(composition);
  return new CapabilityInvocationService(
    new PrismaCapabilityInvocationRepository(prisma as unknown as PrismaService),
    registry,
    undefined,
    sourcingAdmission,
  );
}

function sourcingWorkflowOwner(
  operations: CommitThenLoseScrapeWorkflowOperations,
): SourcingFinalCapabilityAdapter {
  return new SourcingFinalCapabilityAdapter(
    {
      retrieveWorkspaceEvidence: async () => ({
        inputHash: 'a'.repeat(64),
        documentCount: 0,
        documents: [],
        dataGaps: [],
      }),
      inspectRecommendationRun: async () => ({
        runId: 'unused',
        status: 'complete',
        businessDate: '2026-08-26',
        itemCount: 0,
        warningCodes: [],
        validation: { itemCount: 0, missingCount: 0 },
      }),
    } as never,
    {
      refreshValidation: async () => ({
        recommendationRunId: 'unused',
        validationEpisodeIds: [],
        missingEvidence: [],
      }),
      createReviewBatch: async () => ({
        reviewBatchId: 'unused',
        itemCount: 0,
        status: 'unused',
      }),
    } as never,
    {
      duplicateCheck: async () => ({ duplicate: false, candidateId: null }),
      scrapeProductUrl: async () => {
        throw new Error('unused');
      },
      ingestCandidate: async () => ({ candidateId: 'unused' }),
    } as never,
    { collectShadowSignals: async () => ({ operationRunId: 'unused', status: 'queued' }) } as never,
    operations as never,
    { recordScrapeSnapshot: () => undefined } as never,
  );
}

function sourcingWorkflowRequest(
  input = SCRAPE_WORKFLOW_INPUT,
  overrides: { executionId?: string } = {},
) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    initiatingUserId: TEST_USER_ID,
    executionId: overrides.executionId ?? 'scrape-workflow-execution',
    capabilityKey: 'sourcing.scrapeUrlWorkflow',
    actingAgentKey: 'sourcing',
    requestKey: SCRAPE_WORKFLOW_REQUEST_KEY,
    input,
  };
}

function mutationRequest(overrides: Partial<{
  requestKey: string;
  input: typeof INPUT;
}> = {}) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    initiatingUserId: TEST_USER_ID,
    executionId: 'race-execution',
    capabilityKey: 'sourcing.capability_invocation_race',
    actingAgentKey: 'sourcing',
    requestKey: REQUEST_KEY,
    input: INPUT,
    ...overrides,
  };
}

function approvalRequest(
  invocationId: string,
  decision: 'approved' | 'rejected',
) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    invocationId,
    decision,
    reason: 'Race-tested explicit decision.',
  };
}

function invocationId(result: Awaited<ReturnType<CapabilityInvocationService['invoke']>>): string {
  if (result.kind !== 'completed' || !result.invocationId) {
    throw new Error('expected completed invocation result');
  }
  return result.invocationId;
}

function inputRequiredInvocationId(
  result: Awaited<ReturnType<CapabilityInvocationService['invoke']>>,
): string {
  if (result.kind !== 'input_required') {
    throw new Error('expected approval receipt');
  }
  return result.invocationId;
}

interface OwnerInvocation {
  context: CapabilityExecutionContext;
  input: Record<string, unknown>;
}

class OperationBackedOwner {
  readonly ownerKeys: string[] = [];
  private failAfterFirstCommit: boolean;
  private readonly operations: OperationRepositoryAdapter;

  constructor(
    prisma: PrismaClient,
    options: { failAfterFirstCommit?: boolean } = {},
  ) {
    this.operations = new OperationRepositoryAdapter(prisma as unknown as PrismaService);
    this.failAfterFirstCommit = options.failAfterFirstCommit ?? false;
  }

  async invoke({ context, input }: OwnerInvocation): Promise<CapabilityResultEnvelope> {
    const ownerIdempotencyKey = context.ownerIdempotencyKey;
    if (!ownerIdempotencyKey) {
      throw new Error('owner idempotency key was not supplied');
    }
    this.ownerKeys.push(ownerIdempotencyKey);
    const operation = await this.operations.createRun({
      signal: new AbortController().signal,
      organizationId: context.organizationId,
      operationKey: OPERATION_KEY,
      definitionVersion: 1,
      ownerDomain: 'sourcing',
      title: 'Capability invocation race fixture',
      engineType: 'domain',
      resourceClass: 'default',
      executionTimeoutMs: 60_000,
      triggerSource: 'agent',
      requestedByUserId: context.initiatingUserId,
      parentRunId: null,
      scheduleId: null,
      idempotencyKey: ownerIdempotencyKey,
      input: {
        ownerInputHash: context.ownerInputHash ?? null,
        ...input,
      },
      maxAttempts: 1,
      scheduledFor: null,
    });
    if (this.failAfterFirstCommit) {
      this.failAfterFirstCommit = false;
      throw new Error('owner connection dropped after durable commit');
    }
    return operationResult(operation.id);
  }
}

class CommitThenLoseScrapeWorkflowOperations {
  private readonly runner: OperationRunService;

  constructor(
    prisma: PrismaClient,
    private loseFirstResponse: boolean,
  ) {
    const registry = new OperationHandlerRegistryService();
    registry.register(SOURCING_SCRAPE_URL_OPERATION, {
      execute: async () => ({ kind: 'completed', result: {} }),
    });
    const lifecycle = new OperationLifecycleGateService();
    lifecycle.open();
    this.runner = new OperationRunService(
      registry,
      new OperationRepositoryAdapter(prisma as unknown as PrismaService),
      {} as never,
      lifecycle,
    );
  }

  async start(command: Parameters<OperationRunnerPort['start']>[0]) {
    const run = await this.runner.start(command);
    if (this.loseFirstResponse) {
      this.loseFirstResponse = false;
      throw new Error('owner_response_lost_after_operation_commit');
    }
    return run;
  }

  findByIdempotency(
    input: Parameters<OperationRunnerPort['findByIdempotency']>[0],
  ) {
    return this.runner.findByIdempotency(input);
  }
}

class AmbiguousOwner {
  readonly ownerKeys: string[] = [];

  async invoke({ context }: OwnerInvocation): Promise<CapabilityResultEnvelope> {
    if (context.ownerIdempotencyKey) this.ownerKeys.push(context.ownerIdempotencyKey);
    throw new Error('owner response was lost after dispatch');
  }
}

function operationResult(operationRunId: string): CapabilityResultEnvelope {
  return {
    summary: 'Race fixture operation admitted.',
    resourceRefs: [],
    operationRefs: [{ kind: 'operation_run', id: operationRunId }],
    output: { operationRunId },
  };
}
