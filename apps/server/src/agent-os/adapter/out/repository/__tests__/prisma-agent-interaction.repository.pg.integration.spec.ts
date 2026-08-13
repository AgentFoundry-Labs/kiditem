import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../test-helpers/real-prisma';
import type { AgentInteractionRepositoryPort } from '../../../../application/port/out/repository/agent-interaction-repository.port';
import { AgentOsBoundaryError } from '../../../../domain/agent-os.errors';
import { PrismaAgentInteractionRepository } from '../prisma-agent-interaction.repository';

const SAME_ORGANIZATION_USER_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
const AGENT_VERSION_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_AGENT_VERSION_ID = '10000000-0000-4000-8000-000000000002';
const TEST_POLICY_SNAPSHOT_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_POLICY_SNAPSHOT_ID = '20000000-0000-4000-8000-000000000002';
const BINDING_ID = '30000000-0000-4000-8000-000000000001';
const OTHER_BINDING_ID = '30000000-0000-4000-8000-000000000002';
const REPLACEMENT_BINDING_ID = '30000000-0000-4000-8000-000000000003';
const IDLE_EXPIRES_AT = new Date('2026-08-13T08:00:00.000Z');

let prisma: PrismaClient | null = null;
let repository: PrismaAgentInteractionRepository;

beforeAll(async () => {
  prisma = makeTestPrisma();
  repository = new PrismaAgentInteractionRepository(prisma as never);
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  await seedInteractionFixture(prisma);
});

describe('PrismaAgentInteractionRepository transcript-free control persistence', () => {
  it('finds an active Quick Ask only in the complete organization, user, and agent-version scope', async () => {
    const created = await repository.createQuickAskBinding({
      id: BINDING_ID,
      copilotThreadId: 'copilot-thread-active-scope',
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      agentVersionId: AGENT_VERSION_ID,
      idleExpiresAt: IDLE_EXPIRES_AT,
    });

    expect(created).toEqual({
      id: BINDING_ID,
      copilotThreadId: 'copilot-thread-active-scope',
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      agentVersionId: AGENT_VERSION_ID,
      interactionClass: 'quick_ask',
      lifecycle: 'active',
      idleExpiresAt: IDLE_EXPIRES_AT.toISOString(),
      contextEpoch: 1,
    });
    await expect(repository.findActiveQuickAsk({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      agentVersionId: AGENT_VERSION_ID,
    })).resolves.toEqual(created);

    for (const wrongScope of [
      {
        organizationId: OTHER_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        agentVersionId: AGENT_VERSION_ID,
      },
      {
        organizationId: TEST_ORGANIZATION_ID,
        userId: SAME_ORGANIZATION_USER_ID,
        agentVersionId: AGENT_VERSION_ID,
      },
      {
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        agentVersionId: OTHER_AGENT_VERSION_ID,
      },
    ]) {
      await expect(repository.findActiveQuickAsk(wrongScope)).resolves.toBeNull();
    }
  });

  it('does not expose transcript or event writer methods', () => {
    const publicSurface = repository as unknown as Record<string, unknown>;

    expect(publicSurface).not.toHaveProperty('createMessage');
    expect(publicSurface).not.toHaveProperty('appendEvent');
  });

  it('uses the partial unique race guard and permits replacement only after archival', async () => {
    const outcomes = await Promise.allSettled([
      repository.createQuickAskBinding({
        id: BINDING_ID,
        copilotThreadId: 'copilot-thread-race-a',
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        agentVersionId: AGENT_VERSION_ID,
        idleExpiresAt: IDLE_EXPIRES_AT,
      }),
      repository.createQuickAskBinding({
        id: OTHER_BINDING_ID,
        copilotThreadId: 'copilot-thread-race-b',
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        agentVersionId: AGENT_VERSION_ID,
        idleExpiresAt: IDLE_EXPIRES_AT,
      }),
    ]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof repository.createQuickAskBinding>>> =>
        outcome.status === 'fulfilled',
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: 'P2002' });

    await repository.archiveBinding({
      organizationId: TEST_ORGANIZATION_ID,
      id: fulfilled[0]!.value.id,
      archivedAt: new Date('2026-08-13T08:30:00.000Z'),
    });

    await expect(repository.createQuickAskBinding({
      id: REPLACEMENT_BINDING_ID,
      copilotThreadId: 'copilot-thread-race-replacement',
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      agentVersionId: AGENT_VERSION_ID,
      idleExpiresAt: new Date('2026-08-13T09:00:00.000Z'),
    })).resolves.toMatchObject({
      id: REPLACEMENT_BINDING_ID,
      lifecycle: 'active',
    });
  });

  it('serializes the same full Quick Ask scope without conflating any distinct scope component', async () => {
    if (!prisma) throw new Error('Prisma test client was not initialized');
    const scope = {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      agentVersionId: AGENT_VERSION_ID,
    };
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();
    const order: string[] = [];
    let secondEntered = false;

    const first = repository.withQuickAskLock(scope, async () => {
      order.push('first-entered');
      firstEntered.resolve();
      await releaseFirst.promise;
      order.push('first-released');
    });
    await firstEntered.promise;

    const second = repository.withQuickAskLock(scope, async () => {
      secondEntered = true;
      order.push('second-entered');
    });

    try {
      await waitForAdvisoryLockWaiters(prisma, 1);
      expect(secondEntered).toBe(false);

      const distinctScopes = [
        { ...scope, organizationId: OTHER_ORGANIZATION_ID },
        { ...scope, userId: SAME_ORGANIZATION_USER_ID },
        { ...scope, agentVersionId: OTHER_AGENT_VERSION_ID },
      ];
      const enteredDistinctScopes = new Set<string>();
      const distinct = distinctScopes.map((distinctScope, index) =>
        repository.withQuickAskLock(distinctScope, async () => {
          enteredDistinctScopes.add(String(index));
        }),
      );

      await waitForCondition(
        () => enteredDistinctScopes.size === distinctScopes.length,
        'distinct Quick Ask lock scopes to enter while the original scope is held',
      );
      await Promise.all(distinct);
      expect(enteredDistinctScopes).toEqual(new Set(['0', '1', '2']));
    } finally {
      releaseFirst.resolve();
    }

    await Promise.all([first, second]);
    expect(order).toEqual(['first-entered', 'first-released', 'second-entered']);
  });

  it('organization-fences archive and terminal execution mutations', async () => {
    if (!prisma) throw new Error('Prisma test client was not initialized');
    const binding = await createBinding({
      id: OTHER_BINDING_ID,
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      copilotThreadId: 'copilot-thread-other-tenant',
    });
    const execution = await createExecution({
      organizationId: OTHER_ORGANIZATION_ID,
      binding,
      policySnapshotId: OTHER_POLICY_SNAPSHOT_ID,
      aguiRunId: 'agui-run-other-tenant',
    });

    await expect(repository.archiveBinding({
      organizationId: TEST_ORGANIZATION_ID,
      id: binding.id,
      archivedAt: new Date('2026-08-13T10:00:00.000Z'),
    })).rejects.toBeInstanceOf(AgentOsBoundaryError);
    await expect(repository.markExecutionTerminal({
      organizationId: TEST_ORGANIZATION_ID,
      id: execution.id,
      status: 'completed',
      errorCode: null,
      finishedAt: new Date('2026-08-13T10:01:00.000Z'),
    })).rejects.toBeInstanceOf(AgentOsBoundaryError);

    await expect(prisma.agentInteractionThreadBinding.findUniqueOrThrow({
      where: { id: binding.id },
      select: { lifecycle: true, archivedAt: true },
    })).resolves.toEqual({ lifecycle: 'active', archivedAt: null });
    await expect(prisma.agentExecution.findUniqueOrThrow({
      where: { id: execution.id },
      select: { status: true, finishedAt: true },
    })).resolves.toEqual({ status: 'running', finishedAt: null });
  });

  it('rejects cross-scope binding, version, and policy references before execution creation', async () => {
    if (!prisma) throw new Error('Prisma test client was not initialized');
    const ownBinding = await createBinding({
      id: BINDING_ID,
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      copilotThreadId: 'copilot-thread-own-binding',
    });
    const otherBinding = await createBinding({
      id: OTHER_BINDING_ID,
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      copilotThreadId: 'copilot-thread-other-binding',
    });

    await expect(repository.createExecution(executionInput({
      organizationId: TEST_ORGANIZATION_ID,
      binding: otherBinding,
      policySnapshotId: TEST_POLICY_SNAPSHOT_ID,
      aguiRunId: 'agui-run-foreign-binding',
    }))).rejects.toBeInstanceOf(AgentOsBoundaryError);
    await expect(repository.createExecution({
      ...executionInput({
        organizationId: TEST_ORGANIZATION_ID,
        binding: ownBinding,
        policySnapshotId: OTHER_POLICY_SNAPSHOT_ID,
        aguiRunId: 'agui-run-foreign-policy',
      }),
      policySnapshotId: OTHER_POLICY_SNAPSHOT_ID,
    })).rejects.toBeInstanceOf(AgentOsBoundaryError);
    await expect(repository.createExecution({
      ...executionInput({
        organizationId: TEST_ORGANIZATION_ID,
        binding: ownBinding,
        policySnapshotId: TEST_POLICY_SNAPSHOT_ID,
        aguiRunId: 'agui-run-mismatched-version',
      }),
      agentVersionId: OTHER_AGENT_VERSION_ID,
    })).rejects.toBeInstanceOf(AgentOsBoundaryError);

    await expect(prisma.agentExecution.count()).resolves.toBe(0);
  });

  it('keys executions by organization, Copilot thread, and AG-UI run while scoping usage to its execution', async () => {
    if (!prisma) throw new Error('Prisma test client was not initialized');
    const binding = await createBinding({
      id: BINDING_ID,
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      copilotThreadId: 'copilot-thread-execution',
    });
    const input = executionInput({
      organizationId: TEST_ORGANIZATION_ID,
      binding,
      policySnapshotId: TEST_POLICY_SNAPSHOT_ID,
      aguiRunId: 'agui-run-1',
    });
    const execution = await repository.createExecution(input);

    await expect(repository.createExecution(input)).rejects.toMatchObject({ code: 'P2002' });
    await expect(repository.createExecution({
      ...input,
      aguiRunId: 'agui-run-2',
    })).resolves.toEqual({ id: expect.any(String) });

    await expect(repository.recordExecutionUsage({
      organizationId: OTHER_ORGANIZATION_ID,
      executionId: execution.id,
      modelIdentity: 'gpt-5.4',
      provider: 'openai',
      inputTokens: 40,
      outputTokens: 12,
      costMicros: 345n,
      currency: 'USD',
    })).rejects.toBeInstanceOf(AgentOsBoundaryError);
    await repository.recordExecutionUsage({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: execution.id,
      modelIdentity: 'gpt-5.4',
      provider: 'openai',
      inputTokens: 40,
      outputTokens: 12,
      costMicros: 345n,
      currency: 'USD',
    });

    await expect(prisma.agentExecutionUsage.findMany({
      where: { executionId: execution.id },
      select: {
        organizationId: true,
        executionId: true,
        modelIdentity: true,
        provider: true,
        inputTokens: true,
        outputTokens: true,
        costMicros: true,
        currency: true,
      },
    })).resolves.toEqual([{
      organizationId: TEST_ORGANIZATION_ID,
      executionId: execution.id,
      modelIdentity: 'gpt-5.4',
      provider: 'openai',
      inputTokens: 40,
      outputTokens: 12,
      costMicros: 345n,
      currency: 'USD',
    }]);
  });

  it('allows a running execution to reach one terminal state only', async () => {
    if (!prisma) throw new Error('Prisma test client was not initialized');
    const binding = await createBinding({
      id: BINDING_ID,
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      copilotThreadId: 'copilot-thread-terminal',
    });
    const execution = await createExecution({
      organizationId: TEST_ORGANIZATION_ID,
      binding,
      policySnapshotId: TEST_POLICY_SNAPSHOT_ID,
      aguiRunId: 'agui-run-terminal',
    });
    const finishedAt = new Date('2026-08-13T11:00:00.000Z');

    await repository.markExecutionTerminal({
      organizationId: TEST_ORGANIZATION_ID,
      id: execution.id,
      status: 'failed',
      errorCode: 'model_failed',
      finishedAt,
    });
    await expect(repository.markExecutionTerminal({
      organizationId: TEST_ORGANIZATION_ID,
      id: execution.id,
      status: 'completed',
      errorCode: null,
      finishedAt: new Date('2026-08-13T11:01:00.000Z'),
    })).rejects.toBeInstanceOf(AgentOsBoundaryError);

    await expect(prisma.agentExecution.findUniqueOrThrow({
      where: { id: execution.id },
      select: { status: true, errorCode: true, finishedAt: true },
    })).resolves.toEqual({
      status: 'failed',
      errorCode: 'model_failed',
      finishedAt,
    });
  });
});

async function seedInteractionFixture(client: PrismaClient): Promise<void> {
  await client.user.create({
    data: {
      id: SAME_ORGANIZATION_USER_ID,
      email: 'same-org-user@test.local',
      name: 'Same Organization User',
      role: 'member',
      type: 'human',
      memberships: {
        create: {
          organizationId: TEST_ORGANIZATION_ID,
          role: 'member',
          status: 'active',
        },
      },
    },
  });
  await client.agentVersion.createMany({
    data: [
      {
        id: AGENT_VERSION_ID,
        agentDefinitionKey: 'operator',
        version: 1,
        displayName: 'Operator',
        description: 'Synthetic operator version',
        runtimeType: 'copilotkit_agui',
        modelIdentity: 'gpt-5.4',
        capabilityKeys: ['catalog.read'],
        policyDocument: { authorityClass: 'read_only' },
        activatedAt: new Date('2026-08-13T00:00:00.000Z'),
      },
      {
        id: OTHER_AGENT_VERSION_ID,
        agentDefinitionKey: 'operator',
        version: 2,
        displayName: 'Operator v2',
        description: 'Synthetic second operator version',
        runtimeType: 'copilotkit_agui',
        modelIdentity: 'gpt-5.4',
        capabilityKeys: ['catalog.read'],
        policyDocument: { authorityClass: 'read_only' },
        activatedAt: new Date('2026-08-13T00:00:00.000Z'),
      },
    ],
  });
  await client.agentPolicySnapshot.createMany({
    data: [
      {
        id: TEST_POLICY_SNAPSHOT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        agentVersionId: AGENT_VERSION_ID,
        authorityClass: 'read_only',
        capabilityKeys: ['catalog.read'],
        policyHash: 'test-policy-hash',
      },
      {
        id: OTHER_POLICY_SNAPSHOT_ID,
        organizationId: OTHER_ORGANIZATION_ID,
        agentVersionId: AGENT_VERSION_ID,
        authorityClass: 'read_only',
        capabilityKeys: ['catalog.read'],
        policyHash: 'other-policy-hash',
      },
    ],
  });
}

function createBinding(input: {
  id: string;
  organizationId: string;
  userId: string;
  copilotThreadId: string;
}) {
  return repository.createQuickAskBinding({
    ...input,
    agentVersionId: AGENT_VERSION_ID,
    idleExpiresAt: IDLE_EXPIRES_AT,
  });
}

function executionInput(input: {
  organizationId: string;
  binding: Awaited<ReturnType<typeof createBinding>>;
  policySnapshotId: string;
  aguiRunId: string;
}) {
  return {
    organizationId: input.organizationId,
    threadBindingId: input.binding.id,
    copilotThreadId: input.binding.copilotThreadId,
    aguiRunId: input.aguiRunId,
    interactionClass: 'quick_ask' as const,
    agentVersionId: input.binding.agentVersionId,
    runtimeType: 'copilotkit_agui',
    modelIdentity: 'gpt-5.4',
    policySnapshotId: input.policySnapshotId,
    sessionId: null,
    sessionTaskId: null,
  };
}

function createExecution(input: Parameters<typeof executionInput>[0]) {
  return repository.createExecution(executionInput(input));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitForAdvisoryLockWaiters(
  client: PrismaClient,
  minimum: number,
): Promise<void> {
  await waitForCondition(async () => {
    const [row] = await client.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND wait_event = 'advisory'
    `;
    return (row?.count ?? 0) >= minimum;
  }, `${minimum} PostgreSQL advisory-lock waiter(s)`);
}

async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  description: string,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

const _repositoryContract: AgentInteractionRepositoryPort = repository!;
void _repositoryContract;
