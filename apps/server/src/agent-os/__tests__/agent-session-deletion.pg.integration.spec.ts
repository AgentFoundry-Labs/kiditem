import { createHash, randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from "@kiditem/shared/identifiers";
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from "../../test-helpers/real-prisma";
import { PrismaAgentExecutionQueryRepository } from "../adapter/out/repository/interaction/prisma-agent-execution-query.repository";
import { PrismaAgentSessionDeletionExecutionTransaction } from "../adapter/out/transaction/session-deletion/prisma-agent-session-deletion-execution.transaction";
import { PrismaAgentSessionDeletionFinalizationTransaction } from "../adapter/out/transaction/session-deletion/prisma-agent-session-deletion-finalization.transaction";
import { AgentSessionDeletionOperationHandler } from "../adapter/in/operation/agent-session-deletion.operation-handler";
import { AgentSessionDeletionExecutionService } from "../application/service/session-execution/agent-session-deletion-execution.service";
import { AgentSessionDeletionOperationService } from "../application/service/session-execution/agent-session-deletion-operation.service";
import { AgentAguiRuntimeRegistry } from "../application/service/agent-agui-runtime-registry.service";
import { AgentAguiInProcessRunRegistry } from "../application/service/agent-agui-in-process-run-registry.service";
import { AgentAguiRunService } from "../application/service/agent-agui-run.service";
import { OpenAiResponsesAguiRuntimeAdapter } from "../adapter/out/runtime/openai-responses-agui-runtime.adapter";
import { PrismaAguiRuntimeCleanupDependencies } from "../adapter/out/runtime/prisma-agui-runtime-cleanup-dependencies";
import { lockAgentSessionForDeletion } from "../adapter/out/transaction/session-control/internal/lock-writable-agent-session";
import type { PrismaClient } from "@prisma/client";
import { OperationRepositoryAdapter } from "../../operations/adapter/out/repository/operation.repository.adapter";
import { OperationAttemptExecutorService } from "../../operations/application/service/operation-attempt-executor.service";
import { CompositeOperationCoordinatorService } from "../../operations/application/service/composite-operation-coordinator.service";
import { OperationDispatcherService } from "../../operations/application/service/operation-dispatcher.service";
import { OperationHandlerRegistryService } from "../../operations/application/service/operation-handler-registry.service";
import { OperationLifecycleGateService } from "../../operations/application/service/operation-lifecycle-gate.service";
import { OperationRunWorkerService } from "../../operations/application/service/operation-run-worker.service";
import { AGENT_SESSION_DELETE_OPERATION } from "../domain/operation/agent-session-deletion.operations";

const VERSION_ID = "00000000-0000-4000-8000-000000000101";
const AUTHORITY_VERSION_ID = "00000000-0000-4000-8000-000000000102";
const DELETE_ATTEMPT_TOKEN = "00000000-0000-4000-8000-000000000103";

let prisma: PrismaClient | null = null;

beforeAll(async () => {
  prisma = makeTestPrisma();
  await prisma.$connect();
});

afterAll(async () => prisma?.$disconnect());

beforeEach(async () => {
  if (!prisma) throw new Error("Prisma test client was not initialized");
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  await seedSessionDependencies(prisma);
});

describe("AgentSession deletion graph finalization (PostgreSQL)", () => {
  it("records graph_deleted while deleting the graph in FK-safe task child-before-parent order", async () => {
    const fixture = await createFencedDeletionFixture();
    const execution = new PrismaAgentSessionDeletionExecutionTransaction(
      prisma as never,
    );
    const snapshot = await execution.loadFencedSnapshot(fixture.attempt);
    expect(snapshot).toMatchObject({ kind: "ready" });
    if (snapshot.kind !== "ready")
      throw new Error("expected fenced deletion snapshot");

    await execution.deleteGraphAndCheckpoint({
      ...fixture.attempt,
      fencedClosureDigest: snapshot.snapshot.closureDigest,
    });

    await expect(
      prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } }),
    ).resolves.toBeNull();
    await expect(
      Promise.all([
        prisma!.agentSessionTask.count({
          where: { sessionId: fixture.sessionId },
        }),
        prisma!.agentExecution.count({
          where: { sessionId: fixture.sessionId },
        }),
        prisma!.agentExecutionAttempt.count({
          where: { sessionId: fixture.sessionId },
        }),
        prisma!.agentConversationEvent.count({
          where: { sessionId: fixture.sessionId },
        }),
        prisma!.agentConversationOutbox.count({
          where: { event: { is: { sessionId: fixture.sessionId } } },
        }),
        prisma!.agentSessionApproval.count({
          where: { sessionId: fixture.sessionId },
        }),
        prisma!.agentSessionApprovalContinuation.count({
          where: { approval: { is: { sessionId: fixture.sessionId } } },
        }),
        prisma!.agentSessionArtifact.count({
          where: { sessionId: fixture.sessionId },
        }),
        prisma!.agentSessionArtifactMaterialization.count({
          where: { sessionId: fixture.sessionId },
        }),
        prisma!.agentExecutionUsage.count({
          where: { execution: { is: { sessionId: fixture.sessionId } } },
        }),
        prisma!.agentExecutionAttemptOperationBinding.count({
          where: { sessionId: fixture.sessionId },
        }),
        prisma!.agentSessionOperationRunOwnership.count({
          where: { sessionId: fixture.sessionId },
        }),
      ]),
    ).resolves.toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(
      prisma!.operationRunCheckpoint.findFirst({
        where: { operationRunId: fixture.deletionRunId, kind: "graph_deleted" },
        select: { state: true },
      }),
    ).resolves.toMatchObject({
      state: {
        sessionId: fixture.sessionId,
        retryGeneration: 1,
        closureDigest: snapshot.snapshot.closureDigest,
      },
    });
  });

  it("purges graph_deleted lineage after a crash without recreating the session", async () => {
    const fixture = await createFencedDeletionFixture();
    const execution = new PrismaAgentSessionDeletionExecutionTransaction(
      prisma as never,
    );
    const snapshot = await execution.loadFencedSnapshot(fixture.attempt);
    if (snapshot.kind !== "ready")
      throw new Error("expected fenced deletion snapshot");
    await execution.deleteGraphAndCheckpoint({
      ...fixture.attempt,
      fencedClosureDigest: snapshot.snapshot.closureDigest,
    });

    const finalization = new PrismaAgentSessionDeletionFinalizationTransaction(
      prisma as never,
    );
    await finalization.purgeGraphDeletedLineage({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      currentOperationRunId: fixture.deletionRunId,
      expectedAttemptToken: DELETE_ATTEMPT_TOKEN,
    });

    await expect(
      Promise.all([
        prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } }),
        prisma!.agentSessionDeletionOperationBinding.count({
          where: { sessionId: fixture.sessionId },
        }),
        prisma!.operationRun.findUnique({
          where: { id: fixture.deletionRunId },
        }),
      ]),
    ).resolves.toEqual([null, 0, null]);
  });

  it("preserves succeeded owned and artifact runs through terminalization, graph checkpoint, and purge", async () => {
    const fixture = await createFencedDeletionFixture();
    const execution = new PrismaAgentSessionDeletionExecutionTransaction(
      prisma as never,
    );
    await prisma!.operationRun.updateMany({
      where: { id: { in: [fixture.ownedRunId, fixture.artifactRunId] } },
      data: { status: "succeeded", finishedAt: new Date() },
    });

    await execution.terminalizeOwnedRun({
      ...fixture.attempt,
      ownedOperationRunId: fixture.artifactRunId,
    });
    await expect(
      prisma!.operationRun.findUniqueOrThrow({
        where: { id: fixture.artifactRunId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "succeeded" });

    const snapshot = await execution.loadFencedSnapshot(fixture.attempt);
    if (snapshot.kind !== "ready")
      throw new Error("expected fenced deletion snapshot");
    await execution.deleteGraphAndCheckpoint({
      ...fixture.attempt,
      fencedClosureDigest: snapshot.snapshot.closureDigest,
    });
    await new PrismaAgentSessionDeletionFinalizationTransaction(
      prisma as never,
    ).purgeGraphDeletedLineage({
      signal: fixture.attempt.signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      currentOperationRunId: fixture.deletionRunId,
      expectedAttemptToken: DELETE_ATTEMPT_TOKEN,
    });
    await expect(
      Promise.all([
        prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } }),
        prisma!.operationRun.findMany({
          where: {
            id: {
              in: [
                fixture.deletionRunId,
                fixture.ownedRunId,
                fixture.artifactRunId,
              ],
            },
          },
        }),
      ]),
    ).resolves.toEqual([null, []]);
  });

  it("sums attempts across a predecessor and current deletion run in one retry generation", async () => {
    const fixture = await createFencedDeletionFixture();
    const predecessor = await prisma!.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: "agent-os.delete-session",
        definitionVersion: 1,
        ownerDomain: "agent-os",
        title: "Delete session predecessor",
        engineType: "agent_os",
        resourceClass: "default",
        executionTimeoutMs: 1,
        status: "cancelled",
        triggerSource: "system",
        input: {},
        attempts: 1,
        maxAttempts: 5,
      },
    });
    await prisma!.$transaction([
      prisma!.agentSessionDeletionOperationBinding.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          sessionId: fixture.sessionId,
          sessionCreatorUserId: TEST_USER_ID,
          deletionRequestedByUserId: TEST_USER_ID,
          retryGeneration: 1,
          operationRunId: predecessor.id,
        },
      }),
      prisma!.agentSessionDeletionOperationBinding.update({
        where: {
          operationRunId_organizationId: {
            operationRunId: fixture.deletionRunId,
            organizationId: TEST_ORGANIZATION_ID,
          },
        },
        data: { predecessorOperationRunId: predecessor.id },
      }),
    ]);

    await expect(
      new PrismaAgentSessionDeletionExecutionTransaction(
        prisma as never,
      ).loadFencedSnapshot(fixture.attempt),
    ).resolves.toMatchObject({
      kind: "ready",
      snapshot: { consumedAttempts: 2 },
    });
  });

  it("reconciles a lost graph commit acknowledgement and purges in the same lifecycle", async () => {
    const fixture = await createFencedDeletionFixture();
    const transactions = new PrismaAgentSessionDeletionExecutionTransaction(
      prisma as never,
    );
    const finalization = new PrismaAgentSessionDeletionFinalizationTransaction(
      prisma as never,
    );
    let reconciliationReads = 0;
    const service = new AgentSessionDeletionExecutionService(
      {
        loadFencedSnapshot: transactions.loadFencedSnapshot.bind(transactions),
        terminalizeOwnedRun:
          transactions.terminalizeOwnedRun.bind(transactions),
        deleteGraphAndCheckpoint: async (input) => {
          await transactions.deleteGraphAndCheckpoint(input);
          throw new Error("commit_ack_lost");
        },
        hasGraphDeletedCheckpoint: async (input) => {
          reconciliationReads += 1;
          if (reconciliationReads === 1)
            throw new Error("transient_checkpoint_read");
          return transactions.hasGraphDeletedCheckpoint(input);
        },
      } as never,
      {
        fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { cleanup: vi.fn() } as never,
      {
        beginFence: vi.fn().mockResolvedValue(undefined),
        confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      {
        abortEraseAndConfirm: vi.fn().mockResolvedValue({ state: "erased" }),
      } as never,
    );

    await expect(
      service.execute({
        ...fixture.attempt,
        fallbackConsumedAttempts: 1,
        enterEphemeralFinalization: vi
          .fn()
          .mockResolvedValue({ signal: fixture.attempt.signal }),
      }),
    ).resolves.toEqual({ kind: "completed" });
    expect(reconciliationReads).toBe(2);

    await finalization.purgeGraphDeletedLineage({
      signal: fixture.attempt.signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      currentOperationRunId: fixture.deletionRunId,
      expectedAttemptToken: DELETE_ATTEMPT_TOKEN,
    });
    await expect(
      Promise.all([
        prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } }),
        prisma!.agentSessionDeletionOperationBinding.count({
          where: { sessionId: fixture.sessionId },
        }),
        prisma!.operationRun.findUnique({
          where: { id: fixture.deletionRunId },
        }),
      ]),
    ).resolves.toEqual([null, 0, null]);
  });

  it("keeps graph contraction behind persisted AG-UI revocation and the exact in-process stop", async () => {
    const fixture = await createFencedDeletionFixture();
    const agui = await createRunningAguiAttempt(prisma!, fixture.sessionId);
    const abortObserved = deferred<void>();
    const releaseRuntime = deferred<void>();
    const activeRuns = new AgentAguiInProcessRunRegistry();
    const responses = {
      decide: vi.fn(({ signal }: { signal: AbortSignal }) => {
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              abortObserved.resolve();
              void releaseRuntime.promise.then(() => {
                const error = new Error("runtime_cancelled");
                error.name = "AbortError";
                reject(error);
              });
            },
            { once: true },
          );
        });
      }),
    };
    const runtime = new OpenAiResponsesAguiRuntimeAdapter(
      new AgentAguiRuntimeRegistry(),
      responses as never,
      new PrismaAguiRuntimeCleanupDependencies(prisma as never, activeRuns),
      undefined,
      activeRuns,
    );
    const stream = runtime
      .run({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        sessionId: fixture.sessionId,
        sessionTaskId: agui.taskId,
        executionId: agui.executionId,
        attemptId: agui.attemptId,
        startIntentId: agui.startIntentId,
        runtimeCredentialGeneration: 0,
        copilotThreadId: agui.copilotThreadId,
        aguiRunId: agui.aguiRunId,
        agentDefinitionKey: "deletion-test-agent",
        runtimeType: "copilotkit_agui",
        modelIdentity: "test-model",
        capabilityKeys: [],
        messages: [],
        dashboardContext: {},
        invokeCapability: vi.fn(),
        recordUsage: vi.fn(),
      })
      [Symbol.asyncIterator]();
    await stream.next();
    const runningStep = stream.next().catch(() => undefined);
    await vi.waitFor(() => expect(responses.decide).toHaveBeenCalledOnce());

    const transactions = new PrismaAgentSessionDeletionExecutionTransaction(
      prisma as never,
    );
    const snapshot = await transactions.loadFencedSnapshot(fixture.attempt);
    expect(snapshot).toMatchObject({
      kind: "ready",
      snapshot: {
        runtimeAttempts: expect.arrayContaining([
          expect.objectContaining({
            executionId: agui.executionId,
            attemptId: agui.attemptId,
            startIntentId: agui.startIntentId,
            runtimeType: "copilotkit_agui",
            state: "started",
          }),
        ]),
      },
    });

    const graph = vi.fn(
      transactions.deleteGraphAndCheckpoint.bind(transactions),
    );
    const service = new AgentSessionDeletionExecutionService(
      {
        loadFencedSnapshot: transactions.loadFencedSnapshot.bind(transactions),
        terminalizeOwnedRun:
          transactions.terminalizeOwnedRun.bind(transactions),
        deleteGraphAndCheckpoint: graph,
        hasGraphDeletedCheckpoint:
          transactions.hasGraphDeletedCheckpoint.bind(transactions),
      } as never,
      {
        fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { cleanup: runtime.cleanup.bind(runtime) } as never,
      {
        beginFence: vi.fn().mockResolvedValue(undefined),
        confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      {
        abortEraseAndConfirm: vi.fn().mockResolvedValue({ state: "erased" }),
        deleteActiveAndConfirm: vi.fn().mockResolvedValue({ state: "erased" }),
      } as never,
    );
    const deletion = service.execute({
      ...fixture.attempt,
      fallbackConsumedAttempts: 1,
      enterEphemeralFinalization: vi
        .fn()
        .mockResolvedValue({ signal: fixture.attempt.signal }),
    });

    await abortObserved.promise;
    await vi.waitFor(async () => {
      await expect(
        prisma!.agentExecutionAttempt.findUniqueOrThrow({
          where: { id: agui.attemptId },
          select: { state: true, runtimeCredentialGeneration: true },
        }),
      ).resolves.toEqual({
        state: "cancelled",
        runtimeCredentialGeneration: 1,
      });
    });
    await expect(
      prisma!.agentExecution.findUniqueOrThrow({
        where: { id: agui.executionId },
        select: { status: true, errorCode: true },
      }),
    ).resolves.toEqual({
      status: "cancelled",
      errorCode: "agent_session_deleting",
    });
    expect(graph).not.toHaveBeenCalled();
    await expect(
      prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } }),
    ).resolves.toEqual(expect.any(Object));

    releaseRuntime.resolve();
    await runningStep;
    await expect(deletion).resolves.toEqual({ kind: "completed" });
    expect(graph).toHaveBeenCalledOnce();
    await expect(
      prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } }),
    ).resolves.toBeNull();
  });

  it("seals a loaded AG-UI context that resumes after deletion before runtime registration", async () => {
    const fixture = await createFencedDeletionFixture();
    const agui = await createRunningAguiAttempt(prisma!, fixture.sessionId);
    const message = await createAguiUserMessage(prisma!, fixture.sessionId, agui);
    await prisma!.agentSession.update({
      where: { id: fixture.sessionId },
      data: { lifecycle: "active", deletionOperationRunId: null },
    });

    const contextStalled = deferred<void>();
    const resumeStaleRequest = deferred<void>();
    const executionQueries = new PrismaAgentExecutionQueryRepository(
      prisma as never,
    );
    const activeRuns = new AgentAguiInProcessRunRegistry();
    const responses = { decide: vi.fn() };
    const runtimeRegistry = new AgentAguiRuntimeRegistry();
    const runtime = new OpenAiResponsesAguiRuntimeAdapter(
      runtimeRegistry,
      responses as never,
      new PrismaAguiRuntimeCleanupDependencies(prisma as never, activeRuns),
      undefined,
      activeRuns,
    );
    runtime.onModuleInit();
    const invokeCapability = vi.fn();
    const application = new AgentAguiRunService(
      {
        loadExecutionRuntimeContext:
          executionQueries.loadExecutionRuntimeContext.bind(executionQueries),
        findCurrentExecution:
          executionQueries.findCurrentExecution.bind(executionQueries),
      } as never,
      {
        readModelConversation: async () => {
          contextStalled.resolve();
          await resumeStaleRequest.promise;
          return { events: [message], hasMore: false };
        },
      } as never,
      {
        appendExecutionEvent: vi.fn(async (input) => ({
          id: input.externalEventId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          sequence: 1n,
        })),
      } as never,
      { recordExecutionUsage: vi.fn() } as never,
      { publish: vi.fn() } as never,
      runtimeRegistry,
      { invoke: invokeCapability } as never,
    );
    const stale = application
      .run(aguiRunRequest(fixture.sessionId, agui, message))
      [Symbol.asyncIterator]();
    const staleResult = stale.next();
    await contextStalled.promise;

    await prisma!.agentSession.update({
      where: { id: fixture.sessionId },
      data: {
        lifecycle: "deleting",
        deletionOperationRunId: fixture.deletionRunId,
      },
    });
    const transactions = new PrismaAgentSessionDeletionExecutionTransaction(
      prisma as never,
    );
    const deletion = new AgentSessionDeletionExecutionService(
      {
        loadFencedSnapshot: transactions.loadFencedSnapshot.bind(transactions),
        terminalizeOwnedRun:
          transactions.terminalizeOwnedRun.bind(transactions),
        deleteGraphAndCheckpoint:
          transactions.deleteGraphAndCheckpoint.bind(transactions),
        hasGraphDeletedCheckpoint:
          transactions.hasGraphDeletedCheckpoint.bind(transactions),
      } as never,
      { fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }) } as never,
      { cleanup: runtime.cleanup.bind(runtime) } as never,
      {
        beginFence: vi.fn().mockResolvedValue(undefined),
        confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      {
        abortEraseAndConfirm: vi.fn().mockResolvedValue({ state: "erased" }),
        deleteActiveAndConfirm: vi.fn().mockResolvedValue({ state: "erased" }),
      } as never,
    );

    await expect(
      deletion.execute({
        ...fixture.attempt,
        enterEphemeralFinalization: vi
          .fn()
          .mockResolvedValue({ signal: fixture.attempt.signal }),
      }),
    ).resolves.toEqual({ kind: "completed" });
    await expect(
      prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } }),
    ).resolves.toBeNull();

    resumeStaleRequest.resolve();
    await expect(staleResult).resolves.toMatchObject({
      value: { type: "RUN_ERROR" },
      done: false,
    });
    expect(responses.decide).not.toHaveBeenCalled();
    expect(invokeCapability).not.toHaveBeenCalled();
    expect(
      (activeRuns as unknown as { active: Map<string, unknown> }).active.size,
    ).toBe(0);
    await expect(
      Promise.all([
        prisma!.agentSession.count({ where: { id: fixture.sessionId } }),
        prisma!.agentExecution.count({ where: { id: agui.executionId } }),
        prisma!.agentExecutionAttempt.count({ where: { id: agui.attemptId } }),
        prisma!.agentConversationEvent.count({
          where: { sessionId: fixture.sessionId },
        }),
      ]),
    ).resolves.toEqual([0, 0, 0, 0]);
    await expect(
      activeRuns.stopAndInspect(
        {
          organizationId: TEST_ORGANIZATION_ID,
          sessionId: fixture.sessionId,
          executionId: agui.executionId,
          attemptId: agui.attemptId,
          startIntentId: agui.startIntentId,
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ status: "cancelled" });
  });

  it("treats a recreated process with no local AG-UI run as clean only after exact persisted invalidation", async () => {
    const fixture = await createFencedDeletionFixture();
    const agui = await createRunningAguiAttempt(prisma!, fixture.sessionId);
    const runtime = new OpenAiResponsesAguiRuntimeAdapter(
      new AgentAguiRuntimeRegistry(),
      { decide: vi.fn() } as never,
      new PrismaAguiRuntimeCleanupDependencies(
        prisma as never,
        new AgentAguiInProcessRunRegistry(),
      ),
    );

    await expect(
      runtime.cleanup({
        signal: fixture.attempt.signal,
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        deletionOperationRunId: fixture.deletionRunId,
        deletionAttemptToken: fixture.attempt.attemptToken,
        runtimeType: "copilotkit_agui",
        executionId: agui.executionId,
        attemptId: agui.attemptId,
        startIntentId: agui.startIntentId,
        handle: null,
      }),
    ).resolves.toMatchObject({
      state: "clean",
      executionAuthority: "irrevocably_revoked",
      credentials: "irrevocably_revoked",
    });
    await expect(
      Promise.all([
        prisma!.agentExecutionAttempt.findUniqueOrThrow({
          where: { id: agui.attemptId },
          select: { state: true, runtimeCredentialGeneration: true },
        }),
        prisma!.agentExecution.findUniqueOrThrow({
          where: { id: agui.executionId },
          select: { status: true, errorCode: true },
        }),
      ]),
    ).resolves.toEqual([
      { state: "cancelled", runtimeCredentialGeneration: 1 },
      { status: "cancelled", errorCode: "agent_session_deleting" },
    ]);
  });

  it("rejects AG-UI cleanup against an active session without changing its runtime authority", async () => {
    const fixture = await createFencedDeletionFixture();
    const agui = await createRunningAguiAttempt(prisma!, fixture.sessionId);
    await prisma!.agentSession.update({
      where: { id: fixture.sessionId },
      data: { lifecycle: "active", deletionOperationRunId: null },
    });
    const runtime = aguiCleanupRuntime();

    await expect(
      runtime.cleanup(
        aguiCleanupInput(
          fixture.sessionId,
          fixture.deletionRunId,
          agui,
          fixture.attempt.signal,
        ),
      ),
    ).resolves.toEqual({ state: "unknown", code: "RUNTIME_CLEANUP_UNKNOWN" });
    await expect(
      Promise.all([
        prisma!.agentExecutionAttempt.findUniqueOrThrow({
          where: { id: agui.attemptId },
          select: { state: true, runtimeCredentialGeneration: true },
        }),
        prisma!.agentExecution.findUniqueOrThrow({
          where: { id: agui.executionId },
          select: { status: true },
        }),
      ]),
    ).resolves.toEqual([
      { state: "running", runtimeCredentialGeneration: 0 },
      { status: "running" },
    ]);
  });

  it("rejects a cross-session AG-UI cleanup coordinate without changing the owned attempt", async () => {
    const fixture = await createFencedDeletionFixture();
    const agui = await createRunningAguiAttempt(prisma!, fixture.sessionId);
    const runtime = aguiCleanupRuntime();

    await expect(
      runtime.cleanup({
        ...aguiCleanupInput(
          fixture.sessionId,
          fixture.deletionRunId,
          agui,
          fixture.attempt.signal,
        ),
        sessionId: "00000000-0000-4000-8000-000000000999",
      }),
    ).resolves.toEqual({ state: "unknown", code: "RUNTIME_CLEANUP_UNKNOWN" });
    await expect(
      prisma!.agentExecutionAttempt.findUniqueOrThrow({
        where: { id: agui.attemptId },
        select: { state: true, runtimeCredentialGeneration: true },
      }),
    ).resolves.toEqual({ state: "running", runtimeCredentialGeneration: 0 });
  });

  it("does not reuse a pre-lock AG-UI attempt read after concurrent terminal authority changes", async () => {
    const fixture = await createFencedDeletionFixture();
    const agui = await createRunningAguiAttempt(prisma!, fixture.sessionId);
    const rotatedStartIntentId = randomUUID();
    const releaseHolder = deferred<void>();
    const holderReady = deferred<void>();
    const holder = prisma!.$transaction(async (tx) => {
      await lockAgentSessionForDeletion(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
      });
      await tx.agentExecutionAttempt.update({
        where: { id: agui.attemptId },
        data: { runtimeStartIntentId: rotatedStartIntentId },
      });
      holderReady.resolve();
      await releaseHolder.promise;
    });
    await holderReady.promise;
    const runtime = aguiCleanupRuntime();
    const cleanup = runtime.cleanup(
      aguiCleanupInput(
        fixture.sessionId,
        fixture.deletionRunId,
        agui,
        fixture.attempt.signal,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseHolder.resolve();
    await holder;

    await expect(cleanup).resolves.toEqual({
      state: "unknown",
      code: "RUNTIME_CLEANUP_UNKNOWN",
    });
    await expect(
      prisma!.agentExecutionAttempt.findUniqueOrThrow({
        where: { id: agui.attemptId },
        select: { runtimeStartIntentId: true, state: true },
      }),
    ).resolves.toEqual({
      runtimeStartIntentId: rotatedStartIntentId,
      state: "running",
    });
  });

  it("marks the canonical session delete_failed with only an allowlisted exhaustion code", async () => {
    const fixture = await createFencedDeletionFixture();
    const transactions = new PrismaAgentSessionDeletionExecutionTransaction(
      prisma as never,
    );

    await transactions.markDeleteFailed({
      ...fixture.attempt,
      failureCode: "STORAGE_DELETE_UNKNOWN",
    });

    await expect(
      Promise.all([
        prisma!.agentSession.findUniqueOrThrow({
          where: { id: fixture.sessionId },
          select: { lifecycle: true, deletionFailureCode: true },
        }),
        prisma!.operationRun.findUniqueOrThrow({
          where: { id: fixture.deletionRunId },
          select: { status: true, errorCode: true },
        }),
      ]),
    ).resolves.toEqual([
      {
        lifecycle: "delete_failed",
        deletionFailureCode: "STORAGE_DELETE_UNKNOWN",
      },
      { status: "failed", errorCode: "STORAGE_DELETE_UNKNOWN" },
    ]);
  });

  it("exhausts five registered worker attempts when fenced snapshot loading repeatedly faults", async () => {
    const fixture = await createFencedDeletionFixture();
    const executionTransactions = new PrismaAgentSessionDeletionExecutionTransaction(
      prisma as never,
    );
    const finalizationTransactions = new PrismaAgentSessionDeletionFinalizationTransaction(
      prisma as never,
    );
    const snapshotFailure = vi
      .fn()
      .mockRejectedValue(new Error("snapshot_read_fault"));
    const execution = new AgentSessionDeletionExecutionService(
      {
        loadFencedSnapshot: snapshotFailure,
        markDeleteFailed: executionTransactions.markDeleteFailed.bind(executionTransactions),
      } as never,
      { fenceAndCancel: vi.fn() } as never,
      { cleanup: vi.fn() } as never,
      { beginFence: vi.fn(), confirmFenced: vi.fn() } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );
    const registry = new OperationHandlerRegistryService();
    const deletion = new AgentSessionDeletionOperationService(
      execution,
      executionTransactions,
      finalizationTransactions,
    );
    const handler = new AgentSessionDeletionOperationHandler(deletion, registry);
    handler.onModuleInit();
    const repository = new OperationRepositoryAdapter(prisma as never);
    const gate = new OperationLifecycleGateService();
    gate.open();
    const coordinator = new CompositeOperationCoordinatorService(
      registry,
      repository,
      gate,
    );
    const worker = new OperationRunWorkerService(
      new OperationAttemptExecutorService(
        new OperationDispatcherService(registry, repository, coordinator),
        repository,
        registry,
      ),
      repository,
      coordinator,
      gate,
    );
    await prisma!.operationRun.update({
      where: { id: fixture.deletionRunId },
      data: {
        status: "queued",
        attempts: 0,
        executionTimeoutMs: 60_000,
        attemptToken: null,
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
        deadlineAt: null,
        scheduledFor: new Date(Date.now() - 1_000),
        input: {
          session: formatAgentSessionName(
            TEST_ORGANIZATION_ID,
            fixture.sessionId,
          ),
          retryGeneration: 1,
        },
      },
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await worker.tick();
      await worker.drainUntil(Date.now() + 5_000, true);
      const run = await prisma!.operationRun.findUniqueOrThrow({
        where: { id: fixture.deletionRunId },
        select: { status: true, attempts: true, deadlineAt: true },
      });
      if (attempt < 5) {
        expect(run).toEqual({
          status: "queued",
          attempts: attempt,
          deadlineAt: null,
        });
        await prisma!.operationRun.update({
          where: { id: fixture.deletionRunId },
          data: { scheduledFor: new Date(Date.now() - 1_000) },
        });
      } else {
        expect(run).toMatchObject({
          status: "failed",
          attempts: 5,
        });
      }
    }
    expect(snapshotFailure).toHaveBeenCalledTimes(5);
    await expect(
      prisma!.agentSession.findUniqueOrThrow({
        where: { id: fixture.sessionId },
        select: { lifecycle: true, deletionFailureCode: true },
      }),
    ).resolves.toEqual({
      lifecycle: "delete_failed",
      deletionFailureCode: "SESSION_DELETION_INVARIANT",
    });
    expect(registry.getDefinition(AGENT_SESSION_DELETE_OPERATION.key)).toEqual(
      expect.objectContaining({ successPersistence: "ephemeral_on_success" }),
    );
  });

  it("never creates a sixth cumulative attempt across lifecycle successors", async () => {
    const fixture = await createFencedDeletionFixture();
    const finalization = new PrismaAgentSessionDeletionFinalizationTransaction(
      prisma as never,
    );
    await prisma!.operationRun.update({
      where: { id: fixture.deletionRunId },
      data: {
        status: "cancelled",
        attempts: 1,
        errorCode: "operation_server_lifecycle_expired",
        finishedAt: new Date(),
        attemptToken: null,
      },
    });

    for (let restart = 0; restart < 4; restart += 1) {
      const [candidate] = await finalization.listInterruptedDeletions({
        limit: 100,
      });
      expect(candidate).toMatchObject({
        sessionId: fixture.sessionId,
        consumedAttempts: restart + 1,
      });
      await expect(
        finalization.continueInterruptedDeletion(candidate!),
      ).resolves.toBe("continued");
      const session = await prisma!.agentSession.findUniqueOrThrow({
        where: { id: fixture.sessionId },
        select: { deletionOperationRunId: true },
      });
      await prisma!.operationRun.update({
        where: { id: session.deletionOperationRunId! },
        data: {
          status: "cancelled",
          attempts: 1,
          errorCode: "operation_server_lifecycle_expired",
          finishedAt: new Date(),
          attemptToken: null,
        },
      });
    }
    const [exhausted] = await finalization.listInterruptedDeletions({
      limit: 100,
    });
    expect(exhausted).toMatchObject({
      sessionId: fixture.sessionId,
      consumedAttempts: 5,
    });
    await expect(
      finalization.continueInterruptedDeletion(exhausted!),
    ).resolves.toBe("failed");
    await expect(
      prisma!.agentSession.findUniqueOrThrow({
        where: { id: fixture.sessionId },
        select: { lifecycle: true },
      }),
    ).resolves.toEqual({ lifecycle: "delete_failed" });
  });

  it("fails closed for a scheduled cross-owner operation and preserves unrelated data", async () => {
    const fixture = await createFencedDeletionFixture();
    const schedule = await prisma!.operationSchedule.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: "agent-os.cross-owner",
        cronExpression: "* * * * *",
        input: {},
      },
    });
    const unrelated = await prisma!.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: "unrelated",
        definitionVersion: 1,
        ownerDomain: "test",
        title: "unrelated",
        engineType: "agent_os",
        resourceClass: "default",
        executionTimeoutMs: 1,
        status: "succeeded",
        triggerSource: "system",
        input: {},
      },
    });
    await prisma!.operationRun.update({
      where: { id: fixture.ownedRunId },
      data: { scheduleId: schedule.id },
    });
    const transactions = new PrismaAgentSessionDeletionExecutionTransaction(
      prisma as never,
    );

    await expect(
      transactions.loadFencedSnapshot(fixture.attempt),
    ).resolves.toMatchObject({
      kind: "retryable",
      code: "SESSION_OPERATION_OWNERSHIP_INVALID",
    });
    await expect(
      Promise.all([
        prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } }),
        prisma!.operationRun.findUnique({ where: { id: unrelated.id } }),
      ]),
    ).resolves.toEqual([expect.any(Object), expect.any(Object)]);
  });
});

async function seedSessionDependencies(client: PrismaClient): Promise<void> {
  await client.agentVersion.create({
    data: {
      id: VERSION_ID,
      agentDefinitionKey: "deletion-test-agent",
      version: 1,
      displayName: "Deletion test agent",
      description: "Deletion test agent",
      runtimeType: "codex_cli",
      modelIdentity: "test-model",
      capabilityKeys: [],
      policyDocument: {},
      manifestHash: "a".repeat(64),
      runtimeManifest: {
        schemaVersion: 1,
        agentDefinitionKey: "deletion-test-agent",
        runtimeKind: "agent",
        runtimeType: "codex_cli",
        modelIdentity: "test-model",
        capabilityKeys: [],
        policyDocument: {},
        delegation: {
          role: "leaf",
          allowedAgentDefinitionKeys: [],
          maxDepth: 0,
          maxChildrenPerTask: 0,
        },
        limits: { maxTurns: 1, maxContextTokens: 1, summaryTargetTokens: 1 },
        assets: {
          prompt: { path: "test", sha256: "b".repeat(64) },
          summaryPrompt: { path: "test", sha256: "c".repeat(64) },
          skills: [],
          outputSchema: null,
        },
      },
      activatedAt: new Date(),
    },
  });
  await client.agentAuthorityProfileVersion.create({
    data: {
      id: AUTHORITY_VERSION_ID,
      organizationId: TEST_ORGANIZATION_ID,
      profileKey: "deletion-test",
      version: 1,
      capabilityKeys: [],
      policyDocument: {},
      policyHash: "d".repeat(64),
    },
  });
}

async function createFencedDeletionFixture(): Promise<{
  sessionId: string;
  deletionRunId: string;
  ownedRunId: string;
  artifactRunId: string;
  attempt: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    operationRunId: string;
    attemptToken: string;
  };
}> {
  const client = prisma!;
  const session = await client.agentSession.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      createdByUserId: TEST_USER_ID,
      copilotThreadId: `deletion-${randomUUID()}`,
      primaryAgentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_VERSION_ID,
      lifecycle: "active",
    },
  });
  const root = await client.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      assignedAgentVersionId: VERSION_ID,
      isRoot: true,
      status: "completed",
      idempotencyKey: "root",
    },
  });
  const child = await client.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      parentTaskId: root.id,
      assignedAgentVersionId: VERSION_ID,
      status: "completed",
      idempotencyKey: "child",
    },
  });
  const grandchild = await client.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      parentTaskId: child.id,
      assignedAgentVersionId: VERSION_ID,
      status: "completed",
      idempotencyKey: "grandchild",
    },
  });
  await client.agentSessionTaskDelegation.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      parentTaskId: root.id,
      childTaskId: child.id,
      fromAgentVersionId: VERSION_ID,
      toAgentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_VERSION_ID,
      authoritySubset: {},
      depth: 1,
      idempotencyKey: "root-child",
      state: "completed",
    },
  });
  await client.agentSessionTaskDelegation.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      parentTaskId: child.id,
      childTaskId: grandchild.id,
      fromAgentVersionId: VERSION_ID,
      toAgentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_VERSION_ID,
      authoritySubset: {},
      depth: 2,
      idempotencyKey: "child-grandchild",
      state: "completed",
    },
  });
  const policy = await client.agentPolicySnapshot.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      agentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_VERSION_ID,
      capabilityKeys: [],
      policyHash: "e".repeat(64),
    },
  });
  const execution = await client.agentExecution.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      sessionTaskId: grandchild.id,
      copilotThreadId: session.copilotThreadId,
      aguiRunId: `run-${randomUUID()}`,
      agentVersionId: VERSION_ID,
      runtimeType: "codex_cli",
      modelIdentity: "test-model",
      policySnapshotId: policy.id,
      inputHash: createHash("sha256").update(session.id).digest("hex"),
      currentInput: {},
      resourceRefs: [],
      status: "completed",
    },
  });
  const attempt = await client.agentExecutionAttempt.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      executionId: execution.id,
      attemptNumber: 1,
      idempotencyKey: "attempt",
      runtimeType: "codex_cli",
      state: "succeeded",
    },
  });
  await client.agentExecutionUsage.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      executionId: execution.id,
      modelIdentity: "test-model",
      provider: "test",
      inputTokens: 1,
      outputTokens: 1,
      costMicros: 1n,
    },
  });
  const ownedRun = await createTerminalRun(client, session.id, "owned");
  const artifactRun = await createTerminalRun(client, session.id, "artifact");
  await client.agentExecutionAttemptOperationBinding.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      executionAttemptId: attempt.id,
      executionId: execution.id,
      sessionId: session.id,
      operationRunId: ownedRun.id,
      continuationKey: "initial",
    },
  });
  const approval = await client.agentSessionApproval.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      taskId: grandchild.id,
      executionId: execution.id,
      attemptId: attempt.id,
      operationBindingId: (
        await client.agentExecutionAttemptOperationBinding.findFirstOrThrow({
          where: { operationRunId: ownedRun.id },
          select: { id: true },
        })
      ).id,
      predecessorOperationRunId: ownedRun.id,
      capabilityKey: "test.capability",
      argumentsHash: "1".repeat(64),
      resourceSnapshot: {},
      state: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      idempotencyKey: "approval",
    },
  });
  await client.agentSessionApprovalContinuation.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      approvalId: approval.id,
      state: "pending",
    },
  });
  const artifact = await client.agentSessionArtifact.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      taskId: grandchild.id,
      executionId: execution.id,
      artifactType: "test",
      materializationOperationRunId: artifactRun.id,
      sha256: "f".repeat(64),
      lifecycle: "materializing",
      idempotencyKey: "artifact",
    },
  });
  await client.agentSessionArtifactMaterialization.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      artifactId: artifact.id,
      materializationOperationRunId: artifactRun.id,
      providerUploadId: "upload",
    },
  });
  const event = await client.agentConversationEvent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      executionId: execution.id,
      externalEventId: `event-${randomUUID()}`,
      sequence: 1n,
      eventType: "test",
      schemaVersion: 1,
      payload: {},
    },
  });
  await client.agentConversationOutbox.create({
    data: { organizationId: TEST_ORGANIZATION_ID, eventId: event.id },
  });
  const deletionRun = await client.operationRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: "agent-os.delete-session",
      definitionVersion: 1,
      ownerDomain: "agent-os",
      title: "Delete session",
      engineType: "agent_os",
      resourceClass: "default",
      executionTimeoutMs: 1,
      status: "running",
      triggerSource: "system",
      requestedByUserId: TEST_USER_ID,
      input: {},
      attempts: 1,
      maxAttempts: 5,
      attemptToken: DELETE_ATTEMPT_TOKEN,
    },
  });
  await client.agentSessionDeletionOperationBinding.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      sessionCreatorUserId: TEST_USER_ID,
      deletionRequestedByUserId: TEST_USER_ID,
      retryGeneration: 1,
      operationRunId: deletionRun.id,
    },
  });
  await client.agentSession.update({
    where: { id: session.id },
    data: { lifecycle: "deleting", deletionOperationRunId: deletionRun.id },
  });
  return {
    sessionId: session.id,
    deletionRunId: deletionRun.id,
    ownedRunId: ownedRun.id,
    artifactRunId: artifactRun.id,
    attempt: {
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      operationRunId: deletionRun.id,
      attemptToken: DELETE_ATTEMPT_TOKEN,
    },
  };
}

async function createTerminalRun(
  client: PrismaClient,
  sessionId: string,
  suffix: string,
) {
  const run = await client.operationRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: `agent-os.test-${suffix}`,
      definitionVersion: 1,
      ownerDomain: "agent-os",
      title: suffix,
      engineType: "agent_os",
      resourceClass: "default",
      executionTimeoutMs: 1,
      status: "cancelled",
      triggerSource: "agent",
      input: {},
    },
  });
  await client.agentSessionOperationRunOwnership.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId,
      operationRunId: run.id,
    },
  });
  return run;
}

async function createRunningAguiAttempt(
  client: PrismaClient,
  sessionId: string,
): Promise<{
  taskId: string;
  executionId: string;
  attemptId: string;
  startIntentId: string;
  copilotThreadId: string;
  aguiRunId: string;
}> {
  const [session, task, policy] = await Promise.all([
    client.agentSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { copilotThreadId: true },
    }),
    client.agentSessionTask.findFirstOrThrow({
      where: { sessionId, isRoot: true },
      select: { id: true },
    }),
    client.agentPolicySnapshot.findFirstOrThrow({
      where: { sessionId },
      select: { id: true },
    }),
  ]);
  const aguiRunId = `agui-${randomUUID()}`;
  const execution = await client.agentExecution.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId,
      sessionTaskId: task.id,
      copilotThreadId: session.copilotThreadId,
      aguiRunId,
      agentVersionId: VERSION_ID,
      runtimeType: "copilotkit_agui",
      modelIdentity: "test-model",
      policySnapshotId: policy.id,
      inputHash: createHash("sha256").update(aguiRunId).digest("hex"),
      currentInput: {},
      resourceRefs: [],
      status: "running",
    },
  });
  const startIntentId = randomUUID();
  const attempt = await client.agentExecutionAttempt.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId,
      executionId: execution.id,
      attemptNumber: 1,
      idempotencyKey: `agui:${aguiRunId}`,
      runtimeType: "copilotkit_agui",
      runtimeStartIntentId: startIntentId,
      state: "running",
    },
  });
  return {
    taskId: task.id,
    executionId: execution.id,
    attemptId: attempt.id,
    startIntentId,
    copilotThreadId: session.copilotThreadId,
    aguiRunId,
  };
}

async function createAguiUserMessage(
  client: PrismaClient,
  sessionId: string,
  agui: { executionId: string; aguiRunId: string },
) {
  const externalEventId = `agui-user-${randomUUID()}`;
  return client.agentConversationEvent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId,
      executionId: agui.executionId,
      externalEventId,
      sequence: 2n,
      eventType: "user_message",
      schemaVersion: 1,
      payload: {
        phase: "complete",
        messageId: externalEventId,
        content: "stalled deletion test",
      },
    },
    select: {
      id: true,
      organizationId: true,
      sessionId: true,
      executionId: true,
      externalEventId: true,
      sequence: true,
      eventType: true,
      schemaVersion: true,
      payload: true,
      createdAt: true,
    },
  });
}

function aguiRunRequest(
  sessionId: string,
  agui: {
    taskId: string;
    executionId: string;
    copilotThreadId: string;
    aguiRunId: string;
  },
  message: { externalEventId: string },
) {
  const organization = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
  const session = AgentSessionIdSchema.parse(sessionId);
  return {
    agentDefinitionKey: "deletion-test-agent",
    input: {
      threadId: agui.copilotThreadId,
      runId: agui.aguiRunId,
      state: {},
      messages: [
        {
          id: message.externalEventId,
          role: "user" as const,
          content: "stalled deletion test",
        },
      ],
      tools: [],
      context: [],
      forwardedProps: {
        kiditemAuthorization: {
          session: formatAgentSessionName(organization, session),
          task: formatAgentSessionTaskName(
            organization,
            session,
            AgentSessionTaskIdSchema.parse(agui.taskId),
          ),
          execution: formatAgentExecutionName(
            organization,
            session,
            AgentExecutionIdSchema.parse(agui.executionId),
          ),
          modelIdentity: "test-model",
          runtimeType: "copilotkit_agui",
          policyHash: "e".repeat(64),
          contextEpoch: 1,
          dashboardContext: {
            routeKey: "agent_os",
            resourceRefs: [],
            filters: {},
            visibleRowIds: [],
            aggregateSummary: {},
            locale: "ko-KR",
            timezone: "Asia/Seoul",
          },
        },
      },
    },
  };
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

function aguiCleanupRuntime() {
  return new OpenAiResponsesAguiRuntimeAdapter(
    new AgentAguiRuntimeRegistry(),
    { decide: vi.fn() } as never,
    new PrismaAguiRuntimeCleanupDependencies(
      prisma as never,
      new AgentAguiInProcessRunRegistry(),
    ),
  );
}

function aguiCleanupInput(
  sessionId: string,
  deletionOperationRunId: string,
  agui: {
    executionId: string;
    attemptId: string;
    startIntentId: string;
  },
  signal: AbortSignal,
) {
  return {
    signal,
    organizationId: TEST_ORGANIZATION_ID,
    sessionId,
    deletionOperationRunId,
    deletionAttemptToken: DELETE_ATTEMPT_TOKEN,
    runtimeType: "copilotkit_agui",
    executionId: agui.executionId,
    attemptId: agui.attemptId,
    startIntentId: agui.startIntentId,
    handle: null,
  };
}
