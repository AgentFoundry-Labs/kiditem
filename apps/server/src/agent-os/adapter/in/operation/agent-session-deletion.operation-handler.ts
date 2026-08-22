import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_SESSION_DELETION_OPERATION_PORT,
  type AgentSessionDeletionOperationPort,
} from '../../../application/port/in/session-execution/agent-session-deletion-operation.port';
import type {
  OperationHandler,
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../common/operation-definition';

@Injectable()
export class AgentSessionDeletionOperationHandler implements OperationHandler {
  constructor(
    @Inject(AGENT_SESSION_DELETION_OPERATION_PORT)
    private readonly deletion: AgentSessionDeletionOperationPort,
  ) {}

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
