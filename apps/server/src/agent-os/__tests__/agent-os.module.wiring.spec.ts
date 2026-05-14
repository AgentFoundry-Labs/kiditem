import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AgentOsModule } from '../agent-os.module';
import { AgentCatalogController } from '../adapter/in/http/agent-catalog.controller';
import { AgentExecutorController } from '../adapter/in/http/agent-executor.controller';
import { AgentRunObservabilityController } from '../adapter/in/http/agent-run-observability.controller';
import { AgentRunRequestsController } from '../adapter/in/http/agent-run-requests.controller';
import { AgentRunsQueryController } from '../adapter/in/http/agent-runs-query.controller';

const CONTROLLERS_KEY = MODULE_METADATA.CONTROLLERS;

describe('AgentOsModule wiring', () => {
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
});
