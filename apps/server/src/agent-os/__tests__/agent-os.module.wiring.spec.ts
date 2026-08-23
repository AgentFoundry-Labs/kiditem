import { MODULE_METADATA } from "@nestjs/common/constants";
import { Inject, Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PrismaModule } from "../../prisma/prisma.module";
import { OperationServerLifecycleService } from "../../operations/application/service/operation-server-lifecycle.service";
import { StorageModule } from "../../common/storage/storage.module";
import { StorageService } from "../../common/storage/storage.service";
import { AgentRuntimeApplicationModule } from "../../agent-runtime-application.module";
import { PrismaService } from '../../prisma/prisma.service';
import { AgentAttemptExecutorService } from '../adapter/out/runtime/attempt/agent-attempt-executor.service';
import { AttemptMcpBrokerService } from '../adapter/in/mcp/attempt-mcp-broker.service';
import { AgentMcpApplicationModule } from "../../agent-mcp-application.module";
import { AgentOsCatalogModule } from "../agent-os-catalog.module";
import { AgentOsCapabilityModule } from "../agent-os-capability.module";
import { AgentOsLegacyRunModule } from "../agent-os-legacy-run.module";
import { AgentOsRuntimeSupportModule } from "../agent-os-runtime-support.module";
import { AgentOsWorkerModule } from "../agent-os-worker.module";
import { OperationsWorkerModule } from '../../operations/operations.module';
import { AgentOsModule } from "../agent-os.module";
import { StorageAgentSessionArtifactAdapter } from "../adapter/out/storage/storage-agent-session-artifact.adapter";
import { OperationDefinitionSnapshotAdapter } from "../adapter/out/operation/operation-definition-snapshot.adapter";
import { AgentOsCopilotKitController } from "../adapter/in/http/interaction/agent-os-copilotkit.controller";
import { AGENT_SESSION_ARTIFACT_WRITER_PORT } from "../application/port/in/session-execution/agent-session-artifact-writer.port";
import { AGENT_SESSION_DELETION_EXECUTION_PORT } from "../application/port/in/session-execution/agent-session-deletion-execution.port";
import { AGENT_SESSION_DELETION_PORT } from "../application/port/in/session-control/agent-session-deletion.port";
import { AGENT_SESSION_CANCELLATION_PORT } from "../application/port/in/session-control/agent-session-cancellation.port";
import { AGENT_SESSION_RUNTIME_CLEANUP_PORT } from "../application/port/out/runtime/agent-session-runtime-cleanup.port";
import { AGENT_SESSION_DELETION_EXECUTION_TRANSACTION } from "../application/port/out/transaction/session-deletion/agent-session-deletion-execution.transaction.port";
import { AGENT_SESSION_OWNED_OPERATION_PORT } from "../application/port/in/session-control/agent-session-owned-operation.port";
import { AGENT_JUDGMENT_SUBMISSION_PORT } from '../application/port/in/judgment/agent-judgment-submission.port';
import type { AgentSessionOwnedOperationPort } from "../application/port/in/session-control/agent-session-owned-operation.port";
import { AGENT_SESSION_OPERATION_PLATFORM_PORT } from "../application/port/out/operation/agent-session-operation-platform.port";
import { AGENT_INTERACTION_BOOTSTRAP_PORT } from "../application/port/in/interaction/agent-interaction-bootstrap.port";
import { AGENT_INTERACTION_AUTHORIZATION_PORT } from "../application/port/in/interaction/agent-interaction-authorization.port";
import { AGENT_AGUI_PRODUCER_PORT } from "../application/port/in/interaction/agent-agui-producer.port";
import { AGENT_SESSION_TASK_EXECUTION_PORT } from "../application/port/in/session-execution/agent-session-task-execution.port";
import { AGENT_SESSION_CAPABILITY_INVOCATION_PORT } from "../application/port/in/session-capability/agent-capability-invocation.port";
import { AGENT_SESSION_CONTROL_QUERY_REPOSITORY } from "../application/port/out/repository/session-control/agent-session-control-query.repository.port";
import { AGENT_DELEGATION_TRANSACTION } from "../application/port/out/transaction/session-control/agent-delegation.transaction.port";
import { AGENT_ATTEMPT_OPERATION_TRANSACTION } from "../application/port/out/transaction/session-control/agent-attempt-operation.transaction.port";
import { AGENT_APPROVAL_CONTINUATION_TRANSACTION } from "../application/port/out/transaction/session-control/agent-approval-continuation.transaction.port";
import { AGENT_SESSION_TRANSITION_TRANSACTION } from "../application/port/out/transaction/session-control/agent-session-transition.transaction.port";
import { AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION } from "../application/port/out/transaction/session-control/agent-session-artifact-materialization.transaction.port";
import { AGENT_SESSION_CANCELLATION_TRANSACTION } from "../application/port/out/transaction/session-control/agent-session-cancellation.transaction.port";
import { AGENT_CONVERSATION_LIVE_PUBLISHER } from "../application/port/out/event/agent-conversation-live-publisher.port";
import { AGENT_VERSION_REPOSITORY } from "../application/port/out/repository/agent-version.repository.port";
import { AgentCatalogService } from "../application/service/agent-catalog.service";
import { AgentRuntimeAdapterRegistry } from "../application/service/agent-runtime-adapter.registry";
import { AgentSessionCapabilityInvocationService } from "../application/service/agent-session-capability-invocation.service";
import { AgentInteractionService } from "../application/service/agent-interaction.service";
import { AgentRunWorker } from "../application/service/agent-run-worker.service";
import { AgentRunCoordinator } from "../application/service/agent-run-coordinator.service";
import { AgentRunExecutor } from "../application/service/agent-run-executor.service";
import { AgentRunGraphService } from "../application/service/agent-run-graph.service";
import { AgentApprovalService } from "../application/service/agent-approval.service";
import { AgentConversationService } from "../application/service/agent-conversation.service";
import { AgentObservabilityService } from "../application/service/agent-observability.service";
import { AgentSessionArtifactWriterService } from "../application/service/session-execution/agent-session-artifact-writer.service";
import { AgentSessionOwnedOperationService } from "../application/service/session-control/agent-session-owned-operation.service";
import { AgentSessionCancellationService } from "../application/service/session-control/agent-session-cancellation.service";
import { AgentSessionTaskExecutionService } from "../application/service/session-execution/agent-session-task-execution.service";
import { AgentSessionTaskOperationAdapter } from "../adapter/in/operation/session-execution/agent-session-task.operation-adapter";
import { AgentInlineRunReconciler } from "../application/service/agent-inline-run-reconciler.service";
import { AgentRuntimeCatalogStartupValidator } from "../application/service/agent-runtime-catalog-startup-validator.service";
import { AgentAguiProducerCoordinator } from "../application/service/agent-agui-producer-coordinator.service";
import { AgentOsApiExecutionModule } from "../agent-os-api-execution.module";
import { AgentOsHttpModule } from "../agent-os-http.module";
import { AgentOsInteractionHttpModule } from "../agent-os-interaction-http.module";
import { AgentOsSessionModule } from "../agent-os-session.module";
import { AgentSessionDeletionController } from "../adapter/in/http/session-control/agent-session-deletion.controller";
import { AgentSessionDeletionOperationHandler } from "../adapter/in/operation/agent-session-deletion.operation-handler";
import { AgentSessionDeletionService } from "../application/service/session-control/agent-session-deletion.service";
import { AgentSessionDeletionFinalizerRecoveryService } from "../application/service/session-control/agent-session-deletion-finalizer-recovery.service";
import { AgentSessionDeletionRecoveryService } from "../application/service/session-control/agent-session-deletion-recovery.service";
import { AgentJudgmentDispatchRecoveryService } from '../application/service/session-control/agent-judgment-dispatch-recovery.service';
import { PrismaAgentSessionDeletionCommandTransaction } from "../adapter/out/transaction/session-deletion/prisma-agent-session-deletion-command.transaction";
import { PrismaAgentSessionDeletionFinalizationTransaction } from "../adapter/out/transaction/session-deletion/prisma-agent-session-deletion-finalization.transaction";
import { PrismaAgentSessionDeletionQueryRepository } from "../adapter/out/repository/session-deletion/prisma-agent-session-deletion-query.repository";
import { LocalCliRuntimeStartupRegistrar } from "../adapter/out/runtime/local-cli-runtime-registrar";
import { PrismaAguiRuntimeCleanupDependencies } from "../adapter/out/runtime/prisma-agui-runtime-cleanup-dependencies";
import { AGUI_RUNTIME_CLEANUP_DEPENDENCIES } from "../application/port/out/runtime/agent-agui-runtime-cleanup.port";
import { AgentAguiInProcessRunRegistry } from "../application/service/agent-agui-in-process-run-registry.service";

const imports = (module: unknown) =>
  Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? [];
const providers = (module: unknown) =>
  Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) ?? [];
const exportsOf = (module: unknown) =>
  Reflect.getMetadata(MODULE_METADATA.EXPORTS, module) ?? [];
const controllers = (module: unknown) =>
  Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? [];

@Injectable()
class OwnedOperationPortConsumer {
  constructor(
    @Inject(AGENT_SESSION_OWNED_OPERATION_PORT)
    readonly owned: AgentSessionOwnedOperationPort,
    @Inject(AGENT_SESSION_ARTIFACT_WRITER_PORT)
    readonly writer: unknown,
  ) {}
}

@Module({
  imports: [EventEmitterModule.forRoot(), AgentOsApiExecutionModule],
  providers: [OwnedOperationPortConsumer],
})
class OwnedOperationPortConsumerModule {}

@Injectable()
class PlatformPortConsumer {
  constructor(
    @Inject(AGENT_SESSION_OPERATION_PLATFORM_PORT)
    readonly platform: unknown,
  ) {}
}

@Module({
  imports: [EventEmitterModule.forRoot(), AgentOsApiExecutionModule],
  providers: [PlatformPortConsumer],
})
class PlatformPortConsumerModule {}

describe("Agent OS artifact materialization composition", () => {
  it('resolves the API-owned Attempt executor and bound Unix-socket broker', async () => {
    process.env.AGENT_DEFAULT_MODEL = 'acceptance-test-model';
    const moduleRef = await Test.createTestingModule({
      imports: [AgentRuntimeApplicationModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(OperationServerLifecycleService)
      .useValue({})
      .compile();
    expect(moduleRef.get(AgentAttemptExecutorService)).toBeInstanceOf(AgentAttemptExecutorService);
    expect(moduleRef.get(AttemptMcpBrokerService)).toBeInstanceOf(AttemptMcpBrokerService);
    await moduleRef.close();
  });

  it("resolves StorageModule and the AgentOS API composition without reflected options dependencies", async () => {
    const storageModule = await Test.createTestingModule({
      imports: [StorageModule],
    }).compile();
    expect(storageModule.get(StorageService)).toBeInstanceOf(StorageService);
    await storageModule.close();

    process.env.AGENT_DEFAULT_MODEL = "acceptance-test-model";
    const agentOsModule = await Test.createTestingModule({
      imports: [OwnedOperationPortConsumerModule],
    })
      .overrideProvider(OperationServerLifecycleService)
      .useValue({})
      .compile();
    expect(agentOsModule.get(OwnedOperationPortConsumer).writer).toBeDefined();
    await agentOsModule.close();
  });

  it("composes Operations-backed owned execution only through the API wrapper", async () => {
    process.env.AGENT_DEFAULT_MODEL = "acceptance-test-model";
    const moduleRef = await Test.createTestingModule({
      imports: [OwnedOperationPortConsumerModule],
    })
      .overrideProvider(OperationServerLifecycleService)
      .useValue({})
      .compile();

    const owned = moduleRef.get(OwnedOperationPortConsumer).owned;
    expect(owned.startExecution).toBeTypeOf("function");
    expect(owned.startCapability).toBeTypeOf("function");
    expect(moduleRef.get(OwnedOperationPortConsumer).writer).toBeDefined();
    await moduleRef.close();
  });

  it("does not export the private Operations platform adapter from the API wrapper", async () => {
    process.env.AGENT_DEFAULT_MODEL = "acceptance-test-model";
    await expect(
      Test.createTestingModule({
        imports: [PlatformPortConsumerModule],
      })
        .overrideProvider(OperationServerLifecycleService)
        .useValue({})
        .compile(),
    ).rejects.toThrow(/AGENT_SESSION_OPERATION_PLATFORM_PORT/);
  });

  it("keeps owned-operation, platform, writer, and storage providers out of runtime and MCP roots", async () => {
    process.env.AGENT_DEFAULT_MODEL = "acceptance-test-model";
    for (const root of [
      AgentRuntimeApplicationModule,
      AgentMcpApplicationModule,
    ]) {
      const moduleRef = await Test.createTestingModule({
        imports: [root],
      })
        .overrideProvider(OperationServerLifecycleService)
        .useValue({})
        .compile();
      for (const provider of [
        AgentSessionOwnedOperationService,
        OperationDefinitionSnapshotAdapter,
        AgentSessionArtifactWriterService,
        StorageAgentSessionArtifactAdapter,
      ])
        expect(() => moduleRef.get(provider, { strict: true })).toThrow();
      await moduleRef.close();
    }
  });

  it("compiles the current interaction HTTP root through direct authorization and session ports", async () => {
    process.env.AGENT_DEFAULT_MODEL = "acceptance-test-model";
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), AgentOsInteractionHttpModule],
    })
      .overrideProvider(OperationServerLifecycleService)
      .useValue({})
      .overrideProvider(StorageService)
      .useValue({})
      .overrideProvider(AgentInlineRunReconciler)
      .useValue({ onModuleInit: async () => undefined })
      .overrideProvider(AgentRuntimeCatalogStartupValidator)
      .useValue({ onApplicationBootstrap: async () => undefined })
      .compile();

    expect(moduleRef.get(AgentOsCopilotKitController)).toBeDefined();
    expect(moduleRef.get(AGENT_INTERACTION_BOOTSTRAP_PORT)).toBeDefined();
    expect(moduleRef.get(AGENT_INTERACTION_AUTHORIZATION_PORT)).toBeDefined();
    expect(moduleRef.get(AGENT_AGUI_PRODUCER_PORT)).toBe(
      moduleRef.get(AgentAguiProducerCoordinator),
    );
    expect(moduleRef.get(AGENT_SESSION_TASK_EXECUTION_PORT)).toBe(
      moduleRef.get(AgentSessionTaskExecutionService),
    );
    expect(moduleRef.get(AGUI_RUNTIME_CLEANUP_DEPENDENCIES)).toBeInstanceOf(
      PrismaAguiRuntimeCleanupDependencies,
    );
    expect(moduleRef.get(AgentAguiInProcessRunRegistry)).toBeInstanceOf(
      AgentAguiInProcessRunRegistry,
    );
    await moduleRef.close();
  });

  it("keeps the materialization transaction controller-free in the session module", () => {
    expect(exportsOf(AgentOsSessionModule)).toContain(
      AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION,
      AGENT_SESSION_CANCELLATION_TRANSACTION,
    );
    expect(controllers(AgentOsSessionModule)).toEqual([]);
  });

  it("composes storage and the writer only in the API execution wrapper", () => {
    expect(imports(AgentOsApiExecutionModule)).toContain(AgentOsSessionModule);
    expect(imports(AgentOsApiExecutionModule)).toContain(StorageModule);
    expect(providers(AgentOsApiExecutionModule)).toContain(
      StorageAgentSessionArtifactAdapter,
    );
    expect(providers(AgentOsApiExecutionModule)).toContain(
      AgentSessionArtifactWriterService,
    );
    expect(exportsOf(AgentOsApiExecutionModule)).toEqual([
      AGENT_SESSION_OWNED_OPERATION_PORT,
      AGENT_SESSION_CANCELLATION_PORT,
      AGENT_JUDGMENT_SUBMISSION_PORT,
      AGENT_SESSION_ARTIFACT_WRITER_PORT,
      AGENT_SESSION_DELETION_EXECUTION_PORT,
      AGENT_SESSION_DELETION_PORT,
    ]);
    expect(imports(AgentOsHttpModule)).toContain(AgentOsApiExecutionModule);
    expect(providers(AgentOsApiExecutionModule)).toContain(
      AgentSessionCancellationService,
    );
    expect(providers(AgentOsHttpModule)).not.toContain(
      AgentSessionCancellationService,
    );
  });

  it("composes the deletion HTTP controller only in the API HTTP wrapper", () => {
    const names = controllers(AgentOsHttpModule).map(
      (item: { name?: string }) => item.name,
    );
    expect(names).not.toContain("AgentInteractionSessionLifecycleController");
    expect(names).toContain("AgentSessionDeletionController");
    expect(controllers(AgentOsSessionModule)).not.toContain(
      AgentSessionDeletionController,
    );
  });

  it("registers deletion and judgment recovery hooks only in API execution composition", () => {
    const apiProviders = providers(AgentOsApiExecutionModule);
    expect(apiProviders).toEqual(expect.arrayContaining([
      AgentSessionDeletionService,
      PrismaAgentSessionDeletionCommandTransaction,
      PrismaAgentSessionDeletionQueryRepository,
      PrismaAgentSessionDeletionFinalizationTransaction,
      AgentSessionDeletionOperationHandler,
      AgentSessionDeletionFinalizerRecoveryService,
      AgentSessionDeletionRecoveryService,
      AgentJudgmentDispatchRecoveryService,
    ]));
    const sessionProviders = providers(AgentOsSessionModule);
    for (const provider of [
      AgentSessionDeletionService,
      PrismaAgentSessionDeletionCommandTransaction,
      PrismaAgentSessionDeletionQueryRepository,
      PrismaAgentSessionDeletionFinalizationTransaction,
      AgentSessionDeletionOperationHandler,
      AgentSessionDeletionFinalizerRecoveryService,
      AgentSessionDeletionRecoveryService,
      AgentJudgmentDispatchRecoveryService,
    ]) expect(sessionProviders).not.toContain(provider);
  });

  it("keeps the public facade controller-free and focused on catalog, capability, and session ownership", () => {
    expect(imports(AgentOsModule)).toEqual([
      AgentOsCatalogModule,
      AgentOsCapabilityModule,
      AgentOsSessionModule,
    ]);
    expect(controllers(AgentOsModule)).toEqual([]);
  });

  it("keeps the session core controller-free and free of HTTP, Operations, and storage ownership", () => {
    expect(imports(AgentOsSessionModule)).toEqual([
      PrismaModule,
      AgentOsCatalogModule,
      AgentOsCapabilityModule,
      AgentOsRuntimeSupportModule,
    ]);
    expect(imports(AgentOsSessionModule)).not.toContain(StorageModule);
    expect(controllers(AgentOsSessionModule)).toEqual([]);
    expect(providers(AgentOsSessionModule)).not.toContain(
      StorageAgentSessionArtifactAdapter,
    );
    expect(providers(AgentOsSessionModule)).not.toContain(
      AgentSessionArtifactWriterService,
    );
  });

  it("keeps task execution orchestration in HTTP while artifact storage remains API-only", () => {
    expect(providers(AgentOsHttpModule)).toContain(
      AgentSessionTaskExecutionService,
    );
    expect(providers(AgentOsHttpModule)).toContain(
      AgentSessionTaskOperationAdapter,
    );
    expect(providers(AgentOsHttpModule)).not.toContain(
      StorageAgentSessionArtifactAdapter,
    );
    expect(providers(AgentOsHttpModule)).not.toContain(
      AgentSessionArtifactWriterService,
    );
    expect(providers(AgentOsApiExecutionModule)).toContain(
      AgentSessionOwnedOperationService,
    );
  });

  it("keeps HTTP and Operations composition outside the shared Agent OS facade", () => {
    const sharedProviders = providers(AgentOsModule);
    for (const provider of [
      AgentSessionTaskExecutionService,
      AgentSessionTaskOperationAdapter,
      AgentSessionOwnedOperationService,
      StorageAgentSessionArtifactAdapter,
      AgentSessionArtifactWriterService,
    ])
      expect(sharedProviders).not.toContain(provider);
    expect(imports(AgentOsModule)).not.toContain(AgentOsApiExecutionModule);
    expect(imports(AgentOsModule)).not.toContain(AgentOsLegacyRunModule);
  });

  it("keeps the worker wrapper confined to legacy generic-run composition", () => {
    expect(imports(AgentOsWorkerModule)).toEqual([OperationsWorkerModule]);
    expect(providers(AgentOsWorkerModule)).toEqual([]);
    expect(imports(AgentOsWorkerModule)).not.toContain(
      AgentOsApiExecutionModule,
    );
  });

  it("composes the MCP executor only from official controller-free session seams", () => {
    const runtime = readFileSync(
      resolve(__dirname, "..", "..", "agent-runtime-application.module.ts"),
      "utf8",
    );
    const mcp = readFileSync(
      resolve(__dirname, "..", "..", "agent-mcp-application.module.ts"),
      "utf8",
    );
    const legacy = readFileSync(
      resolve(__dirname, "..", "agent-os-legacy-run.module.ts"),
      "utf8",
    );
    const roots = `${runtime}\n${mcp}`;
    expect(roots).not.toMatch(
      /AgentOsLegacyRunModule|Operations(?:Http)?Module|AgentOsApiExecutionModule|AgentOsHttpModule|AGENT_API_CAPABILITY_GRANT/,
    );
    expect(roots).not.toMatch(/Controller|APP_GUARD|INTERACTION_.*(?:SECRET|HMAC)/);
    expect(legacy).not.toContain("AgentOsMcpToolExecutor");
    expect(legacy).not.toContain("AGENT_OS_MCP_TOOL_EXECUTION_PORT");
  });

  it('keeps legacy generic runs free of capability grants and MCP child attachment', () => {
    const legacy = readFileSync(
      resolve(__dirname, '..', 'agent-os-legacy-run.module.ts'),
      'utf8',
    );
    const localCli = readFileSync(
      resolve(__dirname, '..', 'adapter/out/runtime/agent-local-cli-runtime.adapter.ts'),
      'utf8',
    );

    expect(legacy).not.toMatch(/AGENT_(?:API_CAPABILITY_GRANT|MCP_SESSION)_PORT/);
    expect(legacy).not.toMatch(/AgentApiCapabilityGrantService|KidItemMcpSessionAdapter/);
    expect(localCli).not.toMatch(/AGENT_MCP_SESSION_PORT|KidItemMcpSessionAdapter/);
  });

  it("removes lifecycle key and maintenance composition from controller-free roots", () => {
    for (const path of [
      resolve(__dirname, "..", "agent-os-api-execution.module.ts"),
      resolve(__dirname, "..", "agent-os-session.module.ts"),
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("INTERACTION_LIFECYCLE_HMAC_KEY");
      expect(source).not.toContain("agent-session-lifecycle-maintenance");
      expect(source).not.toContain("AgentSessionDeletionController");
    }
  });

  it("keeps official session persistence and materialization transactions in the session module", () => {
    const sessionProviders = providers(AgentOsSessionModule);
    for (const token of [
      AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
      AGENT_DELEGATION_TRANSACTION,
      AGENT_ATTEMPT_OPERATION_TRANSACTION,
      AGENT_APPROVAL_CONTINUATION_TRANSACTION,
      AGENT_SESSION_TRANSITION_TRANSACTION,
      AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION,
      AGENT_SESSION_CANCELLATION_TRANSACTION,
      AGENT_CONVERSATION_LIVE_PUBLISHER,
      AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
      AGENT_SESSION_RUNTIME_CLEANUP_PORT,
      AGENT_SESSION_DELETION_EXECUTION_TRANSACTION,
    ])
      expect(sessionProviders).toContainEqual(
        expect.objectContaining({ provide: token }),
      );
    expect(sessionProviders).toContain(AgentRuntimeAdapterRegistry);
    expect(sessionProviders).toContain(AgentSessionCapabilityInvocationService);
  });

  it("keeps catalog and capability ownership in their focused modules", () => {
    expect(providers(AgentOsCatalogModule)).toContain(AgentCatalogService);
    expect(providers(AgentOsCatalogModule)).toContainEqual(
      expect.objectContaining({ provide: AGENT_VERSION_REPOSITORY }),
    );
    expect(controllers(AgentOsCapabilityModule)).toEqual([]);
  });

  it("exports durable session seams but not artifact storage implementation detail", () => {
    const sessionExports = exportsOf(AgentOsSessionModule);
    for (const token of [
      AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
      AGENT_DELEGATION_TRANSACTION,
      AGENT_ATTEMPT_OPERATION_TRANSACTION,
      AGENT_APPROVAL_CONTINUATION_TRANSACTION,
      AGENT_SESSION_TRANSITION_TRANSACTION,
      AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION,
      AGENT_CONVERSATION_LIVE_PUBLISHER,
      AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
      AGENT_SESSION_RUNTIME_CLEANUP_PORT,
      AGENT_SESSION_DELETION_EXECUTION_TRANSACTION,
    ])
      expect(sessionExports).toContain(token);
    expect(sessionExports).not.toContain(StorageAgentSessionArtifactAdapter);
    expect(sessionExports).not.toContain(AgentSessionArtifactWriterService);
  });

  it("composes deletion execution only in the API wrapper without importing storage or Operations into session core", () => {
    expect(providers(AgentOsApiExecutionModule)).toContainEqual(
      expect.objectContaining({
        provide: AGENT_SESSION_DELETION_EXECUTION_PORT,
      }),
    );
    expect(exportsOf(AgentOsApiExecutionModule)).toContain(
      AGENT_SESSION_DELETION_EXECUTION_PORT,
    );
    expect(imports(AgentOsSessionModule)).not.toContain(StorageModule);
  });

  it("composes local CLI startup only in the API execution root", () => {
    const api = readFileSync(
      resolve(__dirname, "..", "agent-os-api-execution.module.ts"),
      "utf8",
    );
    const session = readFileSync(
      resolve(__dirname, "..", "agent-os-session.module.ts"),
      "utf8",
    );
    expect(api).not.toContain("validated-by-deletion-snapshot");
    expect(api).not.toContain("validateOwnedClosure");
    expect(providers(AgentOsApiExecutionModule)).toContainEqual(
      expect.objectContaining({ provide: LocalCliRuntimeStartupRegistrar }),
    );
    expect(providers(AgentOsSessionModule)).not.toContainEqual(
      expect.objectContaining({ provide: LocalCliRuntimeStartupRegistrar }),
    );
    expect(session).not.toContain("LocalCliRuntimeStartupRegistrar");
    expect(api).not.toContain("CodexCliRuntimeAdapter");
    expect(api).not.toContain("ClaudeCliRuntimeAdapter");
  });

  it("quarantines generic AgentRun providers in the legacy module", () => {
    const sessionProviders = providers(AgentOsSessionModule);
    for (const provider of [
      AgentInteractionService,
      AgentRunCoordinator,
      AgentRunExecutor,
      AgentRunGraphService,
      AgentApprovalService,
      AgentConversationService,
      AgentObservabilityService,
      AgentRunWorker,
    ])
      expect(sessionProviders).not.toContain(provider);
    expect(imports(AgentOsLegacyRunModule)).not.toContain(AgentOsSessionModule);
  });

  it("keeps legacy, automation, and readiness dependencies out of official session source composition", () => {
    const source = readFileSync(
      resolve(__dirname, "..", "agent-os-session.module.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /legacy-run|AgentRun(?:Coordinator|Executor|Worker|GraphService)|AgentInteractionService/,
    );
    expect(source).not.toMatch(
      /OperationAlertRuntimeModule|ReadinessStateModule|AgentRunOperationAlertBridge|AgentOsLiveReadinessAdapter/,
    );
    expect(source).not.toMatch(
      /AGENT_(?:RUNNER|INTERACTION|API_CAPABILITY_GRANT|OS_MCP_TOOL_EXECUTION)_PORT/,
    );
  });
});
