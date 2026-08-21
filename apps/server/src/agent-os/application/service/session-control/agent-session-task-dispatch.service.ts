import { Inject, Injectable } from '@nestjs/common';
import {
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
import {
  AGENT_ATTEMPT_OPERATION_TRANSACTION,
  type AgentAttemptOperationTransactionPort,
} from '../../port/out/transaction/session-control/agent-attempt-operation.transaction.port';
import { AGENT_SESSION_TASK_OPERATION_KEY } from '../../../domain/operation/agent-os.operations';

@Injectable()
export class AgentSessionTaskDispatchService {
  constructor(
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operations: OperationRunnerPort,
    @Inject(AGENT_ATTEMPT_OPERATION_TRANSACTION)
    private readonly controls: AgentAttemptOperationTransactionPort,
  ) {}

  async dispatch(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<{ operationsRunId: string }> {
    const organization = OrganizationIdSchema.parse(input.organizationId);
    const sessionId = AgentSessionIdSchema.parse(input.sessionId);
    const run = await this.operations.start({
      organizationId: input.organizationId,
      operationKey: AGENT_SESSION_TASK_OPERATION_KEY,
      triggerSource: 'agent',
      input: {
        session: formatAgentSessionName(organization, sessionId),
        task: formatAgentSessionTaskName(
          organization,
          sessionId,
          AgentSessionTaskIdSchema.parse(input.taskId),
        ),
        execution: formatAgentExecutionName(
          organization,
          sessionId,
          AgentExecutionIdSchema.parse(input.executionId),
        ),
      },
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: `${AGENT_SESSION_TASK_OPERATION_KEY}:${input.taskId}:${input.executionId}`,
    });
    await this.controls.reserveAttemptForOperation({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      executionId: input.executionId,
      operationRunId: run.id,
      idempotencyKey: `operation:${run.id}`,
    });
    return { operationsRunId: run.id };
  }
}
