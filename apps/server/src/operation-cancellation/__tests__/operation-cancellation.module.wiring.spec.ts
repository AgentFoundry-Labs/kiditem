import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AgentOsApiExecutionModule } from '../../agent-os/agent-os-api-execution.module';
import { AiModule } from '../../ai/ai.module';
import { AutomationModule } from '../../automation/automation.module';
import { OperationCancellationController } from '../adapter/in/http/operation-cancellation.controller';
import { OperationCancellationService } from '../application/service/operation-cancellation.service';
import { AgentSessionTaskCancellationAdapter } from '../adapter/out/agent-os/agent-session-task-cancellation.adapter';
import { OPERATION_CANCELLATION_AGENT_SESSION_TASK_PORT } from '../application/port/out/cross-domain/agent-session-task-cancellation.port';
import { OperationCancellationModule } from '../operation-cancellation.module';

const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const PATH_KEY = 'path';

describe('OperationCancellationModule wiring', () => {
  it('imports owner modules through explicit Module metadata', () => {
    const imports: unknown[] =
      Reflect.getMetadata(IMPORTS_KEY, OperationCancellationModule) ?? [];
    expect(new Set(imports)).toEqual(
      new Set([AutomationModule, AgentOsApiExecutionModule, AiModule]),
    );
  });

  it('mounts the cancellation HTTP controller', () => {
    const controllers: unknown[] =
      Reflect.getMetadata(CONTROLLERS_KEY, OperationCancellationModule) ?? [];
    expect(controllers).toEqual([OperationCancellationController]);
    expect(Reflect.getMetadata(PATH_KEY, OperationCancellationController)).toBe(
      'operations',
    );
  });

  it('binds its owner-local AgentSession cancellation adapter without legacy AgentRun composition', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, OperationCancellationModule) ?? [];
    expect(providers).toEqual([
      OperationCancellationService,
      AgentSessionTaskCancellationAdapter,
      {
        provide: OPERATION_CANCELLATION_AGENT_SESSION_TASK_PORT,
        useExisting: AgentSessionTaskCancellationAdapter,
      },
    ]);
  });
});
