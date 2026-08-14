import { Inject, Injectable } from '@nestjs/common';
import {
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatOperationRunName,
  OperationRunIdSchema,
  OrganizationIdSchema,
  parseAgentSessionName,
  parseAgentSessionTaskName,
  type AgentSessionName,
  type AgentSessionTaskName,
} from '@kiditem/shared/identifiers';
import {
  AGENT_SESSION_CONTROL_REPOSITORY,
  type AgentSessionControlRepositoryPort,
} from '../port/out/repository/agent-session-control.repository.port';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import { AgentSessionTaskDispatchService } from './agent-session-task-dispatch.service';

interface TaskControlInput {
  organizationId: string;
  actorId: string;
  session: AgentSessionName;
  task: AgentSessionTaskName;
  idempotencyKey?: string;
  expectedStatus?: 'failed' | 'paused' | 'waiting_dependency';
}

@Injectable()
export class AgentSessionExecutionService {
  constructor(
    @Inject(AGENT_SESSION_CONTROL_REPOSITORY)
    private readonly controls: AgentSessionControlRepositoryPort,
    private readonly dispatch: AgentSessionTaskDispatchService,
  ) {}

  async inspect(input: Omit<TaskControlInput, 'idempotencyKey' | 'expectedStatus'>) {
    const graph = parseGraph(input);
    const record = await this.controls.loadTaskExecution({
      organizationId: graph.organizationId,
      actorId: input.actorId,
      sessionId: graph.sessionId,
      taskId: graph.taskId,
    });
    if (!record) throw scope();
    return toPublic(record);
  }

  retry(input: TaskMutationInput) {
    if (input.expectedStatus !== 'failed') throw state();
    return this.createAndDispatch(input);
  }

  resume(input: TaskMutationInput) {
    if (!['paused', 'waiting_dependency'].includes(input.expectedStatus)) throw state();
    return this.createAndDispatch(input);
  }

  private async createAndDispatch(input: TaskMutationInput) {
    const graph = parseGraph(input);
    const created = await this.controls.createRetryExecution({
      organizationId: graph.organizationId,
      actorId: input.actorId,
      sessionId: graph.sessionId,
      taskId: graph.taskId,
      expectedStatus: input.expectedStatus,
      idempotencyKey: input.idempotencyKey,
    });
    const dispatched = await this.dispatch.dispatch({
      organizationId: graph.organizationId,
      sessionId: graph.sessionId,
      taskId: graph.taskId,
      executionId: created.executionId,
      requestedByUserId: input.actorId,
    });
    return toPublic({
      ...created,
      operationRunId: dispatched.operationsRunId,
    });
  }
}

type TaskMutationInput = TaskControlInput & {
  idempotencyKey: string;
  expectedStatus: NonNullable<TaskControlInput['expectedStatus']>;
};

function parseGraph(input: Pick<TaskControlInput, 'organizationId' | 'session' | 'task'>) {
  try {
    const session = parseAgentSessionName(input.session);
    const task = parseAgentSessionTaskName(input.task, input.session);
    if (session.organization !== input.organizationId) throw new Error('organization mismatch');
    return { organizationId: session.organization, sessionId: session.session, taskId: task.task };
  } catch {
    throw scope();
  }
}

function toPublic(record: {
  organizationId: string;
  sessionId: string;
  taskId: string;
  taskStatus: string;
  executionId: string;
  executionStatus: string;
  runtimeType: string;
  operationRunId: string | null;
}) {
  const organization = OrganizationIdSchema.parse(record.organizationId);
  const sessionId = AgentSessionIdSchema.parse(record.sessionId);
  const taskId = AgentSessionTaskIdSchema.parse(record.taskId);
  const executionId = AgentExecutionIdSchema.parse(record.executionId);
  const session = formatAgentSessionName(organization, sessionId);
  return {
    session,
    task: formatAgentSessionTaskName(organization, sessionId, taskId),
    execution: formatAgentExecutionName(organization, sessionId, executionId),
    taskStatus: record.taskStatus,
    executionStatus: record.executionStatus,
    runtimeType: record.runtimeType,
    operation: record.operationRunId === null
      ? null
      : formatOperationRunName(
          organization,
          OperationRunIdSchema.parse(record.operationRunId),
        ),
  };
}

function scope(): AgentOsRuntimeError {
  return new AgentOsRuntimeError('AGENT_SESSION_CONTROL_SCOPE_INVALID');
}

function state(): AgentOsRuntimeError {
  return new AgentOsRuntimeError('AGENT_SESSION_CONTROL_STATE_CONFLICT');
}
