import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AgentOsModule } from '../../agent-os/agent-os.module';
import { AiModule } from '../../ai/ai.module';
import { AutomationModule } from '../../automation/automation.module';
import { OperationCancellationController } from '../adapter/in/http/operation-cancellation.controller';
import { OperationCancellationService } from '../application/service/operation-cancellation.service';
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
      new Set([AutomationModule, AgentOsModule, AiModule]),
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

  it('declares only the platform orchestration service locally', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, OperationCancellationModule) ?? [];
    expect(providers).toEqual([OperationCancellationService]);
  });
});
