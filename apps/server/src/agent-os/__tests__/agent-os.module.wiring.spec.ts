import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AgentOsModule } from '../agent-os.module';
import { AutomationModule } from '../../automation/automation.module';
import { ReadinessModule } from '../../readiness/readiness.module';
import { AgentCatalogController } from '../adapter/in/http/agent-catalog.controller';
import { AgentApprovalsController } from '../adapter/in/http/agent-approvals.controller';
import { AgentConversationsController } from '../adapter/in/http/agent-conversations.controller';
import { AgentExecutorController } from '../adapter/in/http/agent-executor.controller';
import { AgentRunObservabilityController } from '../adapter/in/http/agent-run-observability.controller';
import { AgentRunRequestsController } from '../adapter/in/http/agent-run-requests.controller';
import { AgentRunsQueryController } from '../adapter/in/http/agent-runs-query.controller';
import { AgentRunOperationAlertBridge } from '../adapter/out/automation/agent-run-operation-alert.bridge';
import { AgentOsLiveReadinessAdapter } from '../adapter/out/cross-domain/agent-os-live-readiness.adapter';
import { HermesOperatorRuntimeAdapter } from '../adapter/out/runtime/hermes-operator-runtime.adapter';
import { HermesRuntimeProfileService } from '../adapter/out/runtime/hermes-runtime-profile.service';
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

const IMPORTS_KEY = MODULE_METADATA.IMPORTS;
const CONTROLLERS_KEY = MODULE_METADATA.CONTROLLERS;
const PROVIDERS_KEY = MODULE_METADATA.PROVIDERS;
const EXPORTS_KEY = MODULE_METADATA.EXPORTS;

describe('AgentOsModule wiring', () => {
  it('imports owner modules for automation and live-readiness ports', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, AgentOsModule) ?? [];
    expect(imports).toContain(AutomationModule);
    expect(imports).toContain(ReadinessModule);
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
    ]);
  });

  it('registers the operation-alert bridge in Agent OS, not automation', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, AgentOsModule) ?? [];
    expect(providers).toContain(AgentRunOperationAlertBridge);
  });

  it('registers Operator playbook orchestration providers', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, AgentOsModule) ?? [];
    expect(providers).toContain(AgentApprovalService);
    expect(providers).toContain(AgentPlanValidator);
    expect(providers).toContain(AgentTaskDelegationService);
    expect(providers).toContain(OperatorContextBuilder);
    expect(providers).toContain(OperatorDecisionExecutor);
    expect(providers).toContain(OperatorDecisionParser);
    expect(providers).toContain(OpenAiResponsesOperatorRuntimeAdapter);
    expect(providers).toContain(HermesOperatorRuntimeAdapter);
    expect(providers).toContain(HermesRuntimeProfileService);
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
});
