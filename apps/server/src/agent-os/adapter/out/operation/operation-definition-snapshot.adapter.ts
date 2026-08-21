import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../../operations/application/port/in/operation-handler-registry.port';
import { OperationLifecycleGateService } from '../../../../operations/application/service/operation-lifecycle-gate.service';
import {
  type AgentSessionOperationDefinitionSnapshot,
  type AgentSessionOperationPlatformPort,
} from '../../../application/port/out/operation/agent-session-operation-platform.port';

@Injectable()
export class OperationDefinitionSnapshotAdapter
  implements AgentSessionOperationPlatformPort
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    private readonly lifecycleGate: OperationLifecycleGateService,
  ) {}

  resolveAccepting(input: {
    operationKey: string;
    triggerSource: 'agent' | 'dashboard' | 'domain_screen' | 'schedule' | 'system';
    input: Record<string, unknown>;
  }): {
    definition: AgentSessionOperationDefinitionSnapshot;
    parsedInput: Record<string, unknown>;
    signal: AbortSignal;
  } {
    this.lifecycleGate.assertAccepting();
    const definition = this.registry.getDefinition(input.operationKey);
    if (definition.successPersistence === 'ephemeral_on_success') {
      throw new NotFoundException('operation_not_found');
    }
    if (!definition.allowedTriggers.includes(input.triggerSource)) {
      throw new Error(`trigger_not_allowed: ${input.triggerSource}`);
    }
    if (input.triggerSource === 'schedule' && !definition.scheduleSupported) {
      throw new Error('schedule_not_supported');
    }
    const parsedInput = this.registry.parseInput(input.operationKey, input.input);
    const snapshot: AgentSessionOperationDefinitionSnapshot = Object.freeze({
      key: definition.key,
      version: definition.version,
      title: definition.title,
      ownerDomain: definition.ownerDomain,
      engineType: definition.engineType,
      resourceClass: definition.resourceClass,
      executionTimeoutMs: definition.executionTimeoutMs,
      maxAttempts: definition.maxAttempts,
      successPersistence: definition.successPersistence,
    });
    this.lifecycleGate.assertAccepting();
    return { definition: snapshot, parsedInput, signal: this.lifecycleGate.signal() };
  }
}
