import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../operations/application/port/in/operation-runner.port';
import { AGENT_SESSION_TASK_OPERATION_KEY } from '../../domain/operation/agent-os.operations';

@Injectable()
export class AgentSessionTaskDispatchService {
  constructor(
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operations: OperationRunnerPort,
  ) {}

  async dispatch(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<{ operationsRunId: string }> {
    const run = await this.operations.start({
      organizationId: input.organizationId,
      operationKey: AGENT_SESSION_TASK_OPERATION_KEY,
      triggerSource: 'agent',
      input: {
        sessionId: input.sessionId,
        taskId: input.taskId,
        executionId: input.executionId,
      },
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: `${AGENT_SESSION_TASK_OPERATION_KEY}:${input.taskId}:${input.executionId}`,
    });
    return { operationsRunId: run.id };
  }
}
