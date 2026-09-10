import { z } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaCapabilityInvocationRepository } from '../adapter/out/repository/prisma-capability-invocation.repository';
import { CapabilityApprovalService } from '../application/service/capability-approval.service';
import { CapabilityMutationDispatcher } from '../application/service/capability-mutation-dispatcher.service';
import {
  CapabilityInvocationService,
  OwnerResultAmbiguousError,
} from '../application/service/capability-invocation.service';
import { AgentCapabilityRegistry } from '../application/service/agent-capability-registry.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ownerInvocationKey } from '../domain/capability/capability-invocation.policy';
import type {
  CapabilityDefinition,
  CapabilityApprovalRisk,
} from '../../common/capability-definition';
import type { CapabilityExecutionContext } from '../../common/capability-composition';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';
import type { CapabilityResultEnvelope } from '@kiditem/shared/agent-interaction';
import { removeRetiredCapabilityOperationRefs } from '../../../../../scripts/data-migrations/v0.1.31/004_remove_retired_capability_operation_refs';

const DIRECT_OWNER_CAPABILITY_KEY = 'sourcing.capability_invocation_race';
const REQUEST_KEY = 'capability-invocation-race-request';
const INPUT = {
  candidateId: '00000000-0000-4000-8000-000000000004',
  mode: 'reconcile',
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
    const owner = new DirectReceiptOwner(primaryPrisma);
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
    const owner = new DirectReceiptOwner(primaryPrisma);
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

  it('converges concurrent identical approval decisions on one owner call', async () => {
    const owner = new DirectReceiptOwner(primaryPrisma);
    const definition = mutationDefinition('medium');
    const { service, left, right } = approvalRuntime(
      primaryPrisma,
      contenderPrisma,
      definition,
      owner,
    );
    const receipt = await service.invoke(mutationRequest());
    const invocationId = inputRequiredInvocationId(receipt);

    const [first, replay] = await Promise.all([
      left.decide(approvalRequest(invocationId, 'approved')),
      right.decide(approvalRequest(invocationId, 'approved')),
    ]);

    expect(first).toMatchObject({
      id: invocationId,
      approvalStatus: 'approved',
    });
    expect(replay).toMatchObject({
      id: invocationId,
      approvalStatus: 'approved',
    });
    expect([first.status, replay.status]).toContain('succeeded');
    expect(owner.ownerKeys).toEqual([ownerInvocationKey(invocationId)]);
  });

  it('permits only one winner for concurrent opposing approval decisions', async () => {
    const owner = new DirectReceiptOwner(primaryPrisma);
    const definition = mutationDefinition('medium');
    const { service, left, right } = approvalRuntime(
      primaryPrisma,
      contenderPrisma,
      definition,
      owner,
    );
    const receipt = await service.invoke(mutationRequest());
    const invocationId = inputRequiredInvocationId(receipt);

    const outcomes = await Promise.allSettled([
      left.decide(approvalRequest(invocationId, 'approved')),
      right.decide(approvalRequest(invocationId, 'rejected')),
    ]);

    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof left.decide>>> =>
        outcome.status === 'fulfilled',
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'APPROVAL_REJECTED' });
    const winningDecision = fulfilled[0]?.value as { approvalStatus?: string } | undefined;
    expect(owner.ownerKeys).toEqual(
      winningDecision?.approvalStatus === 'approved'
        ? [ownerInvocationKey(invocationId)]
        : [],
    );
  });

  it('expires an approval before a replay can execute its owner', async () => {
    let now = new Date('2026-08-26T00:00:00.000Z');
    const owner = new DirectReceiptOwner(primaryPrisma);
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

  it('does not turn an identical approved browser decision into a retry after an ambiguous owner outcome', async () => {
    const owner = new AmbiguousOwner();
    const definition = mutationDefinition('medium');
    const { service, left, right } = approvalRuntime(
      primaryPrisma,
      contenderPrisma,
      definition,
      owner,
    );
    const receipt = await service.invoke(mutationRequest());
    const invocationId = inputRequiredInvocationId(receipt);

    await expect(left.decide(approvalRequest(invocationId, 'approved'))).rejects.toMatchObject({
      code: 'OWNER_RESULT_AMBIGUOUS',
      invocationId,
    });
    await expect(right.decide(approvalRequest(invocationId, 'approved'))).resolves.toMatchObject({
      id: invocationId,
      status: 'pending',
      approvalStatus: 'approved',
    });

    expect(owner.ownerKeys).toEqual([ownerInvocationKey(invocationId)]);
  });

  it('retries an ambiguous owner commit through a fresh service with one exact owner key and one direct owner receipt', async () => {
    const owner = new DirectReceiptOwner(primaryPrisma, { failAfterFirstCommit: true });
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
    const receipts = await primaryPrisma.sourcingOwnerIdempotencyReceipt.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        capabilityKey: DIRECT_OWNER_CAPABILITY_KEY,
        idempotencyKey: `capability-invocation:${pending.id}`,
      },
      select: { idempotencyKey: true, requestHash: true, result: true },
    });
    expect(receipts).toEqual([
      expect.objectContaining({
        idempotencyKey: `capability-invocation:${pending.id}`,
        requestHash: pending.inputHash,
        result: { candidateId: INPUT.candidateId },
      }),
    ]);
    await expect(primaryPrisma.capabilityInvocation.findFirstOrThrow({
      where: { id: pending.id, organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toMatchObject({ status: 'succeeded' });
    await expect(restartedService.invoke(mutationRequest({
      input: { ...INPUT, mode: 'changed-after-restart' },
    }))).rejects.toMatchObject({ code: 'REQUEST_KEY_CONFLICT' });
    expect(await primaryPrisma.sourcingOwnerIdempotencyReceipt.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        capabilityKey: DIRECT_OWNER_CAPABILITY_KEY,
        idempotencyKey: `capability-invocation:${pending.id}`,
      },
    })).toBe(1);
  });

  it('cleans persisted operation references before strict receipt replay and is idempotent', async () => {
    const owner = new DirectReceiptOwner(primaryPrisma);
    const service = invocationService(primaryPrisma, mutationDefinition('low'), owner);
    const completed = await service.invoke(mutationRequest());
    const completedId = invocationId(completed);
    const legacyResult = {
      summary: 'Race fixture candidate admitted.',
      resourceRefs: [{ kind: 'sourcing_candidate', id: INPUT.candidateId, version: null }],
      operationRefs: [{ kind: 'operation_run', id: '00000000-0000-4000-8000-000000000099' }],
    };

    await primaryPrisma.capabilityInvocation.update({
      where: { id: completedId },
      data: { result: legacyResult },
    });

    const first = await primaryPrisma.$transaction((tx) =>
      removeRetiredCapabilityOperationRefs.run(tx),
    );
    const second = await primaryPrisma.$transaction((tx) =>
      removeRetiredCapabilityOperationRefs.run(tx),
    );

    expect(first).toMatchObject({
      affectedRows: 1,
      details: { legacyReceiptRows: 1, removedOperationReferenceRows: 1 },
    });
    expect(second).toMatchObject({
      affectedRows: 0,
      details: { legacyReceiptRows: 0, removedOperationReferenceRows: 0 },
    });

    const repository = new PrismaCapabilityInvocationRepository(
      primaryPrisma as unknown as PrismaService,
    );
    await expect(repository.findById({
      organizationId: TEST_ORGANIZATION_ID,
      invocationId: completedId,
    })).resolves.toMatchObject({
      result: {
        summary: legacyResult.summary,
        resourceRefs: legacyResult.resourceRefs,
      },
    });
    await expect(service.invoke(mutationRequest())).resolves.toMatchObject({
      kind: 'completed',
      invocationId: completedId,
    });
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
    outputSchema: z.object({ candidateId: z.string().uuid() }).strict(),
    resultSummary: '수집 후보 반영 결과를 확인했습니다.',
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
  return new CapabilityInvocationService(
    repository,
    capabilityRegistry(definition, owner),
    now,
  );
}

function capabilityRegistry(
  definition: CapabilityDefinition,
  owner: { invoke(input: OwnerInvocation): Promise<CapabilityResultEnvelope> },
): AgentCapabilityRegistry {
  const registry = new AgentCapabilityRegistry();
  registry.registerDefinition(definition);
  registry.registerImplementation({
    capabilityKey: definition.key,
    invoke: owner.invoke.bind(owner),
  });
  return registry;
}

function approvalRuntime(
  primary: PrismaClient,
  contender: PrismaClient,
  definition: CapabilityDefinition,
  owner: { invoke(input: OwnerInvocation): Promise<CapabilityResultEnvelope> },
) {
  const primaryRepository = new PrismaCapabilityInvocationRepository(
    primary as unknown as PrismaService,
  );
  const contenderRepository = new PrismaCapabilityInvocationRepository(
    contender as unknown as PrismaService,
  );
  const registry = capabilityRegistry(definition, owner);
  const dispatcher = new CapabilityMutationDispatcher(primaryRepository, registry);
  return {
    service: new CapabilityInvocationService(
      primaryRepository,
      registry,
      undefined,
      undefined,
      dispatcher,
    ),
    left: new CapabilityApprovalService(primaryRepository, dispatcher),
    right: new CapabilityApprovalService(contenderRepository, dispatcher),
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

class DirectReceiptOwner {
  readonly ownerKeys: string[] = [];
  private failAfterFirstCommit: boolean;

  constructor(
    private readonly prisma: PrismaClient,
    options: { failAfterFirstCommit?: boolean } = {},
  ) {
    this.failAfterFirstCommit = options.failAfterFirstCommit ?? false;
  }

  async invoke({ context, input }: OwnerInvocation): Promise<CapabilityResultEnvelope> {
    const ownerIdempotencyKey = context.ownerIdempotencyKey;
    const ownerInputHash = context.ownerInputHash;
    if (!ownerIdempotencyKey || !ownerInputHash) {
      throw new Error('owner idempotency key was not supplied');
    }
    this.ownerKeys.push(ownerIdempotencyKey);
    const result = { candidateId: String(input.candidateId) };
    const receipt = await this.prisma.sourcingOwnerIdempotencyReceipt.upsert({
      where: {
        organizationId_capabilityKey_idempotencyKey: {
          organizationId: context.organizationId,
          capabilityKey: DIRECT_OWNER_CAPABILITY_KEY,
          idempotencyKey: ownerIdempotencyKey,
        },
      },
      create: {
        organizationId: context.organizationId,
        capabilityKey: DIRECT_OWNER_CAPABILITY_KEY,
        idempotencyKey: ownerIdempotencyKey,
        requestHash: ownerInputHash,
        result,
      },
      update: {},
      select: { requestHash: true, result: true },
    });
    if (receipt.requestHash !== ownerInputHash) {
      throw new Error('owner_idempotency_input_conflict');
    }
    if (this.failAfterFirstCommit) {
      this.failAfterFirstCommit = false;
      throw new Error('owner connection dropped after durable commit');
    }
    const candidateId = receiptCandidateId(receipt.result);
    return {
      summary: 'Race fixture candidate admitted.',
      resourceRefs: [{ kind: 'sourcing_candidate', id: candidateId, version: null }],
      output: { candidateId },
    };
  }
}

class AmbiguousOwner {
  readonly ownerKeys: string[] = [];

  async invoke({ context }: OwnerInvocation): Promise<CapabilityResultEnvelope> {
    if (context.ownerIdempotencyKey) this.ownerKeys.push(context.ownerIdempotencyKey);
    throw new Error('owner response was lost after dispatch');
  }
}

function receiptCandidateId(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('owner_idempotency_result_invalid');
  }
  const candidateId = (result as Record<string, unknown>).candidateId;
  if (typeof candidateId !== 'string') {
    throw new Error('owner_idempotency_result_invalid');
  }
  return candidateId;
}
