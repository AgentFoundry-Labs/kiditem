import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AGENT_SESSION_DELETION_OPERATION_PORT,
  type AgentSessionDeletionOperationPort,
} from '../../../application/port/in/session-execution/agent-session-deletion-operation.port';
import type {
  OperationHandler,
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../common/operation-definition';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../../operations/application/port/in/operation-handler-registry.port';
import { AGENT_SESSION_DELETE_OPERATION } from '../../../domain/operation/agent-session-deletion.operations';

@Injectable()
export class AgentSessionDeletionOperationHandler
  implements OperationHandler, OnModuleInit
{
  constructor(
    @Inject(AGENT_SESSION_DELETION_OPERATION_PORT)
    private readonly deletion: AgentSessionDeletionOperationPort,
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(AGENT_SESSION_DELETE_OPERATION, this);
  }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    return this.deletion.execute(context);
  }

  async exhaustRetry(
    context: OperationHandlerContext,
    failure: { code: string; message: string },
  ): Promise<void> {
    await this.deletion.exhaustRetry(context, failure);
  }

  async finalizeEphemeralSuccess(
    context: OperationHandlerContext,
    result: Record<string, unknown>,
  ): Promise<void> {
    await this.deletion.finalizeEphemeralSuccess(context, result);
  }
}
