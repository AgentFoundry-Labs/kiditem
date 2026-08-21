import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_SESSION_OWNED_OPERATION_PORT,
  type AgentSessionOwnedOperationPort,
} from '../../port/in/session-control/agent-session-owned-operation.port';
import { AGENT_SESSION_TASK_OPERATION_KEY } from '../../../domain/operation/agent-os.operations';

@Injectable()
export class AgentSessionTaskDispatchService {
  constructor(
    @Inject(AGENT_SESSION_OWNED_OPERATION_PORT)
    private readonly ownedOperations: AgentSessionOwnedOperationPort,
  ) {}

  async dispatch(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<{ operationsRunId: string }> {
    const run = await this.ownedOperations.startExecution({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      executionId: input.executionId,
      operationKey: AGENT_SESSION_TASK_OPERATION_KEY,
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: `${AGENT_SESSION_TASK_OPERATION_KEY}:${input.taskId}:${input.executionId}`,
    });
    return { operationsRunId: run.operationRunId };
  }
}
