import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AgentOsModule } from '../agent-os.module';
import { AutomationModule } from '../../automation/automation.module';
import { ReadinessModule } from '../../readiness/readiness.module';
import { DashboardModule } from '../../analytics/dashboard/dashboard.module';
import { ANALYTICS_OVERVIEW_CAPABILITY_PORT } from '../../analytics/dashboard/application/port/in/analytics-overview-capability.port';
import { AgentCatalogController } from '../adapter/in/http/agent-catalog.controller';
import { AgentApprovalsController } from '../adapter/in/http/agent-approvals.controller';
import { AgentConversationsController } from '../adapter/in/http/agent-conversations.controller';
import { AgentExecutorController } from '../adapter/in/http/agent-executor.controller';
import { AgentRunObservabilityController } from '../adapter/in/http/agent-run-observability.controller';
import { AgentRunRequestsController } from '../adapter/in/http/agent-run-requests.controller';
import { AgentRunsQueryController } from '../adapter/in/http/agent-runs-query.controller';
import { AgentRunOperationAlertBridge } from '../adapter/out/automation/agent-run-operation-alert.bridge';
import { AgentOsLiveReadinessAdapter } from '../adapter/out/cross-domain/agent-os-live-readiness.adapter';
import { OpenAiResponsesOperatorRuntimeAdapter } from '../adapter/out/runtime/openai-responses-operator-runtime.adapter';
import { OpenAiResponsesAguiRuntimeAdapter } from '../adapter/out/runtime/openai-responses-agui-runtime.adapter';
import { OperatorRuntimeHandler } from '../adapter/out/runtime/operator-runtime.handler';
import { AgentPlanValidator } from '../application/service/agent-plan-validator.service';
import { AgentApprovalService } from '../application/service/agent-approval.service';
import { AgentTaskDelegationService } from '../application/service/agent-task-delegation.service';
import { AgentOsMcpToolExecutor } from '../application/service/agent-os-mcp-tool-executor.service';
import { KidItemMcpToolRegistry } from '../application/service/kiditem-mcp-tool-registry.service';
import { OperatorContextBuilder } from '../application/service/operator-context-builder.service';
import { OperatorDecisionExecutor } from '../application/service/operator-decision-executor.service';
import { OperatorDecisionParser } from '../application/service/operator-decision-parser.service';
import { AGENT_OS_LIVE_READINESS_PORT } from '../application/port/out/cross-domain/agent-os-live-readiness.port';
import { AgentLocalCliRuntimeAdapter } from '../adapter/out/runtime/agent-local-cli-runtime.adapter';
import { AgentLocalProcessRegistry } from '../adapter/out/runtime/agent-local-process-registry';
import { HermesRuntimeStartupRegistrar } from '../adapter/out/runtime/hermes-runtime-registrar';
import { KidItemMcpSessionAdapter } from '../adapter/out/runtime/kiditem-mcp-session.adapter';
import { AgentInlineRunReconciler } from '../application/service/agent-inline-run-reconciler.service';
import { AgentInteractionService } from '../application/service/agent-interaction.service';
import { AGENT_INTERACTION_PORT } from '../application/port/in/agent-interaction.port';
import { AGENT_MCP_SESSION_PORT } from '../application/port/out/runtime/agent-mcp-session.port';
import { PrismaAgentInteractionRepository } from '../adapter/out/repository/prisma-agent-interaction.repository';
import { AGENT_INTERACTION_REPOSITORY } from '../application/port/out/repository/agent-interaction-repository.port';
import { AGENT_VERSION_REPOSITORY } from '../application/port/out/repository/agent-version.repository.port';
import { AGENT_SESSION_CONTROL_REPOSITORY } from '../application/port/out/repository/agent-session-control.repository.port';
import { PrismaAgentVersionRepository } from '../adapter/out/repository/prisma-agent-version.repository';
import { PrismaAgentSessionControlRepository } from '../adapter/out/repository/prisma-agent-session-control.repository';
import { AgentInteractionBootstrapController } from '../adapter/in/http/agent-interaction-bootstrap.controller';
import { AgentInteractionControlController } from '../adapter/in/http/agent-interaction-control.controller';
import { AgentAguiController } from '../adapter/in/http/agent-agui.controller';
import { AgentInteractionActionsController } from '../adapter/in/http/agent-interaction-actions.controller';
import { AgentOsPlatformProbeCapabilityAdapter } from '../adapter/in/agent/agent-os-platform-probe-capability.adapter';
import { AnalyticsOverviewAgentCapabilityAdapter } from '../adapter/in/agent/analytics-overview-agent-capability.adapter';
import { InteractionProductAnalyticsAdapter } from '../adapter/out/event/interaction-product-analytics.adapter';
import { INTERACTION_PRODUCT_ANALYTICS_PORT } from '../application/port/out/event/interaction-product-analytics.port';
import { InProcessAgentConversationLivePublisher } from '../adapter/out/event/in-process-agent-conversation-live-publisher.adapter';
import { AGENT_CONVERSATION_LIVE_PUBLISHER } from '../application/port/out/event/agent-conversation-live-publisher.port';
import { AGENT_AGUI_RUNNER_PORT } from '../application/port/in/agent-agui-runner.port';
import { AgentAguiRunService } from '../application/service/agent-agui-run.service';
import { AgentAguiRuntimeRegistry } from '../application/service/agent-agui-runtime-registry.service';
import { InteractionGatewayGuard } from '../adapter/in/http/interaction-gateway.guard';
import { AgentInteractionIdentityService } from '../application/service/agent-interaction-identity.service';
import { AgentCapabilityRegistry } from '../application/service/agent-capability-registry.service';
import { AgentRuntimeAdapterRegistry } from '../application/service/agent-runtime-adapter.registry';
import { AgentVersionPublisher } from '../application/service/agent-version-publisher.service';
import {
  INTERACTION_CLOCK,
  INTERACTION_GATEWAY_SHARED_SECRET,
  INTERACTION_PRINCIPAL_HMAC_KEY,
  INTERACTION_REPLAY_CURSOR_HMAC_KEY,
  INTERACTION_RUN_INTENT_HMAC_KEY,
} from '../application/service/agent-interaction.tokens';

const IMPORTS_KEY = MODULE_METADATA.IMPORTS;
const CONTROLLERS_KEY = MODULE_METADATA.CONTROLLERS;
const PROVIDERS_KEY = MODULE_METADATA.PROVIDERS;
const EXPORTS_KEY = MODULE_METADATA.EXPORTS;

describe('AgentOsModule wiring', () => {
  it('imports owner modules for automation and live-readiness ports', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, AgentOsModule) ?? [];
    expect(imports).toContain(AutomationModule);
    expect(imports).toContain(ReadinessModule);
    expect(imports).not.toContain(DashboardModule);
    const capabilityModule = imports.find((imported) => {
      const exports: unknown[] = Reflect.getMetadata(EXPORTS_KEY, imported as object) ?? [];
      return exports.includes(ANALYTICS_OVERVIEW_CAPABILITY_PORT);
    });
    expect(capabilityModule).toBeDefined();
    expect(Reflect.getMetadata(CONTROLLERS_KEY, capabilityModule as object) ?? []).toEqual([]);
  });

  it('registers the Agent OS HTTP route-family controllers', () => {
    const controllers: unknown[] =
      Reflect.getMetadata(CONTROLLERS_KEY, AgentOsModule) ?? [];

    expect(controllers).toEqual([
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
    ]);
  });

  it('wires the canonical interaction identity, guard, repository, and independent secrets', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AgentOsModule) ?? [];

    expect(providers).toContain(AgentInteractionIdentityService);
    expect(providers).toContain(InteractionGatewayGuard);
    expect(providers).toContain(AgentAguiRunService);
    expect(providers).toContain(AgentAguiRuntimeRegistry);
    expect(providers).toContain(AgentOsPlatformProbeCapabilityAdapter);
    expect(providers).toContain(AnalyticsOverviewAgentCapabilityAdapter);
    expect(providers).toContain(InProcessAgentConversationLivePublisher);
    expect(providers).toContainEqual({
      provide: AGENT_CONVERSATION_LIVE_PUBLISHER,
      useExisting: InProcessAgentConversationLivePublisher,
    });
    expect(providers).toContainEqual({
      provide: AGENT_AGUI_RUNNER_PORT,
      useExisting: AgentAguiRunService,
    });
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
    ]) {
      expect(providers).toContainEqual(
        expect.objectContaining({ provide: token }),
      );
    }
    expect(
      providers.some(
        (provider) =>
          typeof provider === 'function' && provider.name === 'AgentThreadBindingService',
      ),
    ).toBe(false);
  });

  it('registers the operation-alert bridge in Agent OS, not automation', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, AgentOsModule) ?? [];
    expect(providers).toContain(AgentRunOperationAlertBridge);
  });

  it('registers provider-neutral Operator orchestration providers', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, AgentOsModule) ?? [];
    expect(providers).toContain(AgentApprovalService);
    expect(providers).toContain(AgentPlanValidator);
    expect(providers).toContain(AgentTaskDelegationService);
    expect(providers).toContain(OperatorContextBuilder);
    expect(providers).toContain(OperatorDecisionExecutor);
    expect(providers).toContain(OperatorDecisionParser);
    expect(providers).toContain(OpenAiResponsesOperatorRuntimeAdapter);
    expect(providers).toContain(OpenAiResponsesAguiRuntimeAdapter);
    expect(providers).toContain(AgentOsMcpToolExecutor);
    expect(providers).toContain(KidItemMcpToolRegistry);
    expect(providers).toContain(OperatorRuntimeHandler);
    expect(providers).toContain(AgentOsLiveReadinessAdapter);
    expect(providers).toContainEqual({
      provide: HermesRuntimeStartupRegistrar,
      inject: [AgentRuntimeAdapterRegistry, AgentCapabilityRegistry],
      useFactory: expect.any(Function),
    });
    expect(providers).toContainEqual({
      provide: AGENT_OS_LIVE_READINESS_PORT,
      useExisting: AgentOsLiveReadinessAdapter,
    });
    expect(providers).toContainEqual({
      provide: AGENT_INTERACTION_REPOSITORY,
      useClass: PrismaAgentInteractionRepository,
    });
    expect(providers).toContainEqual({
      provide: AGENT_VERSION_REPOSITORY,
      useClass: PrismaAgentVersionRepository,
    });
    expect(providers).toContainEqual({
      provide: AGENT_SESSION_CONTROL_REPOSITORY,
      useClass: PrismaAgentSessionControlRepository,
    });
    expect(providers).toContainEqual({
      provide: AgentVersionPublisher,
      inject: [AGENT_VERSION_REPOSITORY],
      useFactory: expect.any(Function),
    });
  });

  it('exports Operator decision services for dev harness entrypoints', () => {
    const exports: unknown[] = Reflect.getMetadata(EXPORTS_KEY, AgentOsModule) ?? [];
    expect(exports).toContain(OperatorContextBuilder);
    expect(exports).toContain(AgentOsMcpToolExecutor);
    expect(exports).toContain(OperatorDecisionExecutor);
    expect(exports).toContain(OperatorDecisionParser);
  });

  it('wires the generic local CLI interaction and interruption boundary', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, AgentOsModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata(EXPORTS_KEY, AgentOsModule) ?? [];

    expect(providers).toContain(AgentInteractionService);
    expect(providers).toContain(AgentLocalCliRuntimeAdapter);
    expect(providers).toContain(AgentLocalProcessRegistry);
    expect(providers).toContain(KidItemMcpSessionAdapter);
    expect(providers).toContain(AgentInlineRunReconciler);
    expect(providers).toContainEqual({
      provide: AGENT_INTERACTION_PORT,
      useExisting: AgentInteractionService,
    });
    expect(providers).toContainEqual({
      provide: AGENT_MCP_SESSION_PORT,
      useExisting: KidItemMcpSessionAdapter,
    });
    expect(exports).toContain(AGENT_INTERACTION_PORT);
  });
});
