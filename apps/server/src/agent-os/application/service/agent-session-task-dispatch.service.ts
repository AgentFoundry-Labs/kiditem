import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../operations/application/port/in/operation-runner.port';
import {
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
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
    return { operationsRunId: run.id };
  }
}
