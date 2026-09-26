import { Module, type DynamicModule, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, TEST_USER_ID } from '../../test-helpers/real-prisma';
import { PrismaCapabilityInvocationRepository } from '../adapter/out/repository/prisma-capability-invocation.repository';
import { AgentCapabilityRegistry } from '../application/service/agent-capability-registry.service';
import { CapabilityMutationDispatcher } from '../application/service/capability-mutation-dispatcher.service';
import { CAPABILITY_APPROVAL_WINDOW_MS } from '../domain/capability/capability-invocation.policy';
import type { PrismaClient } from '@prisma/client';
import type { CapabilityResultEnvelope } from '@kiditem/shared/agent-interaction';
import type {
  CapabilityDefinition,
  CapabilityApprovalRisk,
} from '../../common/capability-definition';
import type { CapabilityExecutionContext } from '../../common/capability-composition';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CapabilityInvocationRecord } from '../application/port/out/capability-invocation.repository.port';

const BOOTSTRAP_CAPABILITY_KEY = 'sourcing.capability_invocation_bootstrap';
const INPUT = {
  candidateId: '00000000-0000-4000-8000-000000000041',
  mode: 'reconcile',
};

describe('CapabilityMutationDispatcher Nest bootstrap with PostgreSQL', () => {
  let prisma: PrismaClient;
  let repository: PrismaCapabilityInvocationRepository;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new PrismaCapabilityInvocationRepository(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('rejects Nest listen when the approved-pending query fails, then recovers after schema repair and a new app start', async () => {
    const approved = await admitApprovedPending(repository, 'schema-repair', INPUT);
    let tableRenamed = false;
    let failedApp: INestApplication | undefined;

    try {
      await prisma.$executeRaw`ALTER TABLE "capability_invocations" RENAME TO "capability_invocations_schema_mismatch"`;
      tableRenamed = true;

      failedApp = await createNestApp(repository, successfulOwner());
      const startupError = await failedApp.listen(0, '127.0.0.1').then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(startupError).toMatchObject({ code: 'P2021' });
      expect(startupError).toBeInstanceOf(Error);
      expect((startupError as Error).message).toContain('capability_invocations');
    } finally {
      if (failedApp) await failedApp.close();
      if (tableRenamed) {
        await prisma.$executeRaw`ALTER TABLE "capability_invocations_schema_mismatch" RENAME TO "capability_invocations"`;
      }
    }

    const owner = successfulOwner();
    const recoveredApp = await createNestApp(repository, owner);
    await recoveredApp.listen(0, '127.0.0.1');
    try {
      expect(owner.calls).toEqual([
        expect.objectContaining({
          context: expect.objectContaining({
            executionId: approved.id,
            ownerIdempotencyKey: `capability-invocation:${approved.id}`,
            ownerInputHash: approved.inputHash,
          }),
          input: INPUT,
        }),
      ]);
      await expect(repository.findById({
        organizationId: TEST_ORGANIZATION_ID,
        invocationId: approved.id,
      })).resolves.toMatchObject({
        status: 'succeeded',
        approvalDecision: 'approved',
      });
    } finally {
      await recoveredApp.close();
    }
  });

  it('keeps an ambiguous approved receipt pending while completing the other receipts from the same sweep', async () => {
    const ambiguous = await admitApprovedPending(repository, 'ambiguous', {
      ...INPUT,
      candidateId: '00000000-0000-4000-8000-000000000042',
    });
    const completable = await admitApprovedPending(repository, 'completable', {
      ...INPUT,
      candidateId: '00000000-0000-4000-8000-000000000043',
    });
    const owner = {
      calls: [] as OwnerInvocation[],
      async invoke(invocation: OwnerInvocation): Promise<CapabilityResultEnvelope> {
        this.calls.push(invocation);
        if (invocation.context.executionId === ambiguous.id) {
          throw new Error('Owner response was lost after dispatch.');
        }
        return ownerResult(String(invocation.input.candidateId));
      },
    };
    const app = await createNestApp(repository, owner);

    await app.listen(0, '127.0.0.1');
    try {
      expect(owner.calls).toHaveLength(2);
      await expect(repository.findById({
        organizationId: TEST_ORGANIZATION_ID,
        invocationId: ambiguous.id,
      })).resolves.toMatchObject({
        status: 'pending',
        approvalDecision: 'approved',
        result: null,
      });
      await expect(repository.findById({
        organizationId: TEST_ORGANIZATION_ID,
        invocationId: completable.id,
      })).resolves.toMatchObject({
        status: 'succeeded',
        approvalDecision: 'approved',
      });
    } finally {
      await app.close();
    }
  });
});

@Module({})
class CapabilityDispatcherBootstrapTestModule {
  static withDispatcher(
    repository: PrismaCapabilityInvocationRepository,
    capabilities: AgentCapabilityRegistry,
  ): DynamicModule {
    return {
      module: CapabilityDispatcherBootstrapTestModule,
      providers: [{
        provide: CapabilityMutationDispatcher,
        useFactory: () => new CapabilityMutationDispatcher(repository, capabilities),
      }],
    };
  }
}

function createNestApp(
  repository: PrismaCapabilityInvocationRepository,
  owner: Owner,
) {
  return NestFactory.create(
    CapabilityDispatcherBootstrapTestModule.withDispatcher(
      repository,
      capabilityRegistry(owner),
    ),
    { logger: false },
  );
}

async function admitApprovedPending(
  repository: PrismaCapabilityInvocationRepository,
  requestSuffix: string,
  canonicalInput: { candidateId: string; mode: string },
): Promise<CapabilityInvocationRecord> {
  const requestedAt = new Date();
  const inputHash = canonicalOwnerInputHash(canonicalInput);
  const admission = await repository.admit({
    organizationId: TEST_ORGANIZATION_ID,
    initiatingUserId: TEST_USER_ID,
    capabilityKey: BOOTSTRAP_CAPABILITY_KEY,
    actingAgentKey: 'sourcing',
    requestKey: `capability-bootstrap-${requestSuffix}`,
    canonicalInput,
    inputHash,
    approval: {
      required: true,
      requestedAt,
      expiresAt: new Date(requestedAt.getTime() + CAPABILITY_APPROVAL_WINDOW_MS),
    },
  });
  if (admission.kind !== 'created') throw new Error('Expected a new capability invocation.');

  const decision = await repository.decideApproval({
    organizationId: TEST_ORGANIZATION_ID,
    invocationId: admission.invocation.id,
    userId: TEST_USER_ID,
    inputHash,
    decision: 'approved',
    reason: 'Bootstrap integration fixture approval.',
    decidedAt: new Date(),
  });
  if (decision.invocation.approvalDecision !== 'approved') {
    throw new Error('Expected the fixture invocation to be approved.');
  }
  return decision.invocation;
}

function capabilityRegistry(owner: Owner): AgentCapabilityRegistry {
  const registry = new AgentCapabilityRegistry();
  registry.registerDefinition(mutationDefinition());
  registry.registerImplementation({
    capabilityKey: BOOTSTRAP_CAPABILITY_KEY,
    invoke: owner.invoke.bind(owner),
  });
  return registry;
}

function mutationDefinition(approvalRisk: CapabilityApprovalRisk = 'medium'): CapabilityDefinition {
  return {
    key: BOOTSTRAP_CAPABILITY_KEY,
    ownerDomain: 'sourcing',
    ownerInputPort: BOOTSTRAP_CAPABILITY_KEY,
    description: 'PostgreSQL bootstrap recovery integration fixture.',
    inputSchema: z.object({
      candidateId: z.string().uuid(),
      mode: z.string().min(1),
    }).strict(),
    outputSchema: z.object({ candidateId: z.string().uuid() }).strict(),
    resultSummary: 'Bootstrap fixture candidate admitted.',
    effects: ['db_write'],
    approvalRisk,
    idempotency: 'required',
  };
}

interface OwnerInvocation {
  context: CapabilityExecutionContext;
  input: Record<string, unknown>;
}

interface Owner {
  calls: OwnerInvocation[];
  invoke(invocation: OwnerInvocation): Promise<CapabilityResultEnvelope>;
}

function successfulOwner(): Owner {
  return {
    calls: [],
    async invoke(invocation) {
      this.calls.push(invocation);
      return ownerResult(String(invocation.input.candidateId));
    },
  };
}

function ownerResult(candidateId: string): CapabilityResultEnvelope {
  return {
    summary: 'Bootstrap fixture candidate admitted.',
    resourceRefs: [{ kind: 'sourcing_candidate', id: candidateId, version: null }],
    output: { candidateId },
  };
}
