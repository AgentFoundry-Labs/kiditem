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
import { z } from "zod";
import {
  AgentExecutionAttemptIdSchema,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  OperationRunIdSchema,
  OrganizationIdSchema,
  formatAgentExecutionAttemptName,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatOperationRunName,
  parseOperationRunName,
} from "@kiditem/shared/identifiers";
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from "../../test-helpers/real-prisma";
import { OperationCheckpointRepositoryAdapter } from "../../operations/adapter/out/repository/operation-checkpoint.repository.adapter";
import { OperationRepositoryAdapter } from "../../operations/adapter/out/repository/operation.repository.adapter";
import { OperationAttemptExecutorService } from "../../operations/application/service/operation-attempt-executor.service";
import { CompositeOperationCoordinatorService } from "../../operations/application/service/composite-operation-coordinator.service";
import { OperationDispatcherService } from "../../operations/application/service/operation-dispatcher.service";
import { OperationHandlerRegistryService } from "../../operations/application/service/operation-handler-registry.service";
import { OperationLifecycleGateService } from "../../operations/application/service/operation-lifecycle-gate.service";
import { OperationRunService } from "../../operations/application/service/operation-run.service";
import { OperationRunWorkerService } from "../../operations/application/service/operation-run-worker.service";
import { OperationServerLifecycleService } from "../../operations/application/service/operation-server-lifecycle.service";
import { AgentSessionTaskOperationAdapter } from "../adapter/in/operation/session-execution/agent-session-task.operation-adapter";
import { InProcessAgentConversationLivePublisher } from "../adapter/out/event/in-process-agent-conversation-live-publisher.adapter";
import { PrismaAgentExecutionQueryRepository } from "../adapter/out/repository/interaction/prisma-agent-execution-query.repository";
import { PrismaAgentConversationQueryRepository } from "../adapter/out/repository/interaction/prisma-agent-conversation-query.repository";
import { PrismaAgentConversationEventTransaction } from "../adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction";
import { SessionControlAdapterSet } from "../adapter/out/transaction/session-control/__tests__/session-control-adapter-set";
import { PrismaAgentSessionOwnedOperationTransaction } from "../adapter/out/transaction/session-control/prisma-agent-session-owned-operation.transaction";
import { AgentSessionApprovalService } from "../application/service/session-control/agent-session-approval.service";
import { AgentSessionOperationContinuationService } from "../application/service/session-control/agent-session-operation-continuation.service";
import { AgentSessionCapabilityInvocationService } from "../application/service/agent-session-capability-invocation.service";
import { AgentSessionOwnedOperationService } from "../application/service/session-control/agent-session-owned-operation.service";
import { AgentCapabilityRegistry } from "../application/service/agent-capability-registry.service";
import { AgentSessionRuntimeControlService } from "../application/service/session-control/agent-session-runtime-control.service";
import { AgentSessionTaskOperationInputSchema } from "../domain/operation/agent-os.operations";
import { AgentSessionTaskExecutionService } from "../application/service/session-execution/agent-session-task-execution.service";
import type { PrismaClient } from "@prisma/client";
import { Test } from "@nestjs/testing";
import { AgentMcpApplicationModule } from "../../agent-mcp-application.module";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../common/storage/storage.service";
import { AGENT_OS_MCP_TOOL_EXECUTION_PORT } from "../application/port/in/capability/agent-os-mcp-tool-execution.port";
import { AGENT_SESSION_CONTROL_QUERY_REPOSITORY } from "../application/port/out/repository/session-control/agent-session-control-query.repository.port";
import { AGENT_EXECUTION_QUERY_REPOSITORY } from "../application/port/out/repository/interaction/agent-execution-query.repository.port";
import { seedAgentOs } from "../seed-agent-os";
import { SourcingCollectionOperationAdapter } from "../../sourcing/adapter/out/operations/sourcing-collection-operation.adapter";
import { SourcingCollectionCapabilityAdapter } from "../../sourcing/adapter/in/agent/sourcing-collection-capability.adapter";
import { OpenAiResponsesAguiRuntimeAdapter } from "../adapter/out/runtime/openai-responses-agui-runtime.adapter";
import { AgentAguiRuntimeRegistry } from "../application/service/agent-agui-runtime-registry.service";
import { AgentAguiInProcessRunRegistry } from "../application/service/agent-agui-in-process-run-registry.service";
import { AgentAguiRunService } from "../application/service/agent-agui-run.service";
import { AgentInteractionPresentationService } from "../application/service/agent-interaction-presentation.service";
import { AgentAguiStartupRecoveryService } from "../application/service/interaction/agent-agui-startup-recovery.service";
import { PrismaAgentAguiStartupRecoveryTransaction } from "../adapter/out/transaction/interaction/prisma-agent-agui-startup-recovery.transaction";

const VERSION_ID = "50000000-0000-4000-8000-000000000001";
const AUTHORITY_PROFILE_ID = "foundation_read_only_probe:v1";
const APPROVAL_CAPABILITY = "inventory.adjust";
const RECOVERY_CAPABILITY = "inventory.readForRecovery";
const SESSION_TASK_DEFINITION = {
  key: "agent-os.execute-session-task",
  version: 1,
  title: "Execute agent task",
  ownerDomain: "agent-os",
  engineType: "agent_os" as const,
  resourceClass: "default" as const,
  executionTimeoutMs: 60 * 60_000,
  maxAttempts: 5,
  successPersistence: "retained" as const,
};

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
});

describe("official durable runtime recovery", () => {
  it.each([200, 201, 256])("drains %i interrupted AG-UI rows through one PostgreSQL boot and is a no-op on the next boot", async (count) => {
    const graphs = [] as RunningAguiGraph[];
    for (let index = 0; index < count; index += 1) {
      graphs.push(await createRunningAguiGraph());
    }
    const recovery = new AgentAguiStartupRecoveryService(
      new PrismaAgentAguiStartupRecoveryTransaction(prisma as never),
    );

    await recovery.onApplicationBootstrap();

    const [executions, attempts, terminals, outbox] = await Promise.all([
      prisma!.agentExecution.findMany({
        where: { id: { in: graphs.map((graph) => graph.executionId) } },
        select: { status: true, errorCode: true },
      }),
      prisma!.agentExecutionAttempt.findMany({
        where: { id: { in: graphs.map((graph) => graph.attemptId) } },
        select: { state: true, errorCode: true },
      }),
      prisma!.agentConversationEvent.findMany({
        where: {
          executionId: { in: graphs.map((graph) => graph.executionId) },
          eventType: "run_terminal",
        },
        select: { externalEventId: true, payload: true },
      }),
      prisma!.agentConversationOutbox.count({
        where: {
          event: {
            executionId: { in: graphs.map((graph) => graph.executionId) },
            eventType: "run_terminal",
          },
        },
      }),
    ]);
    expect(executions).toHaveLength(count);
    expect(executions).toEqual(Array.from({ length: count }, () => ({
      status: "failed", errorCode: "process_interrupted",
    })));
    expect(attempts).toEqual(Array.from({ length: count }, () => ({
      state: "failed", errorCode: "process_interrupted",
    })));
    expect(terminals).toHaveLength(count);
    expect(terminals).toEqual(expect.arrayContaining(graphs.map((graph) => expect.objectContaining({
      externalEventId: `${graph.executionId}:agui:process_interrupted`,
      payload: { status: "failed", errorCode: "process_interrupted" },
    }))));
    expect(outbox).toBe(count);

    await recovery.onApplicationBootstrap();
    await expect(prisma!.agentConversationOutbox.count({
      where: { event: { eventType: "run_terminal" } },
    })).resolves.toBe(count);
  });

  it("stops a blocked production AG-UI decision once and atomically terminalizes its PostgreSQL attempt", async () => {
    const graph = await createRunningAguiGraph();
    const activeRuns = new AgentAguiInProcessRunRegistry();
    const entered = deferred<void>();
    const decisions = vi.fn(({ signal }: { signal: AbortSignal }) => {
      entered.resolve();
      return new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    });
    const runtimes = new AgentAguiRuntimeRegistry();
    const runtime = new OpenAiResponsesAguiRuntimeAdapter(
      runtimes,
      { decide: decisions } as never,
      undefined,
      undefined,
      activeRuns,
    );
    runtime.onModuleInit();
    const runner = new AgentAguiRunService(
      new PrismaAgentExecutionQueryRepository(prisma as never),
      new PrismaAgentConversationQueryRepository(prisma as never),
      new PrismaAgentConversationEventTransaction(prisma as never),
      { recordExecutionUsage: vi.fn() } as never,
      { publish: vi.fn() } as never,
      runtimes,
      { invoke: vi.fn() } as never,
      new AgentInteractionPresentationService(),
    );
    const stream = runtime.run({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      sessionId: graph.sessionId,
      sessionTaskId: graph.taskId,
      executionId: graph.executionId,
      attemptId: graph.attemptId,
      startIntentId: graph.startIntentId,
      runtimeCredentialGeneration: 0,
      copilotThreadId: graph.threadId,
      aguiRunId: graph.aguiRunId,
      agentDefinitionKey: "operator",
      runtimeType: "copilotkit_agui",
      modelIdentity: "gpt-test",
      capabilityKeys: [],
      messages: [{ id: "message-stop", role: "user", content: "stop" }],
      dashboardContext: {},
      invokeCapability: vi.fn(),
      recordUsage: vi.fn(),
    });
    await stream.next();
    const blocked = stream.next();
    const blockedFailure = blocked.then(
      () => null,
      (error: unknown) => error,
    );
    await entered.promise;

    await expect(runner.stop({
      agentDefinitionKey: "operator", sessionId: graph.sessionId,
      executionId: graph.executionId, attemptId: randomUUID(),
      startIntentId: graph.startIntentId, copilotThreadId: graph.threadId, aguiRunId: graph.aguiRunId,
    })).resolves.toBe(false);
    await expect(runner.stop({
      agentDefinitionKey: "operator", sessionId: graph.sessionId,
      executionId: graph.executionId, attemptId: graph.attemptId,
      startIntentId: graph.startIntentId, copilotThreadId: graph.threadId, aguiRunId: graph.aguiRunId,
    })).resolves.toBe(true);
    await expect(blockedFailure).resolves.toBeInstanceOf(Error);
    await expect(runner.stop({
      agentDefinitionKey: "operator", sessionId: graph.sessionId,
      executionId: graph.executionId, attemptId: graph.attemptId,
      startIntentId: graph.startIntentId, copilotThreadId: graph.threadId, aguiRunId: graph.aguiRunId,
    })).resolves.toBe(false);

    const [execution, events, outbox] = await Promise.all([
      prisma!.agentExecution.findUniqueOrThrow({
        where: { id: graph.executionId },
        include: { attempts: true },
      }),
      prisma!.agentConversationEvent.findMany({
        where: { executionId: graph.executionId, eventType: "run_terminal" },
      }),
      prisma!.agentConversationOutbox.count({
        where: { event: { executionId: graph.executionId, eventType: "run_terminal" } },
      }),
    ]);
    expect(decisions).toHaveBeenCalledOnce();
    expect(execution).toMatchObject({ status: "cancelled", errorCode: "user_cancelled" });
    expect(execution.attempts).toEqual([expect.objectContaining({
      id: graph.attemptId, state: "cancelled", errorCode: "user_cancelled",
    })]);
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({ status: "cancelled", errorCode: "user_cancelled" });
    expect(outbox).toBe(1);
  });

  it("replays concurrent refreshCollection through one owned Operation and one AgentSession ownership edge", async () => {
    const graph = await createRunningGraph();
    const transaction = new PrismaAgentSessionOwnedOperationTransaction(prisma as never);
    const owner = new AgentSessionOwnedOperationService({
      resolveAccepting: ({ operationKey, input }: { operationKey: string; input: Record<string, unknown> }) => ({
        definition: {
          key: operationKey, version: 1, title: "Collect sourcing", ownerDomain: "sourcing",
          engineType: "workflow", resourceClass: "default", executionTimeoutMs: 60_000,
          maxAttempts: 1, successPersistence: "retained",
        },
        parsedInput: input,
        signal: new AbortController().signal,
      }),
    } as never, transaction as never);
    const adapter = new SourcingCollectionOperationAdapter(owner);
    const handlers: Array<{ execute: (input: unknown) => Promise<any> }> = [];
    new SourcingCollectionCapabilityAdapter({
      register: (handler: { execute: (input: unknown) => Promise<any> }) => handlers.push(handler),
    } as never, adapter).onModuleInit();
    const organization = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
    const execution = {
      organization: `organizations/${TEST_ORGANIZATION_ID}`,
      actor: null,
      agentVersion: "agentDefinitions/operator/versions/1",
      session: formatAgentSessionName(organization, AgentSessionIdSchema.parse(graph.sessionId)),
      task: formatAgentSessionTaskName(organization, AgentSessionIdSchema.parse(graph.sessionId), AgentSessionTaskIdSchema.parse(graph.taskId)),
      execution: formatAgentExecutionName(organization, AgentSessionIdSchema.parse(graph.sessionId), AgentExecutionIdSchema.parse(graph.executionId)),
      attempt: `organizations/${TEST_ORGANIZATION_ID}/agentSessions/${graph.sessionId}/executions/${graph.executionId}/attempts/00000000-0000-4000-8000-000000000009`,
      operation: formatOperationRunName(organization, OperationRunIdSchema.parse("00000000-0000-4000-8000-000000000010")),
      requestId: "00000000-0000-4000-8000-000000000011",
      input: { sources: ["1688", "naver"] },
    };
    const [first, replay] = await Promise.all([
      handlers[0]!.execute(execution),
      handlers[0]!.execute({ ...execution, input: { sources: ["naver", "1688"] } }),
    ]);
    expect(replay).toEqual(first);
    const runs = await prisma!.operationRun.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: "sourcing.collect_daily_trends",
      },
      select: { id: true, agentSessionOperationRunOwnership: { select: { sessionId: true } } },
    });
    expect(runs).toEqual([{ id: parseOperationRunName(first.outputSummary.operation).operation,
      agentSessionOperationRunOwnership: { sessionId: graph.sessionId } }]);
  });

  it("boots the controller-free MCP root on PostgreSQL and exposes only exact sourcing controls and low-risk tools", async () => {
    const priorModel = process.env.AGENT_DEFAULT_MODEL;
    process.env.AGENT_DEFAULT_MODEL = "gpt-test";
    let moduleRef: Awaited<ReturnType<typeof Test.createTestingModule>> | null = null;
    try {
      const graph = await createMcpRunningGraph();
      const operation = await createOperation(graph);
      const startIntentId = crypto.randomUUID();
      await prisma!.agentExecutionAttempt.update({
        where: { id: operation.attemptId },
        data: {
          state: "running",
          runtimeStartIntentId: startIntentId,
          runtimeCredentialGeneration: 0,
        },
      });
      await prisma!.operationRun.update({
        where: { id: operation.runId },
        data: { status: "running", attemptToken: crypto.randomUUID() },
      });
      moduleRef = await Test.createTestingModule({
        imports: [AgentMcpApplicationModule],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      await moduleRef.init();
      const executor: any = moduleRef.get(AGENT_OS_MCP_TOOL_EXECUTION_PORT);
      const persistedPolicy = await prisma!.agentExecution.findUniqueOrThrow({
        where: { id: graph.executionId },
        select: {
          agentVersion: { select: { runtimeManifest: true } },
          policySnapshot: { select: { capabilityKeys: true, agentVersionId: true } },
          sessionTask: { select: { status: true } },
        },
      });
      expect(persistedPolicy.agentVersion.runtimeManifest).toMatchObject({
        capabilityKeys: expect.arrayContaining(["sourcing.retrieveWorkspaceEvidence"]),
      });
      expect(persistedPolicy.policySnapshot.capabilityKeys).toEqual(expect.arrayContaining([
        "sourcing.retrieveWorkspaceEvidence",
      ]));
      expect(persistedPolicy.policySnapshot.agentVersionId).toBe(
        (await prisma!.agentExecution.findUniqueOrThrow({
          where: { id: graph.executionId }, select: { agentVersionId: true },
        })).agentVersionId,
      );
      const context = {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: graph.sessionId,
        executionId: graph.executionId,
        attemptId: operation.attemptId,
        startIntentId,
        runtimeCredentialGeneration: 0,
      };
      const controls: any = moduleRef.get(AGENT_SESSION_CONTROL_QUERY_REPOSITORY);
      await expect(controls.isExecutionCapabilityAllowed({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: graph.sessionId,
        sessionTaskId: graph.taskId,
        executionId: graph.executionId,
        capabilityKey: "sourcing.retrieveWorkspaceEvidence",
      })).resolves.toBe(true);
      const interactions: any = moduleRef.get(AGENT_EXECUTION_QUERY_REPOSITORY);
      await expect(interactions.loadExecutionRuntimeContext({
        executionId: graph.executionId,
      })).resolves.toMatchObject({
        capabilityKeys: expect.arrayContaining(["sourcing.retrieveWorkspaceEvidence"]),
      });
      await expect(executor.listAvailableTools(context)).resolves.toEqual([
        { name: "agent_os_read_context" },
        { name: "agent_os_read_task_graph" },
        { name: "agent_os_read_artifacts" },
        { name: "sourcing_inspect_recommendation_run" },
        { name: "sourcing_retrieve_workspace_evidence" },
      ]);
      await expect(executor.execute({ context, toolName: "agent_os_read_context", arguments: {} }))
        .resolves.toMatchObject({
          execution: formatAgentExecutionName(
            OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
            AgentSessionIdSchema.parse(graph.sessionId),
            AgentExecutionIdSchema.parse(graph.executionId),
          ),
        });
      await expect(executor.execute({
        context, toolName: "sourcing_retrieve_workspace_evidence",
        arguments: { query: "kid product evidence", topK: 3, days: 7 },
      })).resolves.toMatchObject({
        resourceType: "sourcing_workspace_evidence",
        outputSummary: { documentCount: 0, citationIds: [] },
      });
      await expect(executor.execute({
        context, toolName: "order_submit_purchase_order", arguments: {},
      })).rejects.toMatchObject({ code: "MCP_TOOL_UNSUPPORTED" });
    } finally {
      await moduleRef?.close();
      if (priorModel === undefined) delete process.env.AGENT_DEFAULT_MODEL;
      else process.env.AGENT_DEFAULT_MODEL = priorModel;
    }
  });

  it("exposes the real listing generation capability from the controller-free MCP root", async () => {
    const priorModel = process.env.AGENT_DEFAULT_MODEL;
    const priorAiModels = {
      image: process.env.AI_IMAGE_MODEL,
      text: process.env.AI_TEXT_MODEL,
      vision: process.env.AI_IMAGE_ANALYSIS_MODEL,
    };
    process.env.AGENT_DEFAULT_MODEL = "gpt-test";
    process.env.AI_IMAGE_MODEL = "image-test";
    process.env.AI_TEXT_MODEL = "text-test";
    process.env.AI_IMAGE_ANALYSIS_MODEL = "vision-test";
    let moduleRef: Awaited<ReturnType<typeof Test.createTestingModule>> | null = null;
    try {
      const graph = await createMcpRunningGraph({
        agentDefinitionKey: "listing",
        capabilityKeys: ["product_listing.create_generation_package"],
      });
      const operation = await createOperation(graph);
      const startIntentId = crypto.randomUUID();
      const orderGraph = await createMcpRunningGraph({
        agentDefinitionKey: "order",
        capabilityKeys: [
          "supply.create_purchase_order_draft",
          "supply.submit_purchase_order",
        ],
      });
      const orderOperation = await createOperation(orderGraph);
      const orderStartIntentId = crypto.randomUUID();
      await prisma!.agentExecutionAttempt.update({
        where: { id: operation.attemptId },
        data: {
          state: "running",
          runtimeStartIntentId: startIntentId,
          runtimeCredentialGeneration: 0,
        },
      });
      await prisma!.operationRun.update({
        where: { id: operation.runId },
        data: { status: "running", attemptToken: crypto.randomUUID() },
      });
      await prisma!.agentExecutionAttempt.update({
        where: { id: orderOperation.attemptId },
        data: {
          state: "running",
          runtimeStartIntentId: orderStartIntentId,
          runtimeCredentialGeneration: 0,
        },
      });
      await prisma!.operationRun.update({
        where: { id: orderOperation.runId },
        data: { status: "running", attemptToken: crypto.randomUUID() },
      });
      await prisma!.sellpiaInventorySku.create({
        data: {
          id: "21000000-0000-4000-8000-000000000001",
          organizationId: TEST_ORGANIZATION_ID,
          code: "MCP-ORDER-1",
          name: "MCP order SKU",
          currentStock: 10,
          isActive: true,
        },
      });
      moduleRef = await Test.createTestingModule({
        imports: [AgentMcpApplicationModule],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        // The production ProductGeneration path remains intact. This is the
        // sole test-boundary override: a deterministic object-storage seam
        // avoids MinIO/media IO while real repositories and transactions run.
        .overrideProvider(StorageService)
        .useValue({
          save: async (key: string) => `https://listing-test.invalid/${key}`,
          extractKey: (url: string) => (
            url.startsWith("https://listing-test.invalid/")
              ? url.slice("https://listing-test.invalid/".length)
              : null
          ),
        })
        .compile();
      await moduleRef.init();
      const executor: any = moduleRef.get(AGENT_OS_MCP_TOOL_EXECUTION_PORT);
      const context = {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: graph.sessionId,
        executionId: graph.executionId,
        attemptId: operation.attemptId,
        startIntentId,
        runtimeCredentialGeneration: 0,
      };
      const orderContext = {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: orderGraph.sessionId,
        executionId: orderGraph.executionId,
        attemptId: orderOperation.attemptId,
        startIntentId: orderStartIntentId,
        runtimeCredentialGeneration: 0,
      };

      await expect(executor.listAvailableTools(context)).resolves.toEqual([
        { name: "agent_os_read_context" },
        { name: "agent_os_read_task_graph" },
        { name: "agent_os_read_artifacts" },
        { name: "agent_os_finalize_task" },
        { name: "listing_create_generation_package" },
      ]);
      await expect(executor.execute({
        context,
        toolName: "listing_create_generation_package",
        arguments: {
          productName: "MCP listing package",
          imageUrls: ["data:image/png;base64,iVBORw0KGgo="],
          category: "kids",
        },
      })).resolves.toMatchObject({
        resourceType: "sourcing_candidate",
        resourceId: expect.any(String),
        outputSummary: {
          candidateId: expect.any(String),
          parentOperationKey: expect.stringMatching(/^product-generation:/),
          detailGenerationId: expect.any(String),
          thumbnailGenerationId: expect.any(String),
          contentWorkspaceId: expect.any(String),
          href: expect.stringMatching(/^\/product-pipeline\/collected-products\//),
        },
      });
      await expect(executor.listAvailableTools(orderContext)).resolves.toEqual([
        { name: "agent_os_read_context" },
        { name: "agent_os_read_task_graph" },
        { name: "agent_os_read_artifacts" },
        { name: "agent_os_finalize_task" },
        { name: "order_create_purchase_order_draft" },
      ]);
      await expect(executor.execute({
        context: orderContext,
        toolName: "order_create_purchase_order_draft",
        arguments: {
          sellpiaInventorySkuId: "21000000-0000-4000-8000-000000000001",
          productName: "MCP order SKU",
          supplierName: "MCP supplier",
          unitPriceCny: 21.5,
          moq: 4,
        },
      })).resolves.toMatchObject({
        resourceType: "purchase_order",
        resourceId: expect.any(String),
        outputSummary: { orderId: expect.any(String), status: "draft" },
      });
      for (const toolName of [
        "order_submit_purchase_order",
        "supply_submit_purchase_order",
      ]) {
        await expect(executor.execute({
          context: orderContext,
          toolName,
          arguments: {},
        })).rejects.toMatchObject({ code: "MCP_TOOL_UNSUPPORTED" });
      }
    } finally {
      await moduleRef?.close();
      if (priorModel === undefined) delete process.env.AGENT_DEFAULT_MODEL;
      else process.env.AGENT_DEFAULT_MODEL = priorModel;
      if (priorAiModels.image === undefined) delete process.env.AI_IMAGE_MODEL;
      else process.env.AI_IMAGE_MODEL = priorAiModels.image;
      if (priorAiModels.text === undefined) delete process.env.AI_TEXT_MODEL;
      else process.env.AI_TEXT_MODEL = priorAiModels.text;
      if (priorAiModels.vision === undefined) delete process.env.AI_IMAGE_ANALYSIS_MODEL;
      else process.env.AI_IMAGE_ANALYSIS_MODEL = priorAiModels.vision;
    }
  });

  it("recovers a lifecycle-cancelled AgentOS graph through an immutable successor after API restart", async () => {
    const graph = await createRunningGraph();
    const operation = await createOperation(graph);
    const controls = new SessionControlAdapterSet(prisma as never);
    const attempt = { id: operation.attemptId };
    await controls.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      operationRunId: operation.runId,
    });
    await controls.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      attemptId: attempt.id,
      runtimeType: "hermes_http",
      externalRunId: "external-durable-run-1",
      encryptedHandleRef: "vault://opaque-handle-1",
      runtimeGeneration: 1,
    });

    const repository = new OperationRepositoryAdapter(prisma as never);
    const lifecycleGate = new OperationLifecycleGateService();
    const lifecycle = new OperationServerLifecycleService(
      repository,
      lifecycleGate,
      { runAll: vi.fn().mockResolvedValue(undefined) } as never,
      { start: vi.fn(), stopIntake: vi.fn(), drainUntil: vi.fn() } as never,
      {
        start: vi.fn(),
        stopIntake: vi.fn(),
        abortActive: vi.fn(),
        drainUntil: vi.fn(),
      } as never,
      { batchSize: 100, startupTimeoutMs: 2_000, shutdownTimeoutMs: 500 },
    );

    await lifecycle.onApplicationBootstrap();
    expect(lifecycleGate.state()).toBe("ACCEPTING");
    await expect(
      prisma!.operationRun.findUniqueOrThrow({
        where: { id: operation.runId },
        select: { status: true, errorCode: true },
      }),
    ).resolves.toEqual({
      status: "cancelled",
      errorCode: "operation_server_lifecycle_expired",
    });

    const continuations = new AgentSessionOperationContinuationService(
      controls as never,
      controls as never,
      controls as never,
      lifecycleGate,
      { requireCompatible: vi.fn() } as never,
    );
    await continuations.onApplicationBootstrap();
    const successor =
      await prisma!.agentExecutionAttemptOperationBinding.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          executionAttemptId: attempt.id,
          predecessorOperationRunId: operation.runId,
        },
        select: { operationRunId: true },
      });
    expect(successor.operationRunId).not.toBe(operation.runId);
    // A process lost with a running DB graph is never inferred successful.
    // The predecessor stays terminal and recovery may only bind a successor;
    // its persisted native handle is what makes the successor reconnectable.
    await expect(
      prisma!.agentExecutionAttemptOperationBinding.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          executionAttemptId: attempt.id,
          predecessorOperationRunId: operation.runId,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma!.operationRun.findUniqueOrThrow({
        where: { id: operation.runId },
        select: { status: true, errorCode: true },
      }),
    ).resolves.toEqual({
      status: "cancelled",
      errorCode: "operation_server_lifecycle_expired",
    });
    await expect(
      Promise.all([
        prisma!.agentSessionTask.findUniqueOrThrow({
          where: { id: graph.taskId },
          select: { status: true },
        }),
        prisma!.agentExecution.findUniqueOrThrow({
          where: { id: graph.executionId },
          select: { status: true },
        }),
        prisma!.agentExecutionAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
          select: { state: true },
        }),
      ]),
    ).resolves.toEqual([
      { status: "running" },
      { status: "running" },
      { state: "running" },
    ]);

    const checkpoints = new OperationCheckpointRepositoryAdapter(
      prisma as never,
    );
    const recovered = makeWorker({
      graph,
      operation: { ...operation, runId: successor.operationRunId },
      controls,
      checkpoints,
      backend: new DurableFakeRuntimeBackend(graph, "complete"),
    });
    await runWorkerTick(recovered.worker);

    expect(recovered.runtime.start).not.toHaveBeenCalled();
    expect(recovered.runtime.inspect).toHaveBeenCalledTimes(1);
    expect(recovered.runtime.connect).toHaveBeenCalledTimes(1);
    await expect(
      Promise.all([
        prisma!.operationRun.findUniqueOrThrow({
          where: { id: operation.runId },
          select: { status: true },
        }),
        prisma!.operationRun.findUniqueOrThrow({
          where: { id: successor.operationRunId },
          select: { status: true },
        }),
        prisma!.agentSessionTask.findUniqueOrThrow({
          where: { id: graph.taskId },
          select: { status: true },
        }),
        prisma!.agentExecution.findUniqueOrThrow({
          where: { id: graph.executionId },
          select: { status: true },
        }),
        prisma!.agentExecutionAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
          select: { state: true },
        }),
      ]),
    ).resolves.toEqual([
      { status: "cancelled" },
      { status: "succeeded" },
      { status: "completed" },
      { status: "completed" },
      { state: "succeeded" },
    ]);
  });

  it("creates one immutable successor OperationRun binding for a durable attempt cancelled by a prior API lifecycle", async () => {
    const graph = await createRunningGraph();
    const operation = await createOperation(graph);
    const controls = new SessionControlAdapterSet(prisma as never);
    const attempt = { id: operation.attemptId };
    await controls.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      operationRunId: operation.runId,
    });
    await controls.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      attemptId: attempt.id,
      runtimeType: "hermes_http",
      externalRunId: "external-durable-run-1",
      encryptedHandleRef: "vault://opaque-handle-1",
      runtimeGeneration: 1,
    });
    await prisma!.operationRun.update({
      where: { id: operation.runId },
      data: {
        status: "cancelled",
        errorCode: "operation_server_lifecycle_expired",
        errorMessage: "prior api lifecycle ended",
        finishedAt: new Date(),
      },
    });

    const input = {
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      taskId: graph.taskId,
      executionId: graph.executionId,
      attemptId: attempt.id,
      predecessorOperationRunId: operation.runId,
      continuationKey: `lifecycle:${operation.runId}`,
    };

    const first = await controls.continueOperationAttempt(input);
    const second = await controls.continueOperationAttempt(input);

    expect(second).toEqual(first);
    expect(first.operationRunId).not.toBe(operation.runId);
    expect(first.attemptId).toBe(attempt.id);
    await expect(
      prisma!.operationRun.findUniqueOrThrow({
        where: { id: operation.runId },
        select: { status: true, errorCode: true },
      }),
    ).resolves.toEqual({
      status: "cancelled",
      errorCode: "operation_server_lifecycle_expired",
    });
    await expect(
      prisma!.operationRun.findUniqueOrThrow({
        where: { id: first.operationRunId },
        select: { status: true, input: true },
      }),
    ).resolves.toEqual({ status: "queued", input: operation.input });
    await expect(
      prisma!.operationRunCheckpoint.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          operationRunId: first.operationRunId,
        },
        select: { kind: true, state: true },
      }),
    ).resolves.toEqual({
      kind: "runtime_handle_continuation",
      state: {
        runtimeHandle: {
          runtimeType: "hermes_http",
          executionId: graph.executionId,
          attemptId: attempt.id,
          externalRunId: "external-durable-run-1",
          encryptedHandleRef: "vault://opaque-handle-1",
          generation: 1,
        },
      },
    });
  });

  it("correlates opaque transport IDs with canonical resource names and rejects them as operation input", async () => {
    const graph = await createRunningGraph();
    const operation = await createOperation(graph);
    const controls = new SessionControlAdapterSet(prisma as never);
    const attempt = { id: operation.attemptId };
    const organization = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
    const session = formatAgentSessionName(
      organization,
      AgentSessionIdSchema.parse(graph.sessionId),
    );
    const task = formatAgentSessionTaskName(
      organization,
      AgentSessionIdSchema.parse(graph.sessionId),
      AgentSessionTaskIdSchema.parse(graph.taskId),
    );
    const execution = formatAgentExecutionName(
      organization,
      AgentSessionIdSchema.parse(graph.sessionId),
      AgentExecutionIdSchema.parse(graph.executionId),
    );

    expect(operation.input).toEqual({ session, task, execution });
    expect(
      formatAgentExecutionAttemptName(
        organization,
        AgentSessionIdSchema.parse(graph.sessionId),
        AgentExecutionIdSchema.parse(graph.executionId),
        AgentExecutionAttemptIdSchema.parse(attempt.id),
      ),
    ).toContain(`/attempts/${attempt.id}`);
    expect(
      formatOperationRunName(
        organization,
        OperationRunIdSchema.parse(operation.runId),
      ),
    ).toContain(`/operations/${operation.runId}`);
    const canonicalInput = { session, task, execution };
    expect(
      AgentSessionTaskOperationInputSchema.safeParse(canonicalInput).success,
    ).toBe(true);
    for (const [field, opaque] of [
      ["session", graph.threadId],
      ["task", graph.taskId],
      ["execution", graph.executionId],
    ] as const) {
      expect(
        AgentSessionTaskOperationInputSchema.safeParse({
          ...canonicalInput,
          [field]: opaque,
        }).success,
      ).toBe(false);
    }
    for (const [field, opaque] of [
      ["requestId", "approval-request-id"],
      ["encryptedHandleRef", "vault://opaque-handle-1"],
      ["aguiRunId", graph.aguiRunId],
    ] as const) {
      expect(
        AgentSessionTaskOperationInputSchema.safeParse({
          ...canonicalInput,
          [field]: opaque,
        }).success,
      ).toBe(false);
    }
  });

  it("reuses one persisted opaque handle after a handler restart and terminalizes once", async () => {
    const graph = await createRunningGraph();
    const operation = await createOperation(graph);
    const checkpoints = new OperationCheckpointRepositoryAdapter(
      prisma as never,
    );
    const controls = new SessionControlAdapterSet(prisma as never);
    const backend = new DurableFakeRuntimeBackend(graph, "crash");
    const first = makeWorker({
      graph,
      operation,
      controls,
      checkpoints,
      backend,
    });

    await runWorkerTick(first.worker);
    expect(first.runtime.start).toHaveBeenCalledTimes(1);
    expect(
      await prisma!.agentConversationEvent.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          executionId: graph.executionId,
        },
      }),
    ).toBe(4);
    expect(
      await prisma!.operationRun.findUniqueOrThrow({
        where: { id: operation.runId },
      }),
    ).toMatchObject({
      status: "queued",
    });
    expect(
      (
        await checkpoints.findLatest({
          organizationId: TEST_ORGANIZATION_ID,
          operationRunId: operation.runId,
        })
      )?.kind,
    ).toBe("runtime_handle_persisted");

    const recovered = makeWorker({
      graph,
      operation,
      controls,
      checkpoints,
      backend,
    });

    await runWorkerTick(recovered.worker);

    expect(recovered.runtime).not.toBe(first.runtime);
    expect(recovered.runtime.start).not.toHaveBeenCalled();
    expect(recovered.runtime.inspect).toHaveBeenCalledTimes(1);
    expect(recovered.runtime.connect).toHaveBeenCalledTimes(1);
    expect(
      await prisma!.agentConversationEvent.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          executionId: graph.executionId,
        },
      }),
    ).toBe(5);
    const [attempt, task, terminal, operationRun] = await Promise.all([
      prisma!.agentExecutionAttemptOperationBinding.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          executionId: graph.executionId,
          operationRunId: operation.runId,
        },
        include: { attempt: true },
      }),
      prisma!.agentSessionTask.findUniqueOrThrow({
        where: { id: graph.taskId },
      }),
      checkpoints.findLatest({
        organizationId: TEST_ORGANIZATION_ID,
        operationRunId: operation.runId,
      }),
      prisma!.operationRun.findUniqueOrThrow({
        where: { id: operation.runId },
      }),
    ]);
    expect(attempt.attempt).toMatchObject({
      state: "succeeded",
      externalRunId: "external-durable-run-1",
      encryptedHandleRef: "vault://opaque-handle-1",
    });
    expect(task.status).toBe("completed");
    expect(terminal).toMatchObject({ kind: "terminal" });
    expect(operationRun).toMatchObject({ status: "succeeded" });
  });

  it("persists an approval before worker recreation, resumes the same handle, and completes once", async () => {
    const graph = await createRunningGraph([
      APPROVAL_CAPABILITY,
      RECOVERY_CAPABILITY,
    ]);
    const operation = await createOperation(graph);
    const checkpoints = new OperationCheckpointRepositoryAdapter(
      prisma as never,
    );
    const controls = new SessionControlAdapterSet(prisma as never);
    const invocation = recoveryCapabilityInvocation(controls);
    const backend = new DurableFakeRuntimeBackend(
      graph,
      "approval",
      async () => {
        const organization = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
        await invocation.service.invoke({
          invocationSurface: "mcp_runtime",
          session: formatAgentSessionName(
            organization,
            AgentSessionIdSchema.parse(graph.sessionId),
          ),
          task: formatAgentSessionTaskName(
            organization,
            AgentSessionIdSchema.parse(graph.sessionId),
            AgentSessionTaskIdSchema.parse(graph.taskId),
          ),
          execution: formatAgentExecutionName(
            organization,
            AgentSessionIdSchema.parse(graph.sessionId),
            AgentExecutionIdSchema.parse(graph.executionId),
          ),
          capabilityKey: RECOVERY_CAPABILITY,
          input: { reason: "approval_recovery" },
        });
      },
    );
    const first = makeWorker({
      graph,
      operation,
      controls,
      checkpoints,
      backend,
    });

    await runWorkerTick(first.worker);
    const [approval, attempt] = await Promise.all([
      prisma!.agentSessionApproval.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          executionId: graph.executionId,
        },
      }),
      prisma!.agentExecutionAttempt.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          executionId: graph.executionId,
        },
      }),
    ]);
    expect(approval.state).toBe("pending");
    expect(
      await prisma!.agentConversationEvent.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          executionId: graph.executionId,
        },
      }),
    ).toBe(3);

    const organization = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
    const session = formatAgentSessionName(
      organization,
      AgentSessionIdSchema.parse(graph.sessionId),
    );
    await expect(
      first.approvals.decide({
        organizationId: TEST_ORGANIZATION_ID,
        session,
        approvalId: approval.id,
        actorId: TEST_USER_ID,
        decision: "approved",
        idempotencyKey: "approval:recovery:approved",
      }),
    ).resolves.toEqual({ state: "approved" });
    expect(first.runtime.interrupt).toHaveBeenCalledTimes(1);
    expect(invocation.execute).not.toHaveBeenCalled();
    expect(
      await prisma!.operationRun.findUniqueOrThrow({
        where: { id: operation.runId },
      }),
    ).toMatchObject({
      status: "attention_required",
    });
    const continuation =
      await prisma!.agentExecutionAttemptOperationBinding.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          executionAttemptId: attempt.id,
          predecessorOperationRunId: operation.runId,
        },
        select: { operationRunId: true },
      });
    expect(
      await prisma!.operationRun.findUniqueOrThrow({
        where: { id: continuation.operationRunId },
        select: { status: true },
      }),
    ).toEqual({ status: "queued" });

    const resumed = makeWorker({
      graph,
      operation: { ...operation, runId: continuation.operationRunId },
      controls,
      checkpoints,
      backend,
    });
    await runWorkerTick(resumed.worker);
    expect(resumed.runtime).not.toBe(first.runtime);
    expect(resumed.runtime.start).not.toHaveBeenCalled();
    expect(resumed.runtime.inspect).toHaveBeenCalledTimes(1);
    expect(resumed.runtime.connect).toHaveBeenCalledTimes(1);
    expect(
      await prisma!.agentSessionApproval.findUniqueOrThrow({
        where: { id: approval.id },
      }),
    ).toMatchObject({ state: "approved" });
    expect(
      await prisma!.agentExecutionAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      }),
    ).toMatchObject({
      state: "succeeded",
      externalRunId: "external-durable-run-1",
    });
    expect(
      await prisma!.operationRun.findUniqueOrThrow({
        where: { id: operation.runId },
      }),
    ).toMatchObject({
      status: "attention_required",
    });
    expect(
      await prisma!.operationRun.findUniqueOrThrow({
        where: { id: continuation.operationRunId },
      }),
    ).toMatchObject({
      status: "succeeded",
    });
    expect(invocation.execute).toHaveBeenCalledTimes(1);
  });

  it("drains a decision persisted before successor creation after API restart", async () => {
    const boundary = await createApprovalBoundary();
    await boundary.controls.decideApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: boundary.graph.sessionId,
      approvalId: boundary.approval.id,
      expectedState: "pending",
      decision: "approved",
      actorType: "human",
      actorId: TEST_USER_ID,
      idempotencyKey: "approval:crash-after-decision",
    });
    await expect(
      prisma!.agentSessionApprovalContinuation.findFirstOrThrow({
        where: {
          approvalId: boundary.approval.id,
          organizationId: TEST_ORGANIZATION_ID,
        },
        select: { state: true, successorOperationRunId: true },
      }),
    ).resolves.toEqual({ state: "pending", successorOperationRunId: null });

    const gate = new OperationLifecycleGateService();
    gate.open();
    const recoveredRuntime = runtimeFor(boundary.backend);
    const recovered = new AgentSessionOperationContinuationService(
      boundary.controls as never,
      boundary.controls as never,
      boundary.controls as never,
      gate,
      { requireCompatible: vi.fn(() => recoveredRuntime) } as never,
    );
    await recovered.onApplicationBootstrap();

    expect(recoveredRuntime.interrupt).toHaveBeenCalledTimes(1);
    await expect(
      prisma!.agentSessionApprovalContinuation.findFirstOrThrow({
        where: {
          approvalId: boundary.approval.id,
          organizationId: TEST_ORGANIZATION_ID,
        },
        select: {
          state: true,
          successorOperationRunId: true,
          interruptDeliveredAt: true,
        },
      }),
    ).resolves.toMatchObject({
      state: "interrupt_delivered",
      successorOperationRunId: expect.any(String),
      interruptDeliveredAt: expect.any(Date),
    });
  });

  it("delivers the exact idempotent interrupt after crashing after successor creation", async () => {
    const boundary = await createApprovalBoundary();
    await boundary.controls.decideApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: boundary.graph.sessionId,
      approvalId: boundary.approval.id,
      expectedState: "pending",
      decision: "approved",
      actorType: "human",
      actorId: TEST_USER_ID,
      idempotencyKey: "approval:crash-after-successor",
    });
    const created = await boundary.controls.advanceApprovedContinuation({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: boundary.graph.sessionId,
      approvalId: boundary.approval.id,
    });
    expect(created.state).toBe("successor_created");
    await expect(
      prisma!.agentSessionApprovalContinuation.findFirstOrThrow({
        where: {
          approvalId: boundary.approval.id,
          organizationId: TEST_ORGANIZATION_ID,
        },
        select: { state: true, successorOperationRunId: true },
      }),
    ).resolves.toEqual({
      state: "successor_created",
      successorOperationRunId: created.operationRunId,
    });

    const gate = new OperationLifecycleGateService();
    gate.open();
    const recoveredRuntime = runtimeFor(boundary.backend);
    const recovered = new AgentSessionOperationContinuationService(
      boundary.controls as never,
      boundary.controls as never,
      boundary.controls as never,
      gate,
      { requireCompatible: vi.fn(() => recoveredRuntime) } as never,
    );
    await recovered.onApplicationBootstrap();

    expect(recoveredRuntime.interrupt).toHaveBeenCalledWith(
      {
        runtimeType: "hermes_http",
        executionId: boundary.graph.executionId,
        attemptId: boundary.attempt.id,
        externalRunId: "external-durable-run-1",
        encryptedHandleRef: "vault://opaque-handle-1",
        generation: 1,
      },
      {
        interruptId: boundary.approval.id,
        payload: { decision: "approved" },
      },
    );
    await expect(
      prisma!.agentSessionApprovalContinuation.findFirstOrThrow({
        where: {
          approvalId: boundary.approval.id,
          organizationId: TEST_ORGANIZATION_ID,
        },
        select: { state: true, successorOperationRunId: true },
      }),
    ).resolves.toEqual({
      state: "interrupt_delivered",
      successorOperationRunId: created.operationRunId,
    });
  });

  it("retries the same interrupt after a crash before its delivery checkpoint", async () => {
    const boundary = await createApprovalBoundary();
    await boundary.controls.decideApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: boundary.graph.sessionId,
      approvalId: boundary.approval.id,
      expectedState: "pending",
      decision: "approved",
      actorType: "human",
      actorId: TEST_USER_ID,
      idempotencyKey: "approval:crash-after-interrupt",
    });
    const gate = new OperationLifecycleGateService();
    gate.open();
    const crashingRuntime = runtimeFor(boundary.backend);
    const crashing = new AgentSessionOperationContinuationService(
      boundary.controls as never,
      boundary.controls as never,
      {
        advanceApprovedContinuation:
          boundary.controls.advanceApprovedContinuation.bind(boundary.controls),
        markApprovalContinuationInterruptDelivered: vi
          .fn()
          .mockRejectedValue(new Error("simulated crash after interrupt")),
      } as never,
      gate,
      { requireCompatible: vi.fn(() => crashingRuntime) } as never,
    );

    await expect(
      crashing.continueApproval({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: boundary.graph.sessionId,
        approvalId: boundary.approval.id,
      }),
    ).rejects.toThrow("simulated crash after interrupt");
    expect(crashingRuntime.interrupt).toHaveBeenCalledTimes(1);
    const firstInterrupt = crashingRuntime.interrupt.mock.calls[0];
    await expect(
      prisma!.agentSessionApprovalContinuation.findFirstOrThrow({
        where: {
          approvalId: boundary.approval.id,
          organizationId: TEST_ORGANIZATION_ID,
        },
        select: { state: true, successorOperationRunId: true },
      }),
    ).resolves.toMatchObject({ state: "successor_created" });

    const recoveredRuntime = runtimeFor(boundary.backend);
    const recovered = new AgentSessionOperationContinuationService(
      boundary.controls as never,
      boundary.controls as never,
      boundary.controls as never,
      gate,
      { requireCompatible: vi.fn(() => recoveredRuntime) } as never,
    );
    await recovered.recoverIncompleteApprovalContinuations();

    expect(recoveredRuntime.interrupt).toHaveBeenCalledTimes(1);
    expect(recoveredRuntime.interrupt.mock.calls[0]).toEqual(firstInterrupt);
    await expect(
      prisma!.agentSessionApprovalContinuation.findFirstOrThrow({
        where: {
          approvalId: boundary.approval.id,
          organizationId: TEST_ORGANIZATION_ID,
        },
        select: { state: true },
      }),
    ).resolves.toEqual({ state: "interrupt_delivered" });
  });

  it("fails a detached attempt with an unknown handle without starting a replacement run", async () => {
    const graph = await createRunningGraph();
    const operation = await createOperation(graph);
    const checkpoints = new OperationCheckpointRepositoryAdapter(
      prisma as never,
    );
    const controls = new SessionControlAdapterSet(prisma as never);
    const runtime = runtimeFor(new DurableFakeRuntimeBackend(graph, "unknown"));
    const attempt = { id: operation.attemptId };
    await controls.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      operationRunId: operation.runId,
    });
    await controls.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      attemptId: attempt.id,
      runtimeType: "hermes_http",
      externalRunId: "external-durable-run-1",
      encryptedHandleRef: "vault://opaque-handle-1",
      runtimeGeneration: 1,
    });
    await checkpoints.append({
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId: operation.runId,
      kind: "runtime_handle_persisted",
      state: {
        runtimeHandle: {
          runtimeType: "hermes_http",
          executionId: graph.executionId,
          attemptId: attempt.id,
          externalRunId: "external-durable-run-1",
          encryptedHandleRef: "vault://opaque-handle-1",
          generation: 1,
        },
      },
    });

    const recovered = makeHandler({
      graph,
      operation,
      controls,
      checkpoints,
      runtime,
      records: [],
    });
    await expect(recovered.handler.execute(operation)).resolves.toMatchObject({
      kind: "failed",
      code: "AGENT_RUNTIME_HANDLE_LOST",
    });
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.connect).not.toHaveBeenCalled();
    expect(runtime.inspect).toHaveBeenCalledTimes(1);
    expect(
      await prisma!.agentExecutionAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      }),
    ).toMatchObject({
      state: "failed",
      errorCode: "AGENT_RUNTIME_HANDLE_LOST",
    });
  });

  it("makes repeated detached cancellation idempotent without a second external cancel", async () => {
    const graph = await createRunningGraph();
    const operation = await createOperation(graph);
    const checkpoints = new OperationCheckpointRepositoryAdapter(
      prisma as never,
    );
    const controls = new SessionControlAdapterSet(prisma as never);
    const runtime = runtimeFor(
      new DurableFakeRuntimeBackend(graph, "complete"),
    );
    const attempt = { id: operation.attemptId };
    await controls.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      operationRunId: operation.runId,
    });
    await controls.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      attemptId: attempt.id,
      runtimeType: "hermes_http",
      externalRunId: "external-durable-run-1",
      encryptedHandleRef: "vault://opaque-handle-1",
      runtimeGeneration: 1,
    });
    await checkpoints.append({
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId: operation.runId,
      kind: "runtime_handle_persisted",
      state: {
        runtimeHandle: {
          runtimeType: "hermes_http",
          executionId: graph.executionId,
          attemptId: attempt.id,
          externalRunId: "external-durable-run-1",
          encryptedHandleRef: "vault://opaque-handle-1",
          generation: 1,
        },
      },
    });
    const handler = makeHandler({
      graph,
      operation,
      controls,
      checkpoints,
      runtime,
      records: [],
      operations: {
        heartbeatRun: vi.fn().mockResolvedValue(true),
        findRunById: vi.fn(async () => operation),
      },
    });
    const cancellation = {
      organizationId: TEST_ORGANIZATION_ID,
      runId: operation.runId,
      requestedByUserId: TEST_USER_ID,
      reason: "user_cancelled",
    };

    await handler.handler.cancel(cancellation);
    await handler.handler.cancel(cancellation);

    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.cancel).toHaveBeenCalledTimes(1);
    expect(
      await prisma!.agentExecutionAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      }),
    ).toMatchObject({ state: "cancelled" });
    expect(
      await prisma!.agentExecution.findUniqueOrThrow({
        where: { id: graph.executionId },
      }),
    ).toMatchObject({ status: "cancelled" });
  });
});

function makeHandler(input: {
  graph: DurableGraph;
  operation: Record<string, unknown>;
  controls: SessionControlAdapterSet;
  checkpoints: OperationCheckpointRepositoryAdapter;
  runtime: ReturnType<typeof runtimeFor>;
  records: Array<Record<string, unknown>>;
  runtimeControl?: AgentSessionRuntimeControlService;
  approvals?: AgentSessionApprovalService;
  operations?: Record<string, unknown>;
  registry?: OperationHandlerRegistryService;
}) {
  const contextBuilder = {
    build: vi.fn(async ({ attemptId }: { attemptId: string }) => ({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.graph.sessionId,
      sessionTaskId: input.graph.taskId,
      executionId: input.graph.executionId,
      attemptId,
      runtimeType: "hermes_http",
    })),
  };
  const executions = {
    loadExecutionRuntimeContext: vi.fn(async () => ({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.graph.sessionId,
      sessionTaskId: input.graph.taskId,
      executionId: input.graph.executionId,
      runtimeType: "hermes_http",
    })),
    findCurrentExecution: vi.fn(async () => {
      const row = await prisma!.agentExecution.findUnique({
        where: { id: input.graph.executionId },
        select: { status: true },
      });
      return row;
    }),
    markExecutionTerminal: vi.fn(
      async (terminal: { status: string; errorCode: string | null }) => {
        await prisma!.agentExecution.update({
          where: { id: input.graph.executionId },
          data: {
            status: terminal.status,
            finishedAt: new Date(),
            errorCode: terminal.errorCode,
          },
        });
      },
    ),
  };
  const executionEvents = {
    markExecutionTerminal: executions.markExecutionTerminal,
  };
  const runtimeControl = input.runtimeControl ?? {
    record: vi.fn(async (event: { event: Record<string, unknown> }) => {
      input.records.push(event.event);
      return {
        event: {
          id: `event-${input.records.length}`,
          sequence: BigInt(input.records.length),
        },
        pointer: {},
      };
    }),
    publish: vi.fn(),
  };
  const approvals = input.approvals ?? { request: vi.fn() };
  const artifacts = {
    materialize: vi.fn(),
    beginFence: vi.fn(),
    confirmFenced: vi.fn(),
  };
  const operations = input.operations ?? {
    heartbeatRun: vi.fn().mockResolvedValue(true),
  };
  const operationExecution = {
    findOperation: vi.fn(
      async ({ organizationId, operation: operationName }) => {
        const run = await input.operations?.findRunById?.({
          organizationId,
          runId: parseOperationRunName(operationName).operation,
        });
        return run ? { input: run.input } : null;
      },
    ),
    findLatestCheckpoint: vi.fn(
      async ({ organizationId, operation: operationName }) =>
        input.checkpoints.findLatest({
          organizationId,
          operationRunId: parseOperationRunName(operationName).operation,
        }),
    ),
    appendCheckpoint: vi.fn(
      async ({ organizationId, operation: operationName, kind, state }) => {
        await input.checkpoints.append({
          organizationId,
          operationRunId: parseOperationRunName(operationName).operation,
          kind,
          state,
        });
      },
    ),
  };
  const executionService = new AgentSessionTaskExecutionService(
    contextBuilder as never,
    { requireCompatible: vi.fn(() => input.runtime) } as never,
    operationExecution as never,
    input.controls as never,
    input.controls as never,
    input.controls as never,
    artifacts as never,
    runtimeControl as never,
    approvals as never,
    executions as never,
    executionEvents as never,
  );
  const handler = new AgentSessionTaskOperationAdapter(
    input.registry ?? ({ register: vi.fn() } as never),
    executionService,
  );
  return { handler, executions, runtimeControl, approvals, operations };
}

async function createApprovalBoundary(): Promise<{
  graph: DurableGraph;
  operation: Awaited<ReturnType<typeof createOperation>>;
  controls: SessionControlAdapterSet;
  backend: DurableFakeRuntimeBackend;
  approval: { id: string };
  attempt: { id: string };
}> {
  const graph = await createRunningGraph([APPROVAL_CAPABILITY]);
  const operation = await createOperation(graph);
  const controls = new SessionControlAdapterSet(prisma as never);
  const checkpoints = new OperationCheckpointRepositoryAdapter(prisma as never);
  const backend = new DurableFakeRuntimeBackend(graph, "approval");
  const worker = makeWorker({
    graph,
    operation,
    controls,
    checkpoints,
    backend,
  });
  await runWorkerTick(worker.worker);
  const [approval, attempt] = await Promise.all([
    prisma!.agentSessionApproval.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        executionId: graph.executionId,
      },
      select: { id: true },
    }),
    prisma!.agentExecutionAttempt.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        executionId: graph.executionId,
      },
      select: { id: true },
    }),
  ]);
  await expect(
    prisma!.operationRun.findUniqueOrThrow({
      where: { id: operation.runId },
      select: { status: true },
    }),
  ).resolves.toEqual({ status: "attention_required" });
  return { graph, operation, controls, backend, approval, attempt };
}

function makeWorker(input: {
  graph: DurableGraph;
  operation: Record<string, unknown>;
  controls: SessionControlAdapterSet;
  checkpoints: OperationCheckpointRepositoryAdapter;
  backend: DurableFakeRuntimeBackend;
}) {
  const runtime = runtimeFor(input.backend);
  const repository = new OperationRepositoryAdapter(prisma as never);
  const registry = new OperationHandlerRegistryService();
  const lifecycleGate = new OperationLifecycleGateService();
  lifecycleGate.open();
  const coordinator = new CompositeOperationCoordinatorService(
    registry,
    repository,
    lifecycleGate,
  );
  const operations = new OperationRunService(
    registry,
    repository,
    coordinator,
    lifecycleGate,
  );
  const runtimeControl = new AgentSessionRuntimeControlService(
    new PrismaAgentConversationEventTransaction(prisma as never),
    new InProcessAgentConversationLivePublisher(),
    () => new Date(),
  );
  const continuations = new AgentSessionOperationContinuationService(
    input.controls as never,
    input.controls as never,
    input.controls as never,
    lifecycleGate,
    { requireCompatible: vi.fn(() => runtime) } as never,
  );
  const approvals = new AgentSessionApprovalService(
    input.controls as never,
    input.controls as never,
    runtimeControl,
    { areCurrent: vi.fn().mockResolvedValue(true) } as never,
    operations,
    continuations,
    () => new Date(),
  );
  const handler = makeHandler({
    ...input,
    runtime,
    records: [],
    runtimeControl,
    approvals,
    operations: repository,
    registry,
  });
  handler.handler.onModuleInit();
  const dispatcher = new OperationDispatcherService(
    registry,
    repository,
    coordinator,
  );
  const attemptExecutor = new OperationAttemptExecutorService(
    dispatcher,
    repository,
  );
  return {
    worker: new OperationRunWorkerService(
      attemptExecutor,
      repository,
      coordinator,
      lifecycleGate,
    ),
    runtime,
    approvals,
  };
}

async function runWorkerTick(worker: OperationRunWorkerService): Promise<void> {
  await worker.tick();
  await worker.drainUntil(Date.now() + 5_000, true);
}

function recoveryCapabilityInvocation(
  controls: SessionControlAdapterSet,
) {
  const execute = vi.fn(async () => ({ outputSummary: { recovered: true } }));
  const capabilities = new AgentCapabilityRegistry();
  capabilities.register({
    key: RECOVERY_CAPABILITY,
    ownerDomain: "inventory",
    executionKind: "tool",
    inputSchema: z.object({ reason: z.literal("approval_recovery") }).strict(),
    outputSchema: z.object({ recovered: z.literal(true) }).strict(),
    sideEffects: ["read"],
    approvalRisk: "none",
    idempotencyKey: () => null,
    execute,
  });
  return {
    execute,
    service: new AgentSessionCapabilityInvocationService(
      new PrismaAgentExecutionQueryRepository(prisma as never),
      controls,
      capabilities,
      new PrismaAgentConversationEventTransaction(prisma as never),
    ),
  };
}

function runtimeFor(backend: DurableFakeRuntimeBackend) {
  return {
    runtimeType: "hermes_http",
    capabilities: {
      detached: true,
      reconnect: true,
      interrupt: true,
      cancel: true,
      inspect: true,
    },
    start: vi.fn((context: { attemptId: string }) =>
      backend.start(context.attemptId),
    ),
    inspect: vi.fn(() => backend.inspect()),
    connect: vi.fn(() => backend.connect()),
    interrupt: vi.fn((_handle, input) => backend.interrupt(input)),
    cancel: vi.fn(() => backend.cancel()),
  };
}

class DurableFakeRuntimeBackend {
  private crashed = false;
  private approved = false;
  private approvalContinuationInvoked = false;
  private cancelled = false;

  constructor(
    private readonly graph: DurableGraph,
    private readonly mode: "crash" | "complete" | "approval" | "unknown",
    private readonly onApprovalResolved?: () => Promise<void>,
  ) {}

  async start(attemptId: string) {
    return this.handle(attemptId);
  }

  async inspect() {
    if (this.mode === "unknown") return { status: "unknown" as const };
    if (this.cancelled) return { status: "cancelled" as const };
    return { status: "running" as const };
  }

  async *connect() {
    if (this.mode === "crash" && !this.crashed) {
      this.crashed = true;
      yield { kind: "progress" as const, progress: 0.1, label: "checkpoint 1" };
      yield { kind: "progress" as const, progress: 0.5, label: "checkpoint 2" };
      yield { kind: "progress" as const, progress: 0.9, label: "checkpoint 3" };
      throw new Error("simulated worker interruption");
    }
    if (this.mode === "approval" && !this.approved) {
      yield {
        kind: "interrupt" as const,
        interruptId: "approval-recovery",
        payload: {
          capabilityKey: APPROVAL_CAPABILITY,
          arguments: { adjustment: 1 },
          summary: "재고 조정을 승인해야 합니다.",
          resourceVersions: [],
          expiresAt: "2099-08-14T00:00:00.000Z",
        },
      };
      return;
    }
    if (
      this.mode === "approval" &&
      this.approved &&
      !this.approvalContinuationInvoked
    ) {
      this.approvalContinuationInvoked = true;
      await this.onApprovalResolved?.();
    }
    yield {
      kind: "terminal" as const,
      status: this.cancelled ? ("cancelled" as const) : ("completed" as const),
      output: { ok: true },
    };
  }

  async interrupt(): Promise<void> {
    if (this.approved) return;
    this.approved = true;
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
  }

  private handle(attemptId: string) {
    return {
      runtimeType: "hermes_http",
      executionId: this.graph.executionId,
      attemptId,
      externalRunId: "external-durable-run-1",
      encryptedHandleRef: "vault://opaque-handle-1",
      generation: 1,
    };
  }
}

interface DurableGraph {
  sessionId: string;
  taskId: string;
  executionId: string;
  threadId: string;
  aguiRunId: string;
}

interface RunningAguiGraph extends DurableGraph {
  attemptId: string;
  startIntentId: string;
}

async function createRunningAguiGraph(): Promise<RunningAguiGraph> {
  const graph = await createRunningGraph();
  const startIntentId = randomUUID();
  await prisma!.agentVersion.update({
    where: { id: VERSION_ID },
    data: { runtimeType: "copilotkit_agui" },
  });
  await prisma!.agentExecution.update({
    where: { id: graph.executionId },
    data: { runtimeType: "copilotkit_agui" },
  });
  const attempt = await prisma!.agentExecutionAttempt.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      attemptNumber: 1,
      idempotencyKey: `agui-stop:${graph.executionId}`,
      runtimeType: "copilotkit_agui",
      externalRunId: graph.aguiRunId,
      encryptedHandleRef: "local://agui-stop",
      runtimeGeneration: 0,
      runtimeStartIntentId: startIntentId,
      runtimeCredentialGeneration: 0,
      state: "running",
    },
  });
  return { ...graph, attemptId: attempt.id, startIntentId };
}

async function createRunningGraph(
  capabilityKeys: string[] = [],
  agentDefinitionKey = "operator",
): Promise<DurableGraph> {
  const graphNonce = randomUUID();
  const assets = {
    prompt: {
      path: "agent-config/prompts/agents/manager.md",
      sha256: "a".repeat(64),
    },
    summaryPrompt: {
      path: "agent-config/prompts/system/session-summary.md",
      sha256: "b".repeat(64),
    },
    skills: [],
    outputSchema: null,
  };
  await prisma!.agentVersion.upsert({
    where: { id: VERSION_ID },
    create: {
      id: VERSION_ID,
      agentDefinitionKey,
      version: 1,
      displayName: "Operator",
      description: "Operator",
      runtimeType: "hermes_http",
      modelIdentity: "gpt-test",
      capabilityKeys,
      policyDocument: {},
      manifestHash: "a".repeat(64),
      runtimeManifest: {
        schemaVersion: 1,
        agentDefinitionKey,
        runtimeKind: "coordinator",
        runtimeType: "hermes_http",
        modelIdentity: "gpt-test",
        capabilityKeys,
        policyDocument: {},
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
        assets,
      },
      activatedAt: new Date(),
    },
    update: {},
  });
  await prisma!.agentAuthorityProfileVersion.upsert({
    where: {
      id_organizationId: {
        id: AUTHORITY_PROFILE_ID,
        organizationId: TEST_ORGANIZATION_ID,
      },
    },
    create: {
      id: AUTHORITY_PROFILE_ID,
      organizationId: TEST_ORGANIZATION_ID,
      profileKey: "foundation_read_only_probe",
      version: 1,
      capabilityKeys,
      policyDocument: {},
      policyHash: "b".repeat(64),
    },
    update: {},
  });
  const session = await prisma!.agentSession.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      createdByUserId: TEST_USER_ID,
      copilotThreadId: crypto.randomUUID(),
      primaryAgentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_PROFILE_ID,
      lifecycle: "active",
    },
  });
  const task = await prisma!.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      assignedAgentVersionId: VERSION_ID,
      isRoot: true,
      status: "running",
      idempotencyKey: "recovery-root",
    },
  });
  const policy = await prisma!.agentPolicySnapshot.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      agentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_PROFILE_ID,
      capabilityKeys,
      policyHash: "c".repeat(64),
    },
  });
  const currentInput = {
    userEvent: {
      externalEventId: `user-event:recovery:${graphNonce}`,
      schemaVersion: 1,
      payload: {
        phase: "complete",
        messageId: `message-recovery:${graphNonce}`,
        content: "recover",
      },
    },
  };
  const execution = await prisma!.agentExecution.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      sessionTaskId: task.id,
      copilotThreadId: session.copilotThreadId,
      aguiRunId: `run-recovery:${graphNonce}`,
      agentVersionId: VERSION_ID,
      runtimeType: "hermes_http",
      modelIdentity: "gpt-test",
      policySnapshotId: policy.id,
      inputHash: createHash("sha256")
        .update(JSON.stringify(currentInput))
        .digest("hex"),
      currentInput,
      resourceRefs: [],
      status: "running",
    },
  });
  await prisma!.agentConversationEvent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      executionId: execution.id,
      externalEventId: currentInput.userEvent.externalEventId,
      sequence: 1n,
      eventType: "user_message",
      schemaVersion: currentInput.userEvent.schemaVersion,
      payload: currentInput.userEvent.payload,
    },
  });
  await prisma!.agentSession.update({
    where: { id: session.id },
    data: { lastEventSequence: 1n },
  });
  return {
    sessionId: session.id,
    taskId: task.id,
    executionId: execution.id,
    threadId: session.copilotThreadId,
    aguiRunId: execution.aguiRunId,
  };
}

async function createMcpRunningGraph(input: {
  agentDefinitionKey?: "sourcing" | "listing" | "order";
  capabilityKeys?: string[];
} = {}): Promise<DurableGraph> {
  await seedAgentOs(prisma!);
  const agentDefinitionKey = input.agentDefinitionKey ?? "sourcing";
  const capabilityKeys = input.capabilityKeys ?? [
    "sourcing.retrieveWorkspaceEvidence",
    "sourcing.inspectRecommendationRun",
    "supply.submit_purchase_order",
  ];
  const authorityProfileKey = `mcp-root-${agentDefinitionKey}-${crypto.randomUUID()}`;
  const version = await prisma!.agentVersion.findFirstOrThrow({
    where: { agentDefinitionKey, activatedAt: { not: null } },
    orderBy: { version: "desc" },
  });
  const authority = await prisma!.agentAuthorityProfileVersion.create({
    data: {
      id: authorityProfileKey,
      organizationId: TEST_ORGANIZATION_ID,
      profileKey: authorityProfileKey,
      version: 1,
      capabilityKeys,
      policyDocument: {},
      policyHash: createHash("sha256").update("mcp-root-authority").digest("hex"),
    },
  });
  const session = await prisma!.agentSession.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      createdByUserId: TEST_USER_ID,
      copilotThreadId: crypto.randomUUID(),
      primaryAgentVersionId: version.id,
      authorityProfileVersionId: authority.id,
      lifecycle: "active",
    },
  });
  const task = await prisma!.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      assignedAgentVersionId: version.id,
      isRoot: true,
      status: "running",
      idempotencyKey: `mcp-root:${session.id}`,
    },
  });
  const policy = await prisma!.agentPolicySnapshot.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      agentVersionId: version.id,
      authorityProfileVersionId: authority.id,
      capabilityKeys,
      policyHash: createHash("sha256").update(`mcp-root:${session.id}`).digest("hex"),
    },
  });
  const currentInput = {
    userEvent: {
      externalEventId: `user-event:mcp-root:${session.id}`,
      schemaVersion: 1,
      payload: { phase: "complete", messageId: `message:${session.id}`, content: "read evidence" },
    },
  };
  const execution = await prisma!.agentExecution.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      sessionTaskId: task.id,
      copilotThreadId: session.copilotThreadId,
      aguiRunId: `mcp-root:${session.id}`,
      agentVersionId: version.id,
      runtimeType: version.runtimeType,
      modelIdentity: version.modelIdentity,
      policySnapshotId: policy.id,
      inputHash: createHash("sha256").update(JSON.stringify(currentInput)).digest("hex"),
      currentInput,
      resourceRefs: [],
      status: "running",
    },
  });
  await prisma!.agentConversationEvent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      executionId: execution.id,
      externalEventId: currentInput.userEvent.externalEventId,
      sequence: 1n,
      eventType: "user_message",
      schemaVersion: 1,
      payload: currentInput.userEvent.payload,
    },
  });
  await prisma!.agentSession.update({
    where: { id: session.id }, data: { lastEventSequence: 1n },
  });
  return {
    sessionId: session.id,
    taskId: task.id,
    executionId: execution.id,
    threadId: session.copilotThreadId,
    aguiRunId: execution.aguiRunId,
  };
}

async function createOperation(graph: DurableGraph) {
  const organization = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
  const session = formatAgentSessionName(
    organization,
    AgentSessionIdSchema.parse(graph.sessionId),
  );
  const task = formatAgentSessionTaskName(
    organization,
    AgentSessionIdSchema.parse(graph.sessionId),
    AgentSessionTaskIdSchema.parse(graph.taskId),
  );
  const execution = formatAgentExecutionName(
    organization,
    AgentSessionIdSchema.parse(graph.sessionId),
    AgentExecutionIdSchema.parse(graph.executionId),
  );
  const created = await new PrismaAgentSessionOwnedOperationTransaction(
    prisma as never,
  ).createExecutionRun({
    signal: new AbortController().signal,
    organizationId: TEST_ORGANIZATION_ID,
    sessionId: graph.sessionId,
    taskId: graph.taskId,
    executionId: graph.executionId,
    requestedByUserId: null,
    idempotencyKey: `recovery:${graph.executionId}`,
    definition: SESSION_TASK_DEFINITION,
    parsedInput: { session, task, execution },
  });
  return {
    runId: created.operationRunId,
    attemptId: created.attemptId,
    organizationId: TEST_ORGANIZATION_ID,
    operationKey: SESSION_TASK_DEFINITION.key,
    input: { session, task, execution },
    requestedByUserId: null,
    scheduleId: null,
    parentRunId: null,
    attemptToken: "durable-recovery-token",
    signal: new AbortController().signal,
    checkpoint: async () => undefined,
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
