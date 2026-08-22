import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  AgentDefinitionKeySchema,
  AgentSessionIdSchema,
  AgentVersionKeySchema,
  formatAgentSessionName,
  formatAgentVersionName,
  OrganizationIdSchema,
} from "@kiditem/shared/identifiers";
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from "../../../../../../test-helpers/real-prisma";
import { PrismaAgentVersionRepository } from "../../../repository/prisma-agent-version.repository";
import { PrismaAgentSessionQueryRepository } from "../../../repository/interaction/prisma-agent-session-query.repository";
import { PrismaAgentConversationQueryRepository } from "../../../repository/interaction/prisma-agent-conversation-query.repository";
import { PrismaAgentExecutionQueryRepository } from "../../../repository/interaction/prisma-agent-execution-query.repository";
import { PrismaAgentRunAuthorizationTransaction } from "../prisma-agent-run-authorization.transaction";
import { PrismaAgentConversationEventTransaction } from "../prisma-agent-conversation-event.transaction";
import { PrismaAgentExecutionUsageTransaction } from "../prisma-agent-execution-usage.transaction";
import type { PrismaClient } from "@prisma/client";
import type { AgentVersionRepositoryPort } from "../../../../application/port/out/repository/agent-version.repository.port";
import type { AgentSessionQueryRepositoryPort } from "../../../../application/port/out/repository/interaction/agent-session-query.repository.port";
import type { AgentConversationQueryRepositoryPort } from "../../../../application/port/out/repository/interaction/agent-conversation-query.repository.port";
import type { AgentExecutionQueryRepositoryPort } from "../../../../application/port/out/repository/interaction/agent-execution-query.repository.port";
import type { AgentRunAuthorizationTransactionPort } from "../../../../application/port/out/transaction/interaction/agent-run-authorization.transaction.port";
import type { AgentConversationEventTransactionPort } from "../../../../application/port/out/transaction/interaction/agent-conversation-event.transaction.port";
import type { AgentExecutionUsageTransactionPort } from "../../../../application/port/out/transaction/interaction/agent-execution-usage.transaction.port";

const SAME_ORGANIZATION_USER_ID = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";
const AGENT_VERSION_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_AGENT_VERSION_ID = "10000000-0000-4000-8000-000000000002";

let prisma: PrismaClient | null = null;
let repository: AgentVersionRepositoryPort &
  AgentSessionQueryRepositoryPort &
  AgentConversationQueryRepositoryPort &
  AgentExecutionQueryRepositoryPort &
  AgentRunAuthorizationTransactionPort &
  AgentConversationEventTransactionPort &
  AgentExecutionUsageTransactionPort;

beforeAll(async () => {
  prisma = makeTestPrisma();
  const versions = new PrismaAgentVersionRepository(prisma as never);
  const sessions = new PrismaAgentSessionQueryRepository(prisma as never);
  const conversations = new PrismaAgentConversationQueryRepository(
    prisma as never,
  );
  const executions = new PrismaAgentExecutionQueryRepository(prisma as never);
  const authorization = new PrismaAgentRunAuthorizationTransaction(
    prisma as never,
  );
  const events = new PrismaAgentConversationEventTransaction(prisma as never);
  const usage = new PrismaAgentExecutionUsageTransaction(prisma as never);
  repository = {
    listActiveAgentVersions: versions.listActiveAgentVersions.bind(versions),
    findActiveAgentVersion: versions.findActiveAgentVersion.bind(versions),
    probeHealth: versions.probeHealth.bind(versions),
    publishAndActivate: versions.publishAndActivate.bind(versions),
    findActiveByDefinitionKey:
      versions.findActiveByDefinitionKey.bind(versions),
    listSessions: sessions.listSessions.bind(sessions),
    findAccessibleSession: sessions.findAccessibleSession.bind(sessions),
    readConversationEvents:
      conversations.readConversationEvents.bind(conversations),
    readModelConversation:
      conversations.readModelConversation.bind(conversations),
    loadExecutionRuntimeContext:
      executions.loadExecutionRuntimeContext.bind(executions),
    findCurrentExecution: executions.findCurrentExecution.bind(executions),
    findAccessibleCurrentExecution:
      executions.findAccessibleCurrentExecution.bind(executions),
    findCurrentSessionExecution:
      executions.findCurrentSessionExecution.bind(executions),
    authorizeExecution: authorization.authorizeExecution.bind(authorization),
    appendExecutionEvent: events.appendExecutionEvent.bind(events),
    markExecutionTerminal: events.markExecutionTerminal.bind(events),
    recordExecutionUsage: usage.recordExecutionUsage.bind(usage),
  };
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  if (!prisma) throw new Error("Prisma test client was not initialized");
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  await seedInteractionFixture(prisma);
});

describe("Prisma interaction persistence seams", () => {
  it("lists only active immutable agent versions and probes without writing", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const before = await tableCounts(prisma);

    const active = await repository.listActiveAgentVersions();

    expect(active.map((row) => row.id)).toEqual([AGENT_VERSION_ID]);
    expect(active[0]).toEqual({
      id: AGENT_VERSION_ID,
      agentDefinitionKey: "operator",
      version: 1,
      displayName: "Operator",
      description: "Synthetic operator version",
      runtimeType: "copilotkit_agui",
      modelIdentity: "gpt-5.4",
      capabilityKeys: ["catalog.read"],
      policyDocument: { authorityClass: "read_only" },
      activatedAt: new Date("2026-08-13T00:00:00.000Z"),
      retiredAt: null,
    });
    await expect(
      repository.findActiveAgentVersion({
        agentDefinitionKey: "operator",
        agentVersionId: AGENT_VERSION_ID,
      }),
    ).resolves.toEqual(active[0]);
    await expect(
      repository.findActiveAgentVersion({
        agentDefinitionKey: "wrong-definition",
        agentVersionId: AGENT_VERSION_ID,
      }),
    ).resolves.toBeNull();
    await expect(repository.probeHealth()).resolves.toBeUndefined();
    expect(await tableCounts(prisma)).toEqual(before);
    expect(repository).not.toHaveProperty("createPolicySnapshot");
    expect(repository).not.toHaveProperty(
      ["with", "Quick", "Ask", "Lock"].join(""),
    );
    expect(repository).not.toHaveProperty("createQuickAskBinding");
  });

  it("atomically creates the canonical graph for the first run", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const first = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-1",
        aguiRunId: "run-1",
        externalEventId: "message-1",
      }),
    );

    expect(first).toMatchObject({
      createdSession: true,
      session: {
        organizationId: TEST_ORGANIZATION_ID,
        createdByUserId: TEST_USER_ID,
        copilotThreadId: "thread-1",
        primaryAgentVersionId: AGENT_VERSION_ID,
        authorityProfileVersionId: "authority-profile-v1",
        contextEpoch: 1,
        lastEventSequence: 1n,
        lifecycle: "active",
      },
      rootTask: {
        organizationId: TEST_ORGANIZATION_ID,
        status: "interpreting",
        objective: null,
        isRoot: true,
      },
      contextEpoch: 1,
      policy: {
        organizationId: TEST_ORGANIZATION_ID,
        agentVersionId: AGENT_VERSION_ID,
        authorityProfileVersionId: "authority-profile-v1",
        capabilityKeys: ["catalog.read"],
        policyHash: "policy-hash-v1",
      },
      execution: {
        organizationId: TEST_ORGANIZATION_ID,
        copilotThreadId: "thread-1",
        aguiRunId: "run-1",
        inputHash: "input-hash-thread-1-run-1",
        status: "running",
      },
      userEvent: {
        organizationId: TEST_ORGANIZATION_ID,
        externalEventId: "message-1",
        sequence: 1n,
        eventType: "user_message",
        schemaVersion: 1,
        payload: {
          phase: "complete",
          messageId: "message-1",
          content: "재고 현황 알려줘",
        },
      },
    });
    expect(first.rootTask.sessionId).toBe(first.session.id);
    expect(first.execution.sessionId).toBe(first.session.id);
    expect(first.execution.sessionTaskId).toBe(first.rootTask.id);
    expect(first.policy.sessionId).toBe(first.session.id);
    expect(first.userEvent.sessionId).toBe(first.session.id);
    expect(first.userEvent.executionId).toBe(first.execution.id);
    await expect(
      prisma.agentContextEpoch.count({
        where: { sessionId: first.session.id, epoch: 1 },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.agentConversationOutbox.count({
        where: { eventId: first.userEvent.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.agentExecutionAttempt.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sessionId: first.session.id,
          executionId: first.execution.id,
        },
        select: {
          id: true,
          attemptNumber: true,
          idempotencyKey: true,
          runtimeType: true,
          runtimeStartIntentId: true,
          runtimeCredentialGeneration: true,
          state: true,
        },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        attemptNumber: 1,
        idempotencyKey: `agui:${first.execution.aguiRunId}`,
        runtimeType: "copilotkit_agui",
        runtimeStartIntentId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        runtimeCredentialGeneration: 0,
        state: "running",
      }),
    ]);
  });

  it("loads canonical runtime authority, bounded model history, and exact current execution", async () => {
    const authorized = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-runtime-context",
        aguiRunId: "run-runtime-context",
        externalEventId: "message-runtime-context",
      }),
    );

    await expect(
      repository.loadExecutionRuntimeContext({
        executionId: authorized.execution.id,
      }),
    ).resolves.toMatchObject({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      agentDefinitionKey: "operator",
      sessionId: authorized.session.id,
      sessionTaskId: authorized.rootTask.id,
      executionId: authorized.execution.id,
      copilotThreadId: "thread-runtime-context",
      aguiRunId: "run-runtime-context",
      runtimeType: "copilotkit_agui",
      modelIdentity: "gpt-5.4",
      attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      startIntentId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      runtimeCredentialGeneration: 0,
      capabilityKeys: ["catalog.read"],
      initialUserEvent: {
        id: authorized.userEvent.id,
        externalEventId: "message-runtime-context",
      },
    });
    await expect(
      repository.readModelConversation({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: authorized.session.id,
        throughSequence: authorized.userEvent.sequence,
        limit: 1,
      }),
    ).resolves.toMatchObject({
      hasMore: false,
      events: [{ id: authorized.userEvent.id }],
    });
    await expect(
      repository.findCurrentExecution({
        executionId: authorized.execution.id,
      }),
    ).resolves.toMatchObject({
      organizationId: TEST_ORGANIZATION_ID,
      agentDefinitionKey: "operator",
      executionId: authorized.execution.id,
      status: "running",
    });
    await expect(
      repository.findAccessibleCurrentExecution({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        sessionId: authorized.session.id,
        copilotThreadId: "thread-runtime-context",
      }),
    ).resolves.toMatchObject({
      executionId: authorized.execution.id,
      aguiRunId: "run-runtime-context",
      attempt: 1,
    });
    await expect(
      repository.findAccessibleCurrentExecution({
        organizationId: TEST_ORGANIZATION_ID,
        userId: OTHER_USER_ID,
        sessionId: authorized.session.id,
        copilotThreadId: "thread-runtime-context",
      }),
    ).resolves.toBeNull();
    await expect(
      repository.findCurrentSessionExecution({
        sessionId: authorized.session.id,
        copilotThreadId: "thread-runtime-context",
      }),
    ).resolves.toMatchObject({ executionId: authorized.execution.id });
    await expect(
      repository.loadExecutionRuntimeContext({
        executionId: "20000000-0000-4000-8000-000000000099",
      }),
    ).resolves.toBeNull();
  });

  it("returns the unchanged winner for an exact first-run retry", async () => {
    const input = firstRunInput({
      copilotThreadId: "thread-retry",
      aguiRunId: "run-retry",
    });
    const first = await repository.authorizeExecution(input);
    const retry = await repository.authorizeExecution(input);

    expect(retry.createdSession).toBe(false);
    expect(retry.session.id).toBe(first.session.id);
    expect(retry.rootTask.id).toBe(first.rootTask.id);
    expect(retry.execution.id).toBe(first.execution.id);
    expect(retry.policy.id).toBe(first.policy.id);
    expect(retry.userEvent.id).toBe(first.userEvent.id);
  });

  it("creates one graph when the exact first request races", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const input = firstRunInput({
      copilotThreadId: "thread-race",
      aguiRunId: "run-race",
    });

    const [first, second] = await Promise.all([
      repository.authorizeExecution(input),
      repository.authorizeExecution(input),
    ]);

    expect(second.session.id).toBe(first.session.id);
    expect(second.rootTask.id).toBe(first.rootTask.id);
    expect(second.execution.id).toBe(first.execution.id);
    expect(second.userEvent.id).toBe(first.userEvent.id);
    await expect(
      prisma.agentSession.count({
        where: { copilotThreadId: "thread-race" },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.agentSessionTask.count({
        where: { session: { copilotThreadId: "thread-race" }, isRoot: true },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.agentConversationEvent.count({
        where: { session: { copilotThreadId: "thread-race" } },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.agentConversationOutbox.count({
        where: { event: { session: { copilotThreadId: "thread-race" } } },
      }),
    ).resolves.toBe(1);
  });

  it("reuses the session and root task for later runs and separates another thread", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const first = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-many-runs",
        aguiRunId: "run-1",
      }),
    );
    const second = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-many-runs",
        aguiRunId: "run-2",
      }),
    );
    const other = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-other",
        aguiRunId: "run-1",
      }),
    );

    expect(second.createdSession).toBe(false);
    expect(second.session.id).toBe(first.session.id);
    expect(second.rootTask.id).toBe(first.rootTask.id);
    expect(second.execution.id).not.toBe(first.execution.id);
    expect(second.userEvent.sequence).toBe(2n);
    expect(other.session.id).not.toBe(first.session.id);
    await expect(prisma.agentSession.count()).resolves.toBe(2);
    await expect(prisma.agentSessionTask.count()).resolves.toBe(2);
    await expect(prisma.agentExecution.count()).resolves.toBe(3);
    await expect(prisma.agentConversationEvent.count()).resolves.toBe(3);
    await expect(prisma.agentConversationOutbox.count()).resolves.toBe(3);

    const retry = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-many-runs",
        aguiRunId: "run-2",
      }),
    );
    expect(retry.execution.id).toBe(second.execution.id);
    expect(retry.userEvent.id).toBe(second.userEvent.id);
    await expect(prisma.agentConversationEvent.count()).resolves.toBe(3);
    await expect(prisma.agentConversationOutbox.count()).resolves.toBe(3);
  });

  it.each([
    [
      "input hash",
      (input: ReturnType<typeof firstRunInput>) => ({
        ...input,
        inputHash: "changed",
      }),
      "INTERACTION_RUN_CONFLICT",
    ],
    [
      "external event id",
      (input: ReturnType<typeof firstRunInput>) => ({
        ...input,
        userEvent: { ...input.userEvent, externalEventId: "changed-event-id" },
      }),
      "INTERACTION_RUN_CONFLICT",
    ],
    [
      "schema version",
      (input: ReturnType<typeof firstRunInput>) => ({
        ...input,
        userEvent: { ...input.userEvent, schemaVersion: 2 },
      }),
      "INTERACTION_EVENT_ENVELOPE_INVALID",
    ],
    [
      "canonical payload",
      (input: ReturnType<typeof firstRunInput>) => ({
        ...input,
        userEvent: {
          ...input.userEvent,
          payload: { ...input.userEvent.payload, content: "변경된 요청" },
        },
      }),
      "INTERACTION_RUN_CONFLICT",
    ],
    [
      "runtime",
      (input: ReturnType<typeof firstRunInput>) => ({
        ...input,
        runtimeType: "changed",
      }),
      "INTERACTION_RUN_CONFLICT",
    ],
    [
      "model",
      (input: ReturnType<typeof firstRunInput>) => ({
        ...input,
        modelIdentity: "changed",
      }),
      "INTERACTION_RUN_CONFLICT",
    ],
    [
      "authority profile",
      (input: ReturnType<typeof firstRunInput>) => ({
        ...input,
        authorityProfileVersionId: "changed",
      }),
      "INTERACTION_RUN_CONFLICT",
    ],
    [
      "capabilities",
      (input: ReturnType<typeof firstRunInput>) => ({
        ...input,
        capabilityKeys: ["catalog.read", "catalog.write"],
      }),
      "INTERACTION_RUN_CONFLICT",
    ],
    [
      "policy hash",
      (input: ReturnType<typeof firstRunInput>) => ({
        ...input,
        policyHash: "changed",
      }),
      "INTERACTION_RUN_CONFLICT",
    ],
  ])(
    "rejects exact run reuse with changed %s",
    async (_label, mutate, expectedCode) => {
      const input = firstRunInput({
        copilotThreadId: "thread-run-conflict",
        aguiRunId: "run-conflict",
      });
      const first = await repository.authorizeExecution(input);

      await expect(
        repository.authorizeExecution(mutate(input) as never),
      ).rejects.toMatchObject({
        code: expectedCode,
      });
      const exactWithReorderedPayload = {
        ...input,
        userEvent: {
          ...input.userEvent,
          payload: {
            phase: "complete",
            content: input.userEvent.payload.content,
            messageId: input.userEvent.payload.messageId,
          },
        },
      };
      await expect(
        repository.authorizeExecution(exactWithReorderedPayload),
      ).resolves.toMatchObject({
        execution: { id: first.execution.id },
        userEvent: { id: first.userEvent.id },
      });
    },
  );

  it("serializes the full authorization scope while distinct scopes keep progressing", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const blocked = firstRunInput({
      copilotThreadId: "thread-lock",
      aguiRunId: "run-lock",
    });
    const lockHeld = deferred<void>();
    const releaseLock = deferred<void>();
    const blocker = prisma.$transaction(async (tx) => {
      const lockKey = authorizationLockKey(blocked);
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;
      lockHeld.resolve();
      await releaseLock.promise;
    });
    await lockHeld.promise;

    const waiter = repository.authorizeExecution(blocked);
    try {
      await waitForAdvisoryLockWaiters(prisma, 1);
      await Promise.all([
        repository.authorizeExecution(
          firstRunInput({
            copilotThreadId: "thread-lock-distinct-thread",
            aguiRunId: "run-distinct-thread",
          }),
        ),
        repository.authorizeExecution(
          firstRunInput({
            organizationId: TEST_ORGANIZATION_ID,
            userId: SAME_ORGANIZATION_USER_ID,
            copilotThreadId: "thread-lock-distinct-user",
            aguiRunId: "run-distinct-user",
          }),
        ),
        repository.authorizeExecution(
          firstRunInput({
            organizationId: OTHER_ORGANIZATION_ID,
            userId: OTHER_USER_ID,
            copilotThreadId: "thread-lock",
            aguiRunId: "run-distinct-org",
          }),
        ),
      ]);
    } finally {
      releaseLock.resolve();
      await blocker;
    }
    await expect(waiter).resolves.toMatchObject({
      session: { copilotThreadId: "thread-lock" },
    });
  });

  it("never waits for the session lifecycle lock after acquiring authorization serialization", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const input = firstRunInput({
      copilotThreadId: "thread-authorization-lock-order",
      aguiRunId: "run-authorization-lock-order",
    });
    const lockClient = makeTestPrisma();
    await lockClient.$connect();
    const releaseAuthorization = deferred<void>();
    const authorizationLocked = deferred<void>();
    const authorizationBarrier = lockClient.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(
          ${authorizationLockKey(input)},
          0
        ))::text AS "lock"
      `;
      authorizationLocked.resolve();
      await releaseAuthorization.promise;
    });
    await authorizationLocked.promise;

    const waiter = repository.authorizeExecution(input);
    await waitForAdvisoryLockWaiters(prisma, 1);
    await createAuthorizationSession(prisma, input);
    const existing = repository.authorizeExecution(input);
    try {
      await waitForAdvisoryLockWaiters(prisma, 2);
      releaseAuthorization.resolve();
      await authorizationBarrier;
      await expect(
        settlesWithin(Promise.all([waiter, existing]), 5_000),
      ).resolves.toHaveLength(2);
    } finally {
      releaseAuthorization.resolve();
      await Promise.allSettled([authorizationBarrier, waiter, existing]);
      await lockClient.$disconnect();
    }
  });

  it("snapshots the validated first user event before authorization awaits", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const input = firstRunInput({
      copilotThreadId: "thread-event-snapshot",
      aguiRunId: "run-event-snapshot",
      externalEventId: "original-user-event",
    });
    const lockHeld = deferred<void>();
    const releaseLock = deferred<void>();
    const blocker = prisma.$transaction(async (tx) => {
      const lockKey = authorizationLockKey(input);
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;
      lockHeld.resolve();
      await releaseLock.promise;
    });
    await lockHeld.promise;

    const authorizationPromise = repository.authorizeExecution(input);
    input.userEvent.externalEventId = "mutated-user-event";
    input.userEvent.payload.messageId = "mutated-user-event";
    input.userEvent.payload.content = "mutated after invocation";
    try {
      await waitForAdvisoryLockWaiters(prisma, 1);
    } finally {
      releaseLock.resolve();
      await blocker;
    }

    await expect(authorizationPromise).resolves.toMatchObject({
      userEvent: {
        externalEventId: "original-user-event",
        payload: {
          phase: "complete",
          messageId: "original-user-event",
          content: "재고 현황 알려줘",
        },
      },
    });
  });

  it("allocates unique monotonic sequences and one outbox per concurrent event", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const first = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-events",
        aguiRunId: "run-events",
      }),
    );

    const appended = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        repository.appendExecutionEvent({
          organizationId: TEST_ORGANIZATION_ID,
          sessionId: first.session.id,
          executionId: first.execution.id,
          externalEventId: `assistant-${index}`,
          eventType: "assistant_message",
          schemaVersion: 1,
          payload: {
            phase: "complete",
            messageId: `assistant-${index}`,
            content: `answer-${index}`,
          },
        }),
      ),
    );

    expect(appended.map((event) => event.sequence).sort(compareBigInt)).toEqual(
      Array.from({ length: 12 }, (_, index) => BigInt(index + 2)),
    );
    expect(new Set(appended.map((event) => event.sequence)).size).toBe(12);
    await expect(
      prisma.agentConversationEvent.count({
        where: { sessionId: first.session.id },
      }),
    ).resolves.toBe(13);
    await expect(
      prisma.agentConversationOutbox.count({
        where: { event: { sessionId: first.session.id } },
      }),
    ).resolves.toBe(13);
    await expect(
      prisma.agentSession.findUniqueOrThrow({
        where: { id: first.session.id },
        select: { lastEventSequence: true },
      }),
    ).resolves.toEqual({ lastEventSequence: 13n });
  });

  it("snapshots a validated append event before the session lock await", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const first = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-append-snapshot",
        aguiRunId: "run-append-snapshot",
      }),
    );
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: first.session.id,
      executionId: first.execution.id,
      externalEventId: "original-assistant-event",
      eventType: "assistant_message" as const,
      schemaVersion: 1 as const,
      payload: {
        phase: "complete" as const,
        messageId: "original-assistant-event",
        content: "original assistant content",
      },
    };
    const lockHeld = deferred<void>();
    const releaseLock = deferred<void>();
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM agent_sessions
        WHERE id = ${first.session.id}::uuid
        FOR UPDATE
      `;
      lockHeld.resolve();
      await releaseLock.promise;
    });
    await lockHeld.promise;

    const appendPromise = repository.appendExecutionEvent(input);
    input.externalEventId = "mutated-assistant-event";
    input.payload.messageId = "mutated-assistant-event";
    input.payload.content = "mutated after invocation";
    releaseLock.resolve();
    await blocker;

    await expect(appendPromise).resolves.toMatchObject({
      externalEventId: "original-assistant-event",
      payload: {
        phase: "complete",
        messageId: "original-assistant-event",
        content: "original assistant content",
      },
    });
  });

  it("returns the event winner for canonical exact retry and conflicts on mismatched reuse", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const first = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-event-retry",
        aguiRunId: "run-event-retry",
      }),
    );
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: first.session.id,
      executionId: first.execution.id,
      externalEventId: "assistant-retry",
      eventType: "assistant_message" as const,
      schemaVersion: 1 as const,
      payload: {
        phase: "complete" as const,
        messageId: "assistant-retry",
        content: "answer",
      },
    };
    const event = await repository.appendExecutionEvent(input);
    const retry = await repository.appendExecutionEvent({
      ...input,
      payload: {
        phase: "complete",
        content: "answer",
        messageId: "assistant-retry",
      },
    });

    expect(retry.id).toBe(event.id);
    expect(retry.sequence).toBe(event.sequence);
    for (const [mismatch, expectedCode] of [
      [{ ...input, executionId: null }, "INTERACTION_EVENT_CONFLICT"],
      [
        {
          ...input,
          eventType: "system_notice" as const,
          payload: { code: "changed", content: "answer" },
        },
        "INTERACTION_EVENT_CONFLICT",
      ],
      [{ ...input, schemaVersion: 2 }, "INTERACTION_EVENT_ENVELOPE_INVALID"],
      [
        {
          ...input,
          payload: {
            phase: "complete",
            messageId: "assistant-retry",
            content: "changed",
          },
        },
        "INTERACTION_EVENT_CONFLICT",
      ],
    ]) {
      await expect(
        repository.appendExecutionEvent(mismatch as never),
      ).rejects.toMatchObject({
        code: expectedCode,
      });
    }
    await expect(
      prisma.agentConversationEvent.count({
        where: { externalEventId: "assistant-retry" },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.agentConversationOutbox.count({
        where: { eventId: event.id },
      }),
    ).resolves.toBe(1);
  });

  it.each([
    {
      label: "event and payload discriminant mismatch",
      eventType: "assistant_message",
      schemaVersion: 1,
      payload: { code: "wrong_payload", content: "not an assistant message" },
    },
    {
      label: "unsupported event schema version",
      eventType: "assistant_message",
      schemaVersion: 2,
      payload: {
        phase: "complete",
        messageId: "unsupported-version",
        content: "unsupported",
      },
    },
  ])(
    "rejects $label before sequence allocation or storage",
    async (invalid) => {
      if (!prisma) throw new Error("Prisma test client was not initialized");
      const first = await repository.authorizeExecution(
        firstRunInput({
          copilotThreadId: `thread-${invalid.schemaVersion}-${invalid.label}`,
          aguiRunId: `run-${invalid.schemaVersion}-${invalid.label}`,
        }),
      );
      const before = await tableCounts(prisma);
      const beforeHead = first.session.lastEventSequence;

      await expect(
        repository.appendExecutionEvent({
          organizationId: TEST_ORGANIZATION_ID,
          sessionId: first.session.id,
          executionId: first.execution.id,
          externalEventId: `invalid-${invalid.schemaVersion}-${invalid.label}`,
          eventType: invalid.eventType,
          schemaVersion: invalid.schemaVersion,
          payload: invalid.payload,
        } as never),
      ).rejects.toMatchObject({
        code: "INTERACTION_EVENT_ENVELOPE_INVALID",
      });

      expect(await tableCounts(prisma)).toEqual(before);
      await expect(
        prisma.agentSession.findUniqueOrThrow({
          where: { id: first.session.id },
          select: { lastEventSequence: true },
        }),
      ).resolves.toEqual({ lastEventSequence: beforeHead });
    },
  );

  it("reconciles a terminal event atomically and refuses contradictory or second transitions", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const first = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-terminal-event",
        aguiRunId: "run-terminal-event",
      }),
    );
    const terminal = {
      status: "failed" as const,
      errorCode: "model_failed",
      finishedAt: new Date("2026-08-13T03:00:00.000Z"),
    };
    const event = await repository.appendExecutionEvent({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: first.session.id,
      executionId: first.execution.id,
      externalEventId: "terminal-event",
      eventType: "run_terminal",
      schemaVersion: 1,
      payload: { status: "failed", errorCode: "model_failed" },
      terminal,
    });

    await expect(
      repository.appendExecutionEvent({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: first.session.id,
        executionId: first.execution.id,
        externalEventId: "terminal-event",
        eventType: "run_terminal",
        schemaVersion: 1,
        payload: { errorCode: "model_failed", status: "failed" },
        terminal,
      }),
    ).resolves.toMatchObject({ id: event.id });
    await expect(
      repository.appendExecutionEvent({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: first.session.id,
        executionId: first.execution.id,
        externalEventId: "terminal-event",
        eventType: "run_terminal",
        schemaVersion: 1,
        payload: { status: "failed", errorCode: "model_failed" },
        terminal: {
          ...terminal,
          finishedAt: new Date("2026-08-13T03:00:05.000Z"),
        },
      }),
    ).resolves.toMatchObject({ id: event.id });
    await expect(
      repository.appendExecutionEvent({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: first.session.id,
        executionId: first.execution.id,
        externalEventId: "terminal-event",
        eventType: "run_terminal",
        schemaVersion: 1,
        payload: { status: "failed", errorCode: "model_failed" },
      }),
    ).rejects.toMatchObject({
      code: "INTERACTION_EXECUTION_TERMINAL_INVALID",
    });
    await expect(
      prisma.agentExecution.findUniqueOrThrow({
        where: { id: first.execution.id },
        select: { status: true, errorCode: true, finishedAt: true },
      }),
    ).resolves.toEqual(terminal);

    await expect(
      repository.appendExecutionEvent({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: first.session.id,
        executionId: first.execution.id,
        externalEventId: "contradictory-terminal",
        eventType: "run_terminal",
        schemaVersion: 1,
        payload: { status: "completed", errorCode: null },
        terminal: {
          status: "failed",
          errorCode: "model_failed",
          finishedAt: new Date("2026-08-13T03:01:00.000Z"),
        },
      }),
    ).rejects.toMatchObject({ code: "INTERACTION_EXECUTION_TERMINAL_INVALID" });
    await expect(
      repository.appendExecutionEvent({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: first.session.id,
        executionId: first.execution.id,
        externalEventId: "second-terminal",
        eventType: "run_terminal",
        schemaVersion: 1,
        payload: { status: "completed", errorCode: null },
        terminal: {
          status: "completed",
          errorCode: null,
          finishedAt: new Date("2026-08-13T03:02:00.000Z"),
        },
      }),
    ).rejects.toMatchObject({ code: "INTERACTION_EXECUTION_NOT_RUNNING" });
    await expect(
      prisma.agentConversationEvent.count({
        where: { sessionId: first.session.id },
      }),
    ).resolves.toBe(2);
  });

  it("enforces terminal invariants and permits one running-to-terminal transition", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const first = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-terminal",
        aguiRunId: "run-terminal",
      }),
    );
    const unsafeRepository = repository as unknown as {
      markExecutionTerminal(input: Record<string, unknown>): Promise<void>;
    };

    await expect(
      unsafeRepository.markExecutionTerminal({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: first.session.id,
        id: first.execution.id,
        status: "completed",
        errorCode: "invalid",
        finishedAt: new Date("2026-08-13T04:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "INTERACTION_EXECUTION_TERMINAL_INVALID" });
    await expect(
      prisma.agentExecution.findUniqueOrThrow({
        where: { id: first.execution.id },
        select: { status: true, errorCode: true, finishedAt: true },
      }),
    ).resolves.toEqual({
      status: "running",
      errorCode: null,
      finishedAt: null,
    });

    const finishedAt = new Date("2026-08-13T04:01:00.000Z");
    await repository.markExecutionTerminal({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: first.session.id,
      id: first.execution.id,
      status: "cancelled",
      errorCode: "user_cancelled",
      finishedAt,
    });
    await expect(
      repository.markExecutionTerminal({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: first.session.id,
        id: first.execution.id,
        status: "completed",
        errorCode: null,
        finishedAt: new Date("2026-08-13T04:02:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "INTERACTION_EXECUTION_NOT_RUNNING" });
    await expect(
      prisma.agentExecution.findUniqueOrThrow({
        where: { id: first.execution.id },
        select: { status: true, errorCode: true, finishedAt: true },
      }),
    ).resolves.toEqual({
      status: "cancelled",
      errorCode: "user_cancelled",
      finishedAt,
    });
  });

  it("binds direct terminalization to the supplied active session", async () => {
    const active = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-terminal-active-session",
        aguiRunId: "run-terminal-active-session",
      }),
    );
    const deleting = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-terminal-deleting-session",
        aguiRunId: "run-terminal-deleting-session",
      }),
    );
    await prisma!.agentSession.update({
      where: { id: deleting.session.id },
      data: { lifecycle: "deleting" },
    });

    await expect(
      repository.markExecutionTerminal({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: active.session.id,
        id: deleting.execution.id,
        status: "cancelled",
        errorCode: "session_mismatch",
        finishedAt: new Date("2026-08-22T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "INTERACTION_EXECUTION_NOT_RUNNING" });
    await expect(
      prisma!.agentExecution.findUniqueOrThrow({
        where: { id: deleting.execution.id },
        select: { status: true, errorCode: true, finishedAt: true },
      }),
    ).resolves.toEqual({
      status: "running",
      errorCode: null,
      finishedAt: null,
    });

    const finishedAt = new Date("2026-08-22T00:01:00.000Z");
    await expect(
      repository.markExecutionTerminal({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: active.session.id,
        id: active.execution.id,
        status: "cancelled",
        errorCode: "user_cancelled",
        finishedAt,
      }),
    ).resolves.toBeUndefined();
    await expect(
      prisma!.agentExecution.findUniqueOrThrow({
        where: { id: active.execution.id },
        select: { status: true, errorCode: true, finishedAt: true },
      }),
    ).resolves.toEqual({
      status: "cancelled",
      errorCode: "user_cancelled",
      finishedAt,
    });
  });

  it.each(["deleting", "delete_failed"] as const)(
    "rejects a direct terminal write after the %s lifecycle fence",
    async (lifecycle) => {
      const first = await repository.authorizeExecution(
        firstRunInput({
          copilotThreadId: `thread-terminal-${lifecycle}`,
          aguiRunId: `run-terminal-${lifecycle}`,
        }),
      );
      await prisma!.agentSession.update({
        where: { id: first.session.id },
        data: { lifecycle },
      });
      const unsafeEvents = repository as unknown as {
        markExecutionTerminal(input: Record<string, unknown>): Promise<void>;
      };

      await expect(
        unsafeEvents.markExecutionTerminal({
          organizationId: TEST_ORGANIZATION_ID,
          sessionId: first.session.id,
          id: first.execution.id,
          status: "cancelled",
          errorCode: "deletion_fenced",
          finishedAt: new Date("2026-08-22T00:00:00.000Z"),
        }),
      ).rejects.toMatchObject({
        code: "AGENT_SESSION_CONTROL_STATE_CONFLICT",
      });
      await expect(
        prisma!.agentExecution.findUniqueOrThrow({
          where: { id: first.execution.id },
          select: { status: true, errorCode: true, finishedAt: true },
        }),
      ).resolves.toEqual({
        status: "running",
        errorCode: null,
        finishedAt: null,
      });
    },
  );

  it("records usage with the canonical execution model and rejects caller model mismatch", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const first = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-usage",
        aguiRunId: "run-usage",
      }),
    );

    await expect(
      repository.recordExecutionUsage({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: first.session.id,
        executionId: first.execution.id,
        modelIdentity: "different-model",
        provider: "openai",
        inputTokens: 40,
        outputTokens: 12,
        costMicros: 345n,
        currency: "USD",
      }),
    ).rejects.toMatchObject({ code: "INTERACTION_USAGE_MODEL_MISMATCH" });
    await repository.recordExecutionUsage({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: first.session.id,
      executionId: first.execution.id,
      modelIdentity: "gpt-5.4",
      provider: "openai",
      inputTokens: 40,
      outputTokens: 12,
      costMicros: 345n,
      currency: "USD",
    });

    await expect(
      prisma.agentExecutionUsage.findMany({
        where: { executionId: first.execution.id },
        select: {
          modelIdentity: true,
          provider: true,
          inputTokens: true,
          outputTokens: true,
        },
      }),
    ).resolves.toEqual([
      {
        modelIdentity: first.execution.modelIdentity,
        provider: "openai",
        inputTokens: 40,
        outputTokens: 12,
      },
    ]);
  });

  it.each([
    [
      "event",
      async () => {
        const first = await repository.authorizeExecution(
          firstRunInput({
            copilotThreadId: "thread-deleting-event",
            aguiRunId: "run-deleting-event",
          }),
        );
        await markDeleting(first.session.id);
        return repository.appendExecutionEvent({
          organizationId: TEST_ORGANIZATION_ID,
          sessionId: first.session.id,
          executionId: first.execution.id,
          externalEventId: "deleting-event",
          eventType: "assistant_message",
          schemaVersion: 1,
          payload: {
            phase: "complete",
            messageId: "deleting-event",
            content: "must not append after deletion begins",
          },
        });
      },
    ],
    [
      "authorization",
      async () => {
        const input = firstRunInput({
          copilotThreadId: "thread-deleting-authorization",
          aguiRunId: "run-deleting-authorization",
        });
        const first = await repository.authorizeExecution(input);
        await markDeleting(first.session.id);
        return repository.authorizeExecution(input);
      },
    ],
    [
      "usage",
      async () => {
        const first = await repository.authorizeExecution(
          firstRunInput({
            copilotThreadId: "thread-deleting-usage",
            aguiRunId: "run-deleting-usage",
          }),
        );
        await markDeleting(first.session.id);
        return repository.recordExecutionUsage({
          organizationId: TEST_ORGANIZATION_ID,
          sessionId: first.session.id,
          executionId: first.execution.id,
          modelIdentity: "gpt-5.4",
          provider: "openai",
          inputTokens: 40,
          outputTokens: 12,
          costMicros: 345n,
          currency: "USD",
        });
      },
    ],
  ])("rejects %s after the deletion fence", async (_kind, mutate) => {
    await expect(mutate()).rejects.toMatchObject({
      code: "AGENT_SESSION_CONTROL_STATE_CONFLICT",
    });
  });

  it("hides deleting and failed-deletion sessions from ordinary bootstrap and history reads", async () => {
    const deleting = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-hidden-deleting",
        aguiRunId: "run-hidden-deleting",
      }),
    );
    const failed = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-hidden-failed",
        aguiRunId: "run-hidden-failed",
      }),
    );
    await markDeleting(deleting.session.id);
    await prisma!.agentSession.update({
      where: { id: failed.session.id },
      data: { lifecycle: "delete_failed" },
    });

    await expect(
      repository.listSessions({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        limit: 50,
      }),
    ).resolves.toEqual([]);
    await expect(
      repository.findAccessibleSession({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        copilotThreadId: deleting.session.copilotThreadId,
      }),
    ).resolves.toBeNull();
    await expect(
      repository.readConversationEvents({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        sessionId: deleting.session.id,
        afterSequence: 0n,
        limit: 50,
      }),
    ).resolves.toEqual({ events: [], lastSequence: 0n, hasMore: false });
  });

  it("fences compact bounded session lists and direct access by organization and creator", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const sessionA = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-list-a",
        aguiRunId: "run-list-a",
      }),
    );
    const sessionB = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-list-b",
        aguiRunId: "run-list-b",
      }),
    );
    const sessionC = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-list-c",
        aguiRunId: "run-list-c",
      }),
    );
    await repository.authorizeExecution(
      firstRunInput({
        organizationId: OTHER_ORGANIZATION_ID,
        userId: OTHER_USER_ID,
        copilotThreadId: "thread-list-other",
        aguiRunId: "run-list-other",
      }),
    );
    await prisma.agentSession.update({
      where: { id: sessionA.session.id },
      data: { updatedAt: new Date("2026-08-13T01:00:00.000Z") },
    });
    await prisma.agentSession.update({
      where: { id: sessionB.session.id },
      data: { updatedAt: new Date("2026-08-13T02:00:00.000Z") },
    });
    await prisma.agentSession.update({
      where: { id: sessionC.session.id },
      data: { updatedAt: new Date("2026-08-13T03:00:00.000Z") },
    });

    const listed = await repository.listSessions({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      limit: 2,
    });
    expect(listed.map((session) => session.copilotThreadId)).toEqual([
      "thread-list-c",
      "thread-list-b",
    ]);
    expect(Object.keys(listed[0]!).sort()).toEqual([
      "copilotThreadId",
      "lifecycle",
      "name",
      "primaryAgentDefinitionKey",
      "primaryAgentVersion",
      "updatedAt",
    ]);
    expect(listed).toEqual([
      expect.objectContaining({
        name: formatAgentSessionName(
          OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
          AgentSessionIdSchema.parse(sessionC.session.id),
        ),
        primaryAgentVersion: formatAgentVersionName(
          AgentDefinitionKeySchema.parse("operator"),
          AgentVersionKeySchema.parse("1"),
        ),
      }),
      expect.objectContaining({
        name: formatAgentSessionName(
          OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
          AgentSessionIdSchema.parse(sessionB.session.id),
        ),
        primaryAgentVersion: formatAgentVersionName(
          AgentDefinitionKeySchema.parse("operator"),
          AgentVersionKeySchema.parse("1"),
        ),
      }),
    ]);
    await expect(
      repository.listSessions({
        organizationId: TEST_ORGANIZATION_ID,
        userId: SAME_ORGANIZATION_USER_ID,
        limit: 1000,
      }),
    ).resolves.toEqual([]);
    await expect(
      repository.findAccessibleSession({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        copilotThreadId: "thread-list-a",
      }),
    ).resolves.toMatchObject({ id: sessionA.session.id });
    for (const wrongScope of [
      { organizationId: OTHER_ORGANIZATION_ID, userId: TEST_USER_ID },
      {
        organizationId: TEST_ORGANIZATION_ID,
        userId: SAME_ORGANIZATION_USER_ID,
      },
    ]) {
      await expect(
        repository.findAccessibleSession({
          ...wrongScope,
          copilotThreadId: "thread-list-a",
        }),
      ).resolves.toBeNull();
    }
  });

  it("reads a bounded replay strictly after the decoded boundary without writing", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const first = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-replay",
        aguiRunId: "run-replay",
      }),
    );
    for (let index = 0; index < 3; index += 1) {
      await repository.appendExecutionEvent({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: first.session.id,
        executionId: first.execution.id,
        externalEventId: `replay-${index}`,
        eventType: "assistant_message",
        schemaVersion: 1,
        payload: {
          phase: "complete",
          messageId: `replay-${index}`,
          content: `answer-${index}`,
        },
      });
    }
    const before = await tableCounts(prisma);

    const page = await repository.readConversationEvents({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      sessionId: first.session.id,
      afterSequence: 1n,
      limit: 2,
    });

    expect(page.events.map((event) => event.sequence)).toEqual([2n, 3n]);
    expect(page.events.map((event) => event.aguiRunId)).toEqual([
      "run-replay",
      "run-replay",
    ]);
    expect(page.lastSequence).toBe(3n);
    expect(page.hasMore).toBe(true);
    expect(await tableCounts(prisma)).toEqual(before);
    await expect(
      repository.readConversationEvents({
        organizationId: TEST_ORGANIZATION_ID,
        userId: SAME_ORGANIZATION_USER_ID,
        sessionId: first.session.id,
        afterSequence: 0n,
        limit: 5000,
      }),
    ).resolves.toEqual({ events: [], lastSequence: 0n, hasMore: false });
    expect(await tableCounts(prisma)).toEqual(before);
  });

  it("enforces every organization-composite conversation graph FK at the database boundary", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const own = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-fk-own",
        aguiRunId: "run-fk-own",
      }),
    );
    const other = await repository.authorizeExecution(
      firstRunInput({
        organizationId: OTHER_ORGANIZATION_ID,
        userId: OTHER_USER_ID,
        copilotThreadId: "thread-fk-other",
        aguiRunId: "run-fk-other",
      }),
    );
    const eventWithoutOutbox = await prisma.agentConversationEvent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: own.session.id,
        executionId: own.execution.id,
        externalEventId: "event-without-outbox",
        sequence: 101n,
        eventType: "system_notice",
        schemaVersion: 1,
        payload: { code: "notice", content: "notice" },
      },
    });

    const crossOrganizationWrites = [
      () =>
        prisma!.agentSessionTask.create({
          data: {
            organizationId: TEST_ORGANIZATION_ID,
            sessionId: other.session.id,
            assignedAgentVersionId: AGENT_VERSION_ID,
            objective: null,
            isRoot: false,
            status: "interpreting",
            idempotencyKey: "foreign-session-task",
          },
        }),
      () =>
        prisma!.agentContextEpoch.create({
          data: {
            organizationId: TEST_ORGANIZATION_ID,
            sessionId: other.session.id,
            epoch: 2,
          },
        }),
      () =>
        prisma!.agentPolicySnapshot.create({
          data: {
            organizationId: TEST_ORGANIZATION_ID,
            sessionId: other.session.id,
            agentVersionId: AGENT_VERSION_ID,
            authorityProfileVersionId: "authority-profile-v1",
            capabilityKeys: ["catalog.read"],
            policyHash: "foreign-session-policy",
          },
        }),
      () =>
        prisma!.agentExecution.create({
          data: directExecutionData({
            organizationId: TEST_ORGANIZATION_ID,
            sessionId: other.session.id,
            sessionTaskId: own.rootTask.id,
            policySnapshotId: own.policy.id,
            suffix: "foreign-session",
          }),
        }),
      () =>
        prisma!.agentExecution.create({
          data: directExecutionData({
            organizationId: TEST_ORGANIZATION_ID,
            sessionId: own.session.id,
            sessionTaskId: other.rootTask.id,
            policySnapshotId: own.policy.id,
            suffix: "foreign-task",
          }),
        }),
      () =>
        prisma!.agentConversationEvent.create({
          data: {
            organizationId: TEST_ORGANIZATION_ID,
            sessionId: other.session.id,
            executionId: null,
            externalEventId: "foreign-session-event",
            sequence: 100n,
            eventType: "system_notice",
            schemaVersion: 1,
            payload: { code: "notice", content: "notice" },
          },
        }),
      () =>
        prisma!.agentConversationEvent.create({
          data: {
            organizationId: TEST_ORGANIZATION_ID,
            sessionId: own.session.id,
            executionId: other.execution.id,
            externalEventId: "foreign-execution-event",
            sequence: 100n,
            eventType: "system_notice",
            schemaVersion: 1,
            payload: { code: "notice", content: "notice" },
          },
        }),
      () =>
        prisma!.agentConversationOutbox.create({
          data: {
            organizationId: OTHER_ORGANIZATION_ID,
            eventId: eventWithoutOutbox.id,
          },
        }),
      () =>
        prisma!.agentExecutionUsage.create({
          data: {
            organizationId: OTHER_ORGANIZATION_ID,
            executionId: own.execution.id,
            modelIdentity: own.execution.modelIdentity,
            provider: "openai",
            inputTokens: 1,
            outputTokens: 1,
            costMicros: 1n,
            currency: "USD",
          },
        }),
    ];

    for (const write of crossOrganizationWrites) {
      await expect(write()).rejects.toMatchObject({ code: "P2003" });
    }
  });

  it("rejects same-organization references across canonical sessions", async () => {
    if (!prisma) throw new Error("Prisma test client was not initialized");
    const own = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-same-org-fk-own",
        aguiRunId: "run-same-org-fk-own",
      }),
    );
    const other = await repository.authorizeExecution(
      firstRunInput({
        copilotThreadId: "thread-same-org-fk-other",
        aguiRunId: "run-same-org-fk-other",
      }),
    );

    const crossSessionWrites = [
      () =>
        prisma!.agentSessionTask.create({
          data: {
            organizationId: TEST_ORGANIZATION_ID,
            sessionId: own.session.id,
            parentTaskId: other.rootTask.id,
            assignedAgentVersionId: AGENT_VERSION_ID,
            objective: "must remain in one session",
            isRoot: false,
            status: "interpreting",
            idempotencyKey: "cross-session-parent",
          },
        }),
      () =>
        prisma!.agentExecution.create({
          data: directExecutionData({
            organizationId: TEST_ORGANIZATION_ID,
            sessionId: own.session.id,
            sessionTaskId: other.rootTask.id,
            policySnapshotId: own.policy.id,
            suffix: "same-org-foreign-task",
          }),
        }),
      () =>
        prisma!.agentExecution.create({
          data: directExecutionData({
            organizationId: TEST_ORGANIZATION_ID,
            sessionId: own.session.id,
            sessionTaskId: own.rootTask.id,
            policySnapshotId: other.policy.id,
            suffix: "same-org-foreign-policy",
          }),
        }),
      () =>
        prisma!.agentConversationEvent.create({
          data: {
            organizationId: TEST_ORGANIZATION_ID,
            sessionId: own.session.id,
            executionId: other.execution.id,
            externalEventId: "same-org-foreign-execution",
            sequence: 100n,
            eventType: "system_notice",
            schemaVersion: 1,
            payload: { code: "notice", content: "notice" },
          },
        }),
    ];

    for (const write of crossSessionWrites) {
      await expect(write()).rejects.toMatchObject({ code: "P2003" });
    }
  });
});

async function seedInteractionFixture(client: PrismaClient): Promise<void> {
  await client.user.create({
    data: {
      id: SAME_ORGANIZATION_USER_ID,
      email: "same-org-user@test.local",
      name: "Same Organization User",
      role: "member",
      type: "human",
      memberships: {
        create: {
          organizationId: TEST_ORGANIZATION_ID,
          role: "member",
          status: "active",
        },
      },
    },
  });
  await client.agentVersion.createMany({
    data: [
      {
        id: AGENT_VERSION_ID,
        agentDefinitionKey: "operator",
        version: 1,
        displayName: "Operator",
        description: "Synthetic operator version",
        runtimeType: "copilotkit_agui",
        modelIdentity: "gpt-5.4",
        capabilityKeys: ["catalog.read"],
        policyDocument: { authorityClass: "read_only" },
        activatedAt: new Date("2026-08-13T00:00:00.000Z"),
      },
      {
        id: OTHER_AGENT_VERSION_ID,
        agentDefinitionKey: "operator",
        version: 2,
        displayName: "Operator v2",
        description: "Synthetic second operator version",
        runtimeType: "copilotkit_agui",
        modelIdentity: "gpt-5.4",
        capabilityKeys: ["catalog.read"],
        policyDocument: { authorityClass: "read_only" },
        activatedAt: new Date("2026-08-13T00:00:00.000Z"),
        retiredAt: new Date("2026-08-13T00:30:00.000Z"),
      },
      {
        agentDefinitionKey: "inactive",
        version: 1,
        displayName: "Inactive",
        description: "Not activated",
        runtimeType: "ignored",
        modelIdentity: "ignored",
        capabilityKeys: [],
        policyDocument: {},
      },
      {
        agentDefinitionKey: "retired",
        version: 1,
        displayName: "Retired",
        description: "Retired row",
        runtimeType: "ignored",
        modelIdentity: "ignored",
        capabilityKeys: [],
        policyDocument: {},
        activatedAt: new Date("2026-08-13T00:00:00.000Z"),
        retiredAt: new Date("2026-08-13T01:00:00.000Z"),
      },
    ].map((version, index) => ({
      ...version,
      manifestHash: String(index + 1).repeat(64),
      runtimeManifest: {
        schemaVersion: 1,
        agentDefinitionKey: version.agentDefinitionKey,
        runtimeKind: "agent",
        runtimeType: version.runtimeType,
        modelIdentity: version.modelIdentity,
        capabilityKeys: version.capabilityKeys,
        policyDocument: version.policyDocument,
        delegation: {
          role: "leaf",
          allowedAgentDefinitionKeys: [],
          maxDepth: 0,
          maxChildrenPerTask: 0,
        },
        limits: {
          maxTurns: 20,
          maxContextTokens: 8_192,
          summaryTargetTokens: 512,
        },
        assets: {
          prompt: {
            path: "agent-config/prompts/agents/sourcing.md",
            sha256: "a".repeat(64),
          },
          summaryPrompt: {
            path: "agent-config/prompts/system/session-summary.md",
            sha256: "b".repeat(64),
          },
          skills: [],
          outputSchema: null,
        },
      },
    })),
  });
  const authorityProfilePolicyDocument = {
    authorityClass: "authority-profile-v1",
    capabilityKeys: ["catalog.read"],
  };
  await client.agentAuthorityProfileVersion.createMany({
    data: [TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID].map(
      (organizationId) => ({
        id: "authority-profile-v1",
        organizationId,
        profileKey: "authority-profile-v1",
        version: 1,
        capabilityKeys: ["catalog.read"],
        policyDocument: authorityProfilePolicyDocument,
        policyHash: hashCanonical(authorityProfilePolicyDocument),
      }),
    ),
  });
}

function firstRunInput(overrides: {
  organizationId?: string;
  userId?: string;
  copilotThreadId: string;
  aguiRunId: string;
  externalEventId?: string;
}) {
  const externalEventId =
    overrides.externalEventId ??
    `message-${overrides.copilotThreadId}-${overrides.aguiRunId}`;
  return {
    organizationId: overrides.organizationId ?? TEST_ORGANIZATION_ID,
    userId: overrides.userId ?? TEST_USER_ID,
    copilotThreadId: overrides.copilotThreadId,
    aguiRunId: overrides.aguiRunId,
    agentVersionId: AGENT_VERSION_ID,
    runtimeType: "copilotkit_agui",
    modelIdentity: "gpt-5.4",
    authorityProfileVersionId: "authority-profile-v1",
    authorityProfilePolicyDocument: {
      authorityClass: "authority-profile-v1",
      capabilityKeys: ["catalog.read"],
    },
    authorityProfilePolicyHash: hashCanonical({
      authorityClass: "authority-profile-v1",
      capabilityKeys: ["catalog.read"],
    }),
    capabilityKeys: ["catalog.read"],
    policyHash: "policy-hash-v1",
    inputHash: `input-hash-${overrides.copilotThreadId}-${overrides.aguiRunId}`,
    userEvent: {
      externalEventId,
      schemaVersion: 1 as const,
      payload: {
        phase: "complete",
        messageId: externalEventId,
        content: "재고 현황 알려줘",
      },
    },
  };
}

async function markDeleting(sessionId: string): Promise<void> {
  await prisma!.agentSession.update({
    where: { id: sessionId },
    data: { lifecycle: "deleting" },
  });
}

async function createAuthorizationSession(
  client: PrismaClient,
  input: ReturnType<typeof firstRunInput>,
): Promise<void> {
  const session = await client.agentSession.create({
    data: {
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      copilotThreadId: input.copilotThreadId,
      primaryAgentVersionId: input.agentVersionId,
      authorityProfileVersionId: input.authorityProfileVersionId,
      contextEpoch: 1,
      lifecycle: "active",
    },
  });
  await client.$transaction([
    client.agentSessionTask.create({
      data: {
        organizationId: input.organizationId,
        sessionId: session.id,
        assignedAgentVersionId: input.agentVersionId,
        objective: null,
        isRoot: true,
        status: "interpreting",
        idempotencyKey: "root",
      },
    }),
    client.agentContextEpoch.create({
      data: {
        organizationId: input.organizationId,
        sessionId: session.id,
        epoch: 1,
      },
    }),
  ]);
}

function settlesWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    }),
  ]);
}

function directExecutionData(input: {
  organizationId: string;
  sessionId: string;
  sessionTaskId: string;
  policySnapshotId: string;
  suffix: string;
}) {
  return {
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    sessionTaskId: input.sessionTaskId,
    copilotThreadId: `direct-thread-${input.suffix}`,
    aguiRunId: `direct-run-${input.suffix}`,
    agentVersionId: AGENT_VERSION_ID,
    runtimeType: "copilotkit_agui",
    modelIdentity: "gpt-5.4",
    policySnapshotId: input.policySnapshotId,
    inputHash: `direct-input-${input.suffix}`,
    status: "running",
  };
}

function authorizationLockKey(input: {
  organizationId: string;
  userId: string;
  copilotThreadId: string;
}): string {
  return JSON.stringify([
    "agent-interaction",
    "authorize-execution",
    input.organizationId,
    input.userId,
    input.copilotThreadId,
  ]);
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function tableCounts(client: PrismaClient) {
  const [
    sessions,
    tasks,
    epochs,
    policies,
    executions,
    events,
    outboxes,
    usages,
  ] = await Promise.all([
    client.agentSession.count(),
    client.agentSessionTask.count(),
    client.agentContextEpoch.count(),
    client.agentPolicySnapshot.count(),
    client.agentExecution.count(),
    client.agentConversationEvent.count(),
    client.agentConversationOutbox.count(),
    client.agentExecutionUsage.count(),
  ]);
  return {
    sessions,
    tasks,
    epochs,
    policies,
    executions,
    events,
    outboxes,
    usages,
  };
}

const _repositoryContract: typeof repository = repository!;
void _repositoryContract;
