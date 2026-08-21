import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { AgentRuntimeApplicationModule } from "../../agent-runtime-application.module";
import { AgentMcpApplicationModule } from "../../agent-mcp-application.module";
import { DashboardCapabilityModule } from "../../analytics/dashboard/dashboard-capability.module";
import { ANALYTICS_OVERVIEW_CAPABILITY_PORT } from "../../analytics/dashboard/application/port/in/analytics-overview-capability.port";
import { OperationAlertRuntimeModule } from "../../automation/operation-alert-runtime.module";
import { OperationsModule } from "../../operations/operations.module";
import { OperationServerLifecycleService } from "../../operations/application/service/operation-server-lifecycle.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { StorageModule } from "../../common/storage/storage.module";
import { StorageService } from "../../common/storage/storage.service";
import { ReadinessStateModule } from "../../readiness/readiness-state.module";
import { AgentOsPlatformProbeCapabilityAdapter } from "../adapter/in/agent/agent-os-platform-probe-capability.adapter";
import { AnalyticsOverviewAgentCapabilityAdapter } from "../adapter/in/agent/analytics-overview-agent-capability.adapter";
import { AgentAguiController } from "../adapter/in/http/interaction/agent-agui.controller";
import { AgentApprovalsController } from "../adapter/in/http/legacy-run/agent-approvals.controller";
import { AgentCatalogController } from "../adapter/in/http/catalog/agent-catalog.controller";
import { AgentConversationsController } from "../adapter/in/http/legacy-run/agent-conversations.controller";
import { AgentExecutorController } from "../adapter/in/http/legacy-run/agent-executor.controller";
import { AgentInteractionActionsController } from "../adapter/in/http/interaction/agent-interaction-actions.controller";
import { AgentInteractionBootstrapController } from "../adapter/in/http/interaction/agent-interaction-bootstrap.controller";
import { AgentInteractionControlController } from "../adapter/in/http/interaction/agent-interaction-control.controller";
import { AgentInteractionSessionLifecycleController } from "../adapter/in/http/interaction/agent-interaction-session-lifecycle.controller";
import { AgentSessionLifecycleMaintenanceProcessor } from "../adapter/in/http/interaction/agent-session-lifecycle-maintenance.processor";
import { AgentRunObservabilityController } from "../adapter/in/http/legacy-run/agent-run-observability.controller";
import { AgentRunRequestsController } from "../adapter/in/http/legacy-run/agent-run-requests.controller";
import { AgentRunsQueryController } from "../adapter/in/http/legacy-run/agent-runs-query.controller";
import { AgentSessionController } from "../adapter/in/http/session-control/agent-session.controller";
import { InteractionGatewayGuard } from "../adapter/in/http/interaction/interaction-gateway.guard";
import { AgentSessionTaskOperationAdapter } from "../adapter/in/operation/session-execution/agent-session-task.operation-adapter";
import { OperationsSessionExecutionAdapter } from "../adapter/out/cross-domain/operations-session-execution.adapter";
import { AgentRunOperationAlertBridge } from "../adapter/out/automation/agent-run-operation-alert.bridge";
import { AgentOsLiveReadinessAdapter } from "../adapter/out/cross-domain/agent-os-live-readiness.adapter";
import { InProcessAgentConversationLivePublisher } from "../adapter/out/event/in-process-agent-conversation-live-publisher.adapter";
import { InteractionProductAnalyticsAdapter } from "../adapter/out/event/interaction-product-analytics.adapter";
import { StorageAgentSessionArtifactEraser } from "../adapter/out/storage/storage-agent-session-artifact-eraser.adapter";
import { PrismaAgentSessionQueryRepository } from "../adapter/out/repository/interaction/prisma-agent-session-query.repository";
import { PrismaAgentConversationQueryRepository } from "../adapter/out/repository/interaction/prisma-agent-conversation-query.repository";
import { PrismaAgentExecutionQueryRepository } from "../adapter/out/repository/interaction/prisma-agent-execution-query.repository";
import { PrismaAgentRunAuthorizationTransaction } from "../adapter/out/transaction/interaction/prisma-agent-run-authorization.transaction";
import { PrismaAgentConversationEventTransaction } from "../adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction";
import { PrismaAgentExecutionUsageTransaction } from "../adapter/out/transaction/interaction/prisma-agent-execution-usage.transaction";
import { PrismaAgentSessionLifecycleTransaction } from "../adapter/out/transaction/interaction/prisma-agent-session-lifecycle.transaction";
import { PrismaAgentSessionLifecycleMaintenanceTransaction } from "../adapter/out/transaction/interaction/prisma-agent-session-lifecycle-maintenance.transaction";
import { PrismaAgentSessionControlQueryRepository } from "../adapter/out/repository/session-control/prisma-agent-session-control-query.repository";
import { PrismaAgentDelegationTransaction } from "../adapter/out/transaction/session-control/prisma-agent-delegation.transaction";
import { PrismaAgentAttemptOperationTransaction } from "../adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction";
import { PrismaAgentApprovalContinuationTransaction } from "../adapter/out/transaction/session-control/prisma-agent-approval-continuation.transaction";
import { PrismaAgentSessionTransitionTransaction } from "../adapter/out/transaction/session-control/prisma-agent-session-transition.transaction";
import { PrismaAgentVersionRepository } from "../adapter/out/repository/prisma-agent-version.repository";
import { AgentLocalCliRuntimeAdapter } from "../adapter/out/runtime/agent-local-cli-runtime.adapter";
import { AgentLocalProcessRegistry } from "../adapter/out/runtime/agent-local-process-registry";
import { HermesRuntimeStartupRegistrar } from "../adapter/out/runtime/hermes-runtime-registrar";
import { KidItemMcpSessionAdapter } from "../adapter/out/runtime/kiditem-mcp-session.adapter";
import { OpenAiResponsesAguiRuntimeAdapter } from "../adapter/out/runtime/openai-responses-agui-runtime.adapter";
import { OpenAiResponsesOperatorRuntimeAdapter } from "../adapter/out/runtime/openai-responses-operator-runtime.adapter";
import { OperatorRuntimeHandler } from "../adapter/out/runtime/operator-runtime.handler";
import { AGENT_AGUI_RUNNER_PORT } from "../application/port/in/agent-agui-runner.port";
import { AGENT_RUNNER_PORT } from "../application/port/in/agent-runner.port";
import { AGENT_AGUI_PRODUCER_PORT } from "../application/port/in/interaction/agent-agui-producer.port";
import { AGENT_CATALOG_PORT } from "../application/port/in/catalog/agent-catalog.port";
import { AGENT_INTERACTION_AUTHORIZATION_PORT } from "../application/port/in/interaction/agent-interaction-authorization.port";
import { AGENT_INTERACTION_BOOTSTRAP_PORT } from "../application/port/in/interaction/agent-interaction-bootstrap.port";
import { AGENT_INTERACTION_PRESENTATION_PORT } from "../application/port/in/interaction/agent-interaction-presentation.port";
import { AGENT_INTERACTION_SESSION_LIFECYCLE_PORT } from "../application/port/in/interaction/agent-interaction-session-lifecycle.port";
import { AGENT_SESSION_LIFECYCLE_MAINTENANCE_PORT } from "../application/port/in/interaction/agent-session-lifecycle-maintenance.port";
import { AGENT_SESSION_APPROVAL_DECISION_PORT } from "../application/port/in/session-control/agent-session-approval-decision.port";
import { AGENT_SESSION_TASK_CONTROL_PORT } from "../application/port/in/session-control/agent-session-task-control.port";
import { AGENT_SESSION_TASK_EXECUTION_PORT } from "../application/port/in/session-execution/agent-session-task-execution.port";
import { AGENT_INTERACTION_PORT } from "../application/port/in/legacy-run/agent-interaction.port";
import {
  LEGACY_AGENT_APPROVAL_PORT,
  LEGACY_AGENT_CONVERSATION_PORT,
  LEGACY_AGENT_OBSERVABILITY_PORT,
  LEGACY_AGENT_RUN_EXECUTION_PORT,
  LEGACY_AGENT_RUN_GRAPH_PORT,
} from "../application/port/in/legacy-run/legacy-agent-run.port";
import { AGENT_SESSION_CAPABILITY_INVOCATION_PORT } from "../application/port/in/session-capability/agent-capability-invocation.port";
import { AGENT_OS_LIVE_READINESS_PORT } from "../application/port/out/cross-domain/agent-os-live-readiness.port";
import { AGENT_CONVERSATION_LIVE_PUBLISHER } from "../application/port/out/event/agent-conversation-live-publisher.port";
import { INTERACTION_PRODUCT_ANALYTICS_PORT } from "../application/port/out/event/interaction-product-analytics.port";
import { AGENT_SESSION_ARTIFACT_ERASER } from "../application/port/out/storage/agent-session-artifact-eraser.port";
import { AGENT_SESSION_QUERY_REPOSITORY } from "../application/port/out/repository/interaction/agent-session-query.repository.port";
import { AGENT_CONVERSATION_QUERY_REPOSITORY } from "../application/port/out/repository/interaction/agent-conversation-query.repository.port";
import { AGENT_EXECUTION_QUERY_REPOSITORY } from "../application/port/out/repository/interaction/agent-execution-query.repository.port";
import { AGENT_RUN_AUTHORIZATION_TRANSACTION } from "../application/port/out/transaction/interaction/agent-run-authorization.transaction.port";
import { AGENT_CONVERSATION_EVENT_TRANSACTION } from "../application/port/out/transaction/interaction/agent-conversation-event.transaction.port";
import { AGENT_EXECUTION_USAGE_TRANSACTION } from "../application/port/out/transaction/interaction/agent-execution-usage.transaction.port";
import { AGENT_SESSION_LIFECYCLE_TRANSACTION } from "../application/port/out/transaction/interaction/agent-session-lifecycle.transaction.port";
import { AGENT_SESSION_LIFECYCLE_MAINTENANCE_TRANSACTION } from "../application/port/out/transaction/interaction/agent-session-lifecycle-maintenance.transaction.port";
import { AGENT_SESSION_TOMBSTONE_HASHER } from "../application/port/out/crypto/agent-session-tombstone-hasher.port";
import { AGENT_SESSION_CONTROL_QUERY_REPOSITORY } from "../application/port/out/repository/session-control/agent-session-control-query.repository.port";
import { AGENT_DELEGATION_TRANSACTION } from "../application/port/out/transaction/session-control/agent-delegation.transaction.port";
import { AGENT_ATTEMPT_OPERATION_TRANSACTION } from "../application/port/out/transaction/session-control/agent-attempt-operation.transaction.port";
import { AGENT_APPROVAL_CONTINUATION_TRANSACTION } from "../application/port/out/transaction/session-control/agent-approval-continuation.transaction.port";
import { AGENT_SESSION_TRANSITION_TRANSACTION } from "../application/port/out/transaction/session-control/agent-session-transition.transaction.port";
import { OPERATIONS_SESSION_EXECUTION_PORT } from "../application/port/out/cross-domain/operations-session-execution.port";
import { AGENT_VERSION_REPOSITORY } from "../application/port/out/repository/agent-version.repository.port";
import { AGENT_MCP_SESSION_PORT } from "../application/port/out/runtime/agent-mcp-session.port";
import { AgentAguiProducerCoordinator } from "../application/service/agent-agui-producer-coordinator.service";
import { AgentAguiRunService } from "../application/service/agent-agui-run.service";
import { AgentCatalogService } from "../application/service/agent-catalog.service";
import { AgentAguiRuntimeRegistry } from "../application/service/agent-agui-runtime-registry.service";
import { AgentApprovalService } from "../application/service/agent-approval.service";
import { AgentConversationService } from "../application/service/agent-conversation.service";
import { AgentCapabilityRegistry } from "../application/service/agent-capability-registry.service";
import { AgentInlineRunReconciler } from "../application/service/agent-inline-run-reconciler.service";
import { AgentInteractionAuthorizationService } from "../application/service/interaction/agent-interaction-authorization.service";
import { AgentInteractionBootstrapService } from "../application/service/interaction/agent-interaction-bootstrap.service";
import { AgentInteractionSessionLifecycleService } from "../application/service/interaction/agent-interaction-session-lifecycle.service";
import { AgentSessionLifecycleMaintenanceService } from "../application/service/interaction/agent-session-lifecycle-maintenance.service";
import { InteractionAllowedVersionResolver } from "../application/service/interaction/interaction-allowed-version-resolver";
import { AgentInteractionPresentationService } from "../application/service/agent-interaction-presentation.service";
import { AgentInteractionService } from "../application/service/agent-interaction.service";
import {
  INTERACTION_CLOCK,
  INTERACTION_GATEWAY_SHARED_SECRET,
  INTERACTION_PRINCIPAL_HMAC_KEY,
  INTERACTION_REPLAY_CURSOR_HMAC_KEY,
  INTERACTION_RUN_INTENT_HMAC_KEY,
} from "../application/port/in/interaction/interaction-gateway-config.port";
import { AgentOsMcpToolExecutor } from "../application/service/agent-os-mcp-tool-executor.service";
import { AgentPlanValidator } from "../application/service/agent-plan-validator.service";
import { AgentRunWorker } from "../application/service/agent-run-worker.service";
import { AgentRunCoordinator } from "../application/service/agent-run-coordinator.service";
import { AgentRunExecutor } from "../application/service/agent-run-executor.service";
import { AgentRunGraphService } from "../application/service/agent-run-graph.service";
import { AgentRuntimeHandlerRegistry } from "../application/service/agent-runtime-handler-registry.service";
import { AgentToolRouter } from "../application/service/agent-tool-router.service";
import { AgentObservabilityService } from "../application/service/agent-observability.service";
import { AgentRuntimeAdapterRegistry } from "../application/service/agent-runtime-adapter.registry";
import { AgentSessionApprovalService } from "../application/service/session-control/agent-session-approval.service";
import { AgentSessionCancellationService } from "../application/service/session-control/agent-session-cancellation.service";
import { AgentSessionCapabilityInvocationService } from "../application/service/agent-session-capability-invocation.service";
import { AgentSessionDelegationService } from "../application/service/session-control/agent-session-delegation.service";
import { AgentSessionExecutionService } from "../application/service/session-control/agent-session-execution.service";
import { AgentSessionOperationContinuationService } from "../application/service/session-control/agent-session-operation-continuation.service";
import { AgentSessionRuntimeControlService } from "../application/service/session-control/agent-session-runtime-control.service";
import { AgentSessionTaskControlService } from "../application/service/session-control/agent-session-task-control.service";
import { AgentSessionTaskDispatchService } from "../application/service/session-control/agent-session-task-dispatch.service";
import { AgentSessionTaskExecutionService } from "../application/service/session-execution/agent-session-task-execution.service";
import { AgentTaskDelegationService } from "../application/service/agent-task-delegation.service";
import { AgentVersionPublisher } from "../application/service/agent-version-publisher.service";
import { AgentRuntimeCatalogStartupValidator } from "../application/service/agent-runtime-catalog-startup-validator.service";
import { KidItemMcpToolRegistry } from "../application/service/kiditem-mcp-tool-registry.service";
import { OperatorContextBuilder } from "../application/service/operator-context-builder.service";
import { OperatorDecisionExecutor } from "../application/service/operator-decision-executor.service";
import { OperatorDecisionParser } from "../application/service/operator-decision-parser.service";
import { AgentOsHttpModule } from "../agent-os-http.module";
import { AgentOsCatalogModule } from "../agent-os-catalog.module";
import { AgentOsCapabilityModule } from "../agent-os-capability.module";
import { AgentOsLegacyRunModule } from "../agent-os-legacy-run.module";
import { AgentOsSessionModule } from "../agent-os-session.module";
import { AgentOsRuntimeSupportModule } from "../agent-os-runtime-support.module";
import { AgentOsWorkerModule } from "../agent-os-worker.module";
import { AgentOsModule } from "../agent-os.module";

const IMPORTS_KEY = MODULE_METADATA.IMPORTS;
const CONTROLLERS_KEY = MODULE_METADATA.CONTROLLERS;
const PROVIDERS_KEY = MODULE_METADATA.PROVIDERS;
const EXPORTS_KEY = MODULE_METADATA.EXPORTS;
const SELF_DECLARED_DEPS_KEY = "self:paramtypes";

const HTTP_CONTROLLERS = [
  AgentCatalogController,
  AgentRunRequestsController,
  AgentExecutorController,
  AgentRunsQueryController,
  AgentRunObservabilityController,
  AgentApprovalsController,
  AgentConversationsController,
  AgentInteractionBootstrapController,
  AgentInteractionControlController,
  AgentAguiController,
  AgentInteractionActionsController,
  AgentInteractionSessionLifecycleController,
  AgentSessionController,
];

describe("Agent OS process-root wiring", () => {
  it("resolves the HTTP bootstrap controller through its declared input port", async () => {
    process.env.INTERACTION_GATEWAY_SHARED_SECRET = "a".repeat(32);
    process.env.INTERACTION_ANALYTICS_HMAC_KEY = "b".repeat(32);
    process.env.INTERACTION_PRINCIPAL_HMAC_KEY = "c".repeat(32);
    process.env.INTERACTION_RUN_INTENT_HMAC_KEY = "d".repeat(32);
    process.env.INTERACTION_REPLAY_CURSOR_HMAC_KEY = "e".repeat(32);
    process.env.INTERACTION_LIFECYCLE_HMAC_KEY = "f".repeat(32);
    process.env.AGENT_DEFAULT_MODEL = "acceptance-test-model";

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), AgentOsHttpModule],
    })
      .overrideProvider(OperationServerLifecycleService)
      .useValue({})
      .overrideProvider(StorageService)
      .useValue({ extractKey: () => null, delete: async () => undefined })
      .overrideProvider(AGENT_SESSION_LIFECYCLE_MAINTENANCE_PORT)
      .useValue({ drain: async () => ({ erased: 0, deferred: 0, retried: 0, expiredAuditProjections: 0 }) })
      .compile();

    expect(moduleRef.get(AgentInteractionBootstrapController)).toBeDefined();
    expect(moduleRef.get(AGENT_INTERACTION_BOOTSTRAP_PORT)).toBeDefined();
    expect(moduleRef.get(AgentAguiController)).toBeDefined();
    expect(moduleRef.get(AgentInteractionSessionLifecycleController)).toBeDefined();
    expect(moduleRef.get(AGENT_INTERACTION_SESSION_LIFECYCLE_PORT)).toBeDefined();
    expect(moduleRef.get(AgentSessionLifecycleMaintenanceProcessor)).toBeDefined();
    expect(moduleRef.get(AGENT_AGUI_PRODUCER_PORT)).toBe(
      moduleRef.get(AgentAguiProducerCoordinator),
    );
    await moduleRef.close();
  });

  it("compiles the fresh controller-free runtime root with shared generic-run contracts", async () => {
    process.env.AGENT_DEFAULT_MODEL = "acceptance-test-model";
    const lifecycleKey = process.env.INTERACTION_LIFECYCLE_HMAC_KEY;
    delete process.env.INTERACTION_LIFECYCLE_HMAC_KEY;

    const moduleRef = await Test.createTestingModule({
      imports: [AgentRuntimeApplicationModule],
    }).compile();

    expect(moduleRef.get(AGENT_RUNNER_PORT)).toBeDefined();
    expect(moduleRef.get(AgentRuntimeHandlerRegistry)).toBeDefined();
    expect(moduleRef.get(AgentToolRouter)).toBeDefined();
    await moduleRef.close();
    if (lifecycleKey) process.env.INTERACTION_LIFECYCLE_HMAC_KEY = lifecycleKey;
  });

  it("fails the API wrapper fast when the dedicated lifecycle key is absent", async () => {
    const lifecycleKey = process.env.INTERACTION_LIFECYCLE_HMAC_KEY;
    delete process.env.INTERACTION_LIFECYCLE_HMAC_KEY;

    await expect(
      Test.createTestingModule({
        imports: [EventEmitterModule.forRoot(), AgentOsHttpModule],
      })
        .overrideProvider(OperationServerLifecycleService)
        .useValue({})
        .compile(),
    ).rejects.toThrow("INTERACTION_LIFECYCLE_HMAC_KEY");

    if (lifecycleKey) process.env.INTERACTION_LIFECYCLE_HMAC_KEY = lifecycleKey;
  });

  it("composes the controller-free facade from focused modules", () => {
    expect(Reflect.getMetadata(IMPORTS_KEY, AgentOsModule) ?? []).toEqual([
      AgentOsCatalogModule,
      AgentOsCapabilityModule,
      AgentOsSessionModule,
    ]);
    expect(Reflect.getMetadata(CONTROLLERS_KEY, AgentOsModule) ?? []).toEqual(
      [],
    );
  });

  it("keeps the core controller-free and imports only controller-free owner modules", () => {
    const imports: unknown[] =
      Reflect.getMetadata(IMPORTS_KEY, AgentOsSessionModule) ?? [];
    expect(imports).toEqual([
      PrismaModule,
      AgentOsCatalogModule,
      AgentOsCapabilityModule,
      AgentOsRuntimeSupportModule,
    ]);
    expect(imports).not.toContain(OperationsModule);
    expect(
      Reflect.getMetadata(CONTROLLERS_KEY, AgentOsSessionModule) ?? [],
    ).toEqual([]);
    expect(
      Reflect.getMetadata(CONTROLLERS_KEY, AgentOsCapabilityModule) ?? [],
    ).toEqual([]);
    expect(
      Reflect.getMetadata(EXPORTS_KEY, DashboardCapabilityModule) ?? [],
    ).toContain(ANALYTICS_OVERVIEW_CAPABILITY_PORT);
  });

  it("gives HTTP and Operations composition only to the API wrapper", () => {
    expect(Reflect.getMetadata(IMPORTS_KEY, AgentOsHttpModule) ?? []).toEqual([
      AgentOsModule,
      AgentOsLegacyRunModule,
      AgentOsRuntimeSupportModule,
      OperationsModule,
      StorageModule,
    ]);
    expect(
      Reflect.getMetadata(CONTROLLERS_KEY, AgentOsHttpModule) ?? [],
    ).toEqual(HTTP_CONTROLLERS);

    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AgentOsHttpModule) ?? [];
    for (const provider of [
      AgentInlineRunReconciler,
      AgentInteractionAuthorizationService,
      AgentInteractionBootstrapService,
      AgentInteractionSessionLifecycleService,
      AgentSessionLifecycleMaintenanceService,
      AgentSessionLifecycleMaintenanceProcessor,
      StorageAgentSessionArtifactEraser,
      InteractionAllowedVersionResolver,
      InteractionGatewayGuard,
      AgentAguiRunService,
      AgentAguiProducerCoordinator,
      AgentAguiRuntimeRegistry,
      OpenAiResponsesAguiRuntimeAdapter,
      AgentSessionRuntimeControlService,
      AgentSessionOperationContinuationService,
      AgentSessionApprovalService,
      AgentSessionCancellationService,
      AgentSessionExecutionService,
      AgentSessionTaskDispatchService,
      AgentSessionDelegationService,
      OperationsSessionExecutionAdapter,
      AgentSessionTaskExecutionService,
      AgentSessionTaskOperationAdapter,
    ]) {
      expect(providers).toContain(provider);
    }
    expect(providers).toContainEqual({
      provide: AgentInteractionPresentationService,
      useFactory: expect.any(Function),
    });
    expect(providers).toContainEqual({
      provide: AGENT_AGUI_RUNNER_PORT,
      useExisting: AgentAguiRunService,
    });
    for (const [token, implementation] of [
      [AGENT_CATALOG_PORT, AgentCatalogService],
      [AGENT_INTERACTION_BOOTSTRAP_PORT, AgentInteractionBootstrapService],
      [AGENT_INTERACTION_SESSION_LIFECYCLE_PORT, AgentInteractionSessionLifecycleService],
      [AGENT_SESSION_LIFECYCLE_MAINTENANCE_PORT, AgentSessionLifecycleMaintenanceService],
      [AGENT_SESSION_ARTIFACT_ERASER, StorageAgentSessionArtifactEraser],
      [
        AGENT_INTERACTION_AUTHORIZATION_PORT,
        AgentInteractionAuthorizationService,
      ],
      [
        AGENT_INTERACTION_PRESENTATION_PORT,
        AgentInteractionPresentationService,
      ],
      [AGENT_SESSION_TASK_CONTROL_PORT, AgentSessionTaskControlService],
      [AGENT_SESSION_APPROVAL_DECISION_PORT, AgentSessionApprovalService],
      [OPERATIONS_SESSION_EXECUTION_PORT, OperationsSessionExecutionAdapter],
      [AGENT_SESSION_TASK_EXECUTION_PORT, AgentSessionTaskExecutionService],
    ]) {
      expect(providers).toContainEqual({
        provide: token,
        useExisting: implementation,
      });
    }
    expect(providers).toContainEqual({
      provide: INTERACTION_PRODUCT_ANALYTICS_PORT,
      useExisting: InteractionProductAnalyticsAdapter,
    });
    for (const token of [
      INTERACTION_CLOCK,
      INTERACTION_GATEWAY_SHARED_SECRET,
      INTERACTION_PRINCIPAL_HMAC_KEY,
      INTERACTION_RUN_INTENT_HMAC_KEY,
      INTERACTION_REPLAY_CURSOR_HMAC_KEY,
      AGENT_SESSION_TOMBSTONE_HASHER,
    ]) {
      expect(providers).toContainEqual(
        expect.objectContaining({ provide: token }),
      );
    }
  });

  it("keeps HTTP authority and Operations dependencies out of the shared core", () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AgentOsModule) ?? [];
    for (const provider of [
      AgentInlineRunReconciler,
      AgentRunWorker,
      AgentInteractionAuthorizationService,
      AgentInteractionBootstrapService,
      InteractionGatewayGuard,
      AgentAguiRunService,
      AgentSessionApprovalService,
      AgentSessionCancellationService,
      AgentSessionExecutionService,
      AgentSessionTaskDispatchService,
      AgentSessionDelegationService,
      AgentSessionTaskOperationAdapter,
    ]) {
      expect(providers).not.toContain(provider);
    }
    for (const token of [
      INTERACTION_CLOCK,
      INTERACTION_GATEWAY_SHARED_SECRET,
      INTERACTION_PRINCIPAL_HMAC_KEY,
      INTERACTION_RUN_INTENT_HMAC_KEY,
      INTERACTION_REPLAY_CURSOR_HMAC_KEY,
      AGENT_SESSION_TOMBSTONE_HASHER,
    ]) {
      expect(providers).not.toContainEqual(
        expect.objectContaining({ provide: token }),
      );
    }
  });

  it("gives only AgentRunWorker to the worker wrapper", () => {
    expect(Reflect.getMetadata(IMPORTS_KEY, AgentOsWorkerModule) ?? []).toEqual(
      [AgentOsLegacyRunModule],
    );
    expect(
      Reflect.getMetadata(PROVIDERS_KEY, AgentOsWorkerModule) ?? [],
    ).toEqual([]);
    expect(
      Reflect.getMetadata(IMPORTS_KEY, AgentMcpApplicationModule) ?? [],
    ).toEqual([
      AgentRuntimeApplicationModule,
      expect.any(Function),
    ]);
    expect(
      Reflect.getMetadata(IMPORTS_KEY, AgentMcpApplicationModule) ?? [],
    ).not.toContain(AgentOsHttpModule);
  });

  it("keeps lifecycle maintenance, storage erasure, and the lifecycle HMAC key in the API wrapper", () => {
    for (const root of [AgentRuntimeApplicationModule, AgentMcpApplicationModule]) {
      const rootProviders = [...new Set(
        [...(Reflect.getMetadata(IMPORTS_KEY, root) ?? [])],
      )];
      expect(rootProviders).not.toContain(AgentOsHttpModule);
    }
    for (const modulePath of [
      resolve(__dirname, "..", "..", "agent-runtime-application.module.ts"),
      resolve(__dirname, "..", "..", "agent-mcp-application.module.ts"),
      resolve(__dirname, "..", "agent-os-worker.module.ts"),
    ]) {
      const source = readFileSync(modulePath, "utf8");
      expect(source).not.toContain("INTERACTION_LIFECYCLE_HMAC_KEY");
      expect(source).not.toContain("agent-session-lifecycle-maintenance");
      expect(source).not.toContain("storage-agent-session-artifact-eraser");
    }
  });

  it("keeps official session persistence and durable runtime providers in core", () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AgentOsSessionModule) ?? [];
    for (const provider of [
      AgentSessionCapabilityInvocationService,
      AgentRuntimeAdapterRegistry,
      InProcessAgentConversationLivePublisher,
    ]) {
      expect(providers).toContain(provider);
    }
    expect(providers).toContainEqual({
      provide: HermesRuntimeStartupRegistrar,
      inject: [AgentRuntimeAdapterRegistry, AgentCapabilityRegistry],
      useFactory: expect.any(Function),
    });
    expect(providers).toContainEqual({
      provide: AGENT_SESSION_QUERY_REPOSITORY,
      useClass: PrismaAgentSessionQueryRepository,
    });
    expect(providers).toContainEqual({
      provide: AGENT_CONVERSATION_QUERY_REPOSITORY,
      useClass: PrismaAgentConversationQueryRepository,
    });
    expect(providers).toContainEqual({
      provide: AGENT_EXECUTION_QUERY_REPOSITORY,
      useClass: PrismaAgentExecutionQueryRepository,
    });
    expect(providers).toContainEqual({
      provide: AGENT_RUN_AUTHORIZATION_TRANSACTION,
      useClass: PrismaAgentRunAuthorizationTransaction,
    });
    expect(providers).toContainEqual({
      provide: AGENT_CONVERSATION_EVENT_TRANSACTION,
      useClass: PrismaAgentConversationEventTransaction,
    });
    expect(providers).toContainEqual({
      provide: AGENT_EXECUTION_USAGE_TRANSACTION,
      useClass: PrismaAgentExecutionUsageTransaction,
    });
    expect(providers).toContainEqual({
      provide: AGENT_SESSION_LIFECYCLE_TRANSACTION,
      useClass: PrismaAgentSessionLifecycleTransaction,
    });
    expect(providers).toContainEqual({
      provide: AGENT_SESSION_LIFECYCLE_MAINTENANCE_TRANSACTION,
      useClass: PrismaAgentSessionLifecycleMaintenanceTransaction,
    });
    expect(providers).not.toContainEqual(
      expect.objectContaining({ provide: AGENT_SESSION_TOMBSTONE_HASHER }),
    );
    expect(providers).toContainEqual({
      provide: AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
      useClass: PrismaAgentSessionControlQueryRepository,
    });
    expect(providers).toContainEqual({
      provide: AGENT_DELEGATION_TRANSACTION,
      useClass: PrismaAgentDelegationTransaction,
    });
    expect(providers).toContainEqual({
      provide: AGENT_ATTEMPT_OPERATION_TRANSACTION,
      useClass: PrismaAgentAttemptOperationTransaction,
    });
    expect(providers).toContainEqual({
      provide: AGENT_APPROVAL_CONTINUATION_TRANSACTION,
      useClass: PrismaAgentApprovalContinuationTransaction,
    });
    expect(providers).toContainEqual({
      provide: AGENT_SESSION_TRANSITION_TRANSACTION,
      useClass: PrismaAgentSessionTransitionTransaction,
    });
    expect(providers).toContainEqual({
      provide: AGENT_CONVERSATION_LIVE_PUBLISHER,
      useExisting: InProcessAgentConversationLivePublisher,
    });
    expect(providers).toContainEqual({
      provide: AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
      useExisting: AgentSessionCapabilityInvocationService,
    });
  });

  it("keeps capability registration and owner adapters in the capability module", () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AgentOsCapabilityModule) ?? [];
    expect(providers).toContain(AgentOsPlatformProbeCapabilityAdapter);
    expect(providers).toContain(AnalyticsOverviewAgentCapabilityAdapter);
    expect(
      Reflect.getMetadata(CONTROLLERS_KEY, AgentOsCapabilityModule) ?? [],
    ).toEqual([]);
  });

  it("keeps code-owned catalog validation and immutable version publication in the catalog module", () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AgentOsCatalogModule) ?? [];
    expect(providers).toContain(AgentCatalogService);
    expect(providers).toContain(AgentRuntimeCatalogStartupValidator);
    expect(providers).toContainEqual({
      provide: AGENT_VERSION_REPOSITORY,
      useClass: PrismaAgentVersionRepository,
    });
    expect(providers).toContainEqual({
      provide: AgentVersionPublisher,
      inject: [AGENT_VERSION_REPOSITORY],
      useFactory: expect.any(Function),
    });
  });

  it("exports only official session seams from the session module", () => {
    const exports: unknown[] =
      Reflect.getMetadata(EXPORTS_KEY, AgentOsSessionModule) ?? [];
    for (const exported of [
      AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
      AGENT_DELEGATION_TRANSACTION,
      AGENT_ATTEMPT_OPERATION_TRANSACTION,
      AGENT_APPROVAL_CONTINUATION_TRANSACTION,
      AGENT_SESSION_TRANSITION_TRANSACTION,
      AGENT_SESSION_LIFECYCLE_TRANSACTION,
      AGENT_SESSION_LIFECYCLE_MAINTENANCE_TRANSACTION,
      AGENT_CONVERSATION_LIVE_PUBLISHER,
      AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
      AgentRuntimeAdapterRegistry,
    ]) {
      expect(exports).toContain(exported);
    }
  });

  it("quarantines generic AgentRun providers and tokens in the legacy module", () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AgentOsLegacyRunModule) ?? [];
    expect(providers).toContain(AgentInteractionService);
    expect(providers).toContain(AgentLocalCliRuntimeAdapter);
    expect(providers).toContain(AgentLocalProcessRegistry);
    expect(providers).toContain(KidItemMcpSessionAdapter);
    expect(providers).toContain(AgentRunOperationAlertBridge);
    expect(providers).toContainEqual({
      provide: AGENT_INTERACTION_PORT,
      useExisting: AgentInteractionService,
    });
    expect(providers).toContainEqual({
      provide: AGENT_MCP_SESSION_PORT,
      useExisting: KidItemMcpSessionAdapter,
    });
    const sessionProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AgentOsSessionModule) ?? [];
    for (const provider of [
      AgentInteractionService,
      AgentRunCoordinator,
      AgentRunExecutor,
      AgentRunGraphService,
      AgentApprovalService,
      AgentConversationService,
      AgentObservabilityService,
      AgentRunWorker,
    ]) {
      expect(sessionProviders).not.toContain(provider);
    }
    for (const token of [
      AGENT_INTERACTION_PORT,
      AGENT_RUNNER_PORT,
      LEGACY_AGENT_APPROVAL_PORT,
      LEGACY_AGENT_CONVERSATION_PORT,
      LEGACY_AGENT_RUN_GRAPH_PORT,
      LEGACY_AGENT_RUN_EXECUTION_PORT,
      LEGACY_AGENT_OBSERVABILITY_PORT,
    ]) {
      expect(sessionProviders).not.toContainEqual(
        expect.objectContaining({ provide: token }),
      );
    }
    expect(
      Reflect.getMetadata(IMPORTS_KEY, AgentOsLegacyRunModule) ?? [],
    ).not.toContain(AgentOsSessionModule);
    expect(
      Reflect.getMetadata(
        SELF_DECLARED_DEPS_KEY,
        AgentSessionRuntimeControlService,
      ),
    ).toContainEqual({ index: 2, param: INTERACTION_CLOCK });
    expect(
      Reflect.getMetadata(SELF_DECLARED_DEPS_KEY, AgentSessionApprovalService),
    ).toContainEqual({ index: 6, param: INTERACTION_CLOCK });
  });

  it("keeps legacy, automation, and readiness source dependencies out of official session composition", () => {
    const source = readFileSync(
      resolve(__dirname, "..", "agent-os-session.module.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/legacy-run|AgentRun(?:Coordinator|Executor|Worker|GraphService)|AgentInteractionService/);
    expect(source).not.toMatch(/OperationAlertRuntimeModule|ReadinessStateModule|AgentRunOperationAlertBridge|AgentOsLiveReadinessAdapter/);
    expect(source).not.toMatch(/AGENT_(?:RUNNER|INTERACTION|API_CAPABILITY_GRANT|OS_MCP_TOOL_EXECUTION)_PORT/);
  });
});
