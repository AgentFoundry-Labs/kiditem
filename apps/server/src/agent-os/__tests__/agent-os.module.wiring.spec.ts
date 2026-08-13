import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AgentOsModule } from '../agent-os.module';
import { AgentOsHttpModule } from '../agent-os-http.module';
import { AgentOsWorkerModule } from '../agent-os-worker.module';
import { OperationAlertRuntimeModule } from '../../automation/operation-alert-runtime.module';
import { ReadinessStateModule } from '../../readiness/readiness-state.module';
import { PrismaModule } from '../../prisma/prisma.module';
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
import { KidItemMcpSessionAdapter } from '../adapter/out/runtime/kiditem-mcp-session.adapter';
import { AgentInlineRunReconciler } from '../application/service/agent-inline-run-reconciler.service';
import { AgentRunWorker } from '../application/service/agent-run-worker.service';
import { AgentInteractionService } from '../application/service/agent-interaction.service';
import { AGENT_INTERACTION_PORT } from '../application/port/in/agent-interaction.port';
import { AGENT_MCP_SESSION_PORT } from '../application/port/out/runtime/agent-mcp-session.port';

const IMPORTS_KEY = MODULE_METADATA.IMPORTS;
const CONTROLLERS_KEY = MODULE_METADATA.CONTROLLERS;
const PROVIDERS_KEY = MODULE_METADATA.PROVIDERS;
const EXPORTS_KEY = MODULE_METADATA.EXPORTS;

describe('AgentOsModule wiring', () => {
  it('imports only controller-free owner runtime modules', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, AgentOsModule) ?? [];
    expect(imports).toEqual([
      PrismaModule,
      OperationAlertRuntimeModule,
      ReadinessStateModule,
    ]);
  });

  it('keeps core controller-free and gives the HTTP wrapper the exact seven controllers', () => {
    expect(Reflect.getMetadata(CONTROLLERS_KEY, AgentOsModule) ?? []).toEqual([]);
    const controllers: unknown[] = Reflect.getMetadata(
      CONTROLLERS_KEY,
      AgentOsHttpModule,
    ) ?? [];

    expect(controllers).toEqual([
      AgentCatalogController,
      AgentRunRequestsController,
      AgentExecutorController,
      AgentRunsQueryController,
      AgentRunObservabilityController,
      AgentApprovalsController,
      AgentConversationsController,
    ]);
    const providers: unknown[] = Reflect.getMetadata(
      PROVIDERS_KEY,
      AgentOsHttpModule,
    ) ?? [];
    expect(providers).toEqual([AgentInlineRunReconciler]);
  });

  it('gives only AgentRunWorker to the worker wrapper', () => {
    const coreProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AgentOsModule) ?? [];
    const workerProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AgentOsWorkerModule) ?? [];
    expect(coreProviders).not.toContain(AgentRunWorker);
    expect(coreProviders).not.toContain(AgentInlineRunReconciler);
    expect(workerProviders).toEqual([AgentRunWorker]);
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
    expect(providers).toContain(AgentOsMcpToolExecutor);
    expect(providers).toContain(KidItemMcpToolRegistry);
    expect(providers).toContain(OperatorRuntimeHandler);
    expect(providers).toContain(AgentOsLiveReadinessAdapter);
    expect(providers).toContainEqual({
      provide: AGENT_OS_LIVE_READINESS_PORT,
      useExisting: AgentOsLiveReadinessAdapter,
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
    expect(providers).not.toContain(AgentInlineRunReconciler);
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
