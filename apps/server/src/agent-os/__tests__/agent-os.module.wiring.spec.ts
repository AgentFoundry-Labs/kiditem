import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AgentOsModule } from '../agent-os.module';
import { AutomationModule } from '../../automation/automation.module';
import { AgentCatalogController } from '../adapter/in/http/agent-catalog.controller';
import { AgentExecutorController } from '../adapter/in/http/agent-executor.controller';
import { AgentRunObservabilityController } from '../adapter/in/http/agent-run-observability.controller';
import { AgentRunRequestsController } from '../adapter/in/http/agent-run-requests.controller';
import { AgentRunsQueryController } from '../adapter/in/http/agent-runs-query.controller';
import { AgentRunOperationAlertBridge } from '../adapter/out/automation/agent-run-operation-alert.bridge';

const IMPORTS_KEY = MODULE_METADATA.IMPORTS;
const CONTROLLERS_KEY = MODULE_METADATA.CONTROLLERS;
const PROVIDERS_KEY = MODULE_METADATA.PROVIDERS;

describe('AgentOsModule wiring', () => {
  it('imports AutomationModule so Agent OS can consume owner-side automation ports', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, AgentOsModule) ?? [];
    expect(imports).toContain(AutomationModule);
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
    ]);
  });

  it('registers the operation-alert bridge in Agent OS, not automation', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, AgentOsModule) ?? [];
    expect(providers).toContain(AgentRunOperationAlertBridge);
  });
});
