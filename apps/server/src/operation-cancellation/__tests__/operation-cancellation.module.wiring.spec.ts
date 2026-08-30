import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AiModule } from '../../ai/ai.module';
import { AutomationModule } from '../../automation/automation.module';
import { OperationCancellationController } from '../adapter/in/http/operation-cancellation.controller';
import { OperationCancellationService } from '../application/service/operation-cancellation.service';
import { OperationCancellationModule } from '../operation-cancellation.module';

describe('OperationCancellationModule wiring', () => {
  it('owns only retained workflow and direct-AI cancellation boundaries', () => {
    expect(Reflect.getMetadata('imports', OperationCancellationModule)).toEqual([AutomationModule, AiModule]);
    expect(Reflect.getMetadata('controllers', OperationCancellationModule)).toEqual([OperationCancellationController]);
    expect(Reflect.getMetadata('providers', OperationCancellationModule)).toEqual([OperationCancellationService]);
  });
});
