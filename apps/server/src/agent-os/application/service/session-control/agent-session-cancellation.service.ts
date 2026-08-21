import { Inject, Injectable } from '@nestjs/common';
import {
  parseAgentSessionName,
  parseAgentSessionTaskName,
  type AgentSessionName,
  type AgentSessionTaskName,
} from '@kiditem/shared/identifiers';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
import {
  AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
  type AgentSessionControlQueryRepositoryPort,
} from '../../port/out/repository/session-control/agent-session-control-query.repository.port';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';

interface CancelInput {
  organizationId: string;
  session: AgentSessionName;
  task: AgentSessionTaskName;
  actorId: string;
  idempotencyKey: string;
  expectedStatus: 'queued' | 'running' | 'waiting_dependency' | 'waiting_approval' | 'paused';
  reason: string | null;
}

@Injectable()
export class AgentSessionCancellationService {
  private readonly pending = new Map<string, Promise<{ status: string }>>();

  constructor(
    @Inject(AGENT_SESSION_CONTROL_QUERY_REPOSITORY)
    private readonly controls: AgentSessionControlQueryRepositoryPort,
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operations: OperationRunnerPort,
  ) {}

  async cancel(input: CancelInput): Promise<{ status: string }> {
    const graph = parseGraph(input);
    const key = JSON.stringify([
      graph.organizationId,
      graph.sessionId,
      graph.taskId,
      input.actorId,
    ]);
    const current = this.pending.get(key);
    if (current) return current;
    const action = this.cancelOnce(graph, input.actorId, input.expectedStatus, input.reason)
      .finally(() => this.pending.delete(key));
    this.pending.set(key, action);
    return action;
  }

  private async cancelOnce(
    graph: { organizationId: string; sessionId: string; taskId: string },
    actorId: string,
    expectedStatus: CancelInput['expectedStatus'],
    reason: string | null,
  ): Promise<{ status: string }> {
    const target = await this.controls.loadCancelableTask({ ...graph, actorId, expectedStatus });
    if (!target || !target.operationRunId) {
      throw new AgentOsRuntimeError(
        'AGENT_SESSION_CONTROL_SCOPE_INVALID',
        'The task has no cancellable durable operation in this organization.',
      );
    }
    const run = await this.operations.cancel({
      organizationId: graph.organizationId,
      runId: target.operationRunId,
      requestedByUserId: actorId,
      reason,
    });
    return { status: run.status };
  }
}

function parseGraph(input: CancelInput): {
  organizationId: string;
  sessionId: string;
  taskId: string;
} {
  try {
    const session = parseAgentSessionName(input.session);
    const task = parseAgentSessionTaskName(input.task, input.session);
    if (session.organization !== input.organizationId) throw new Error('organization mismatch');
    return { organizationId: session.organization, sessionId: session.session, taskId: task.task };
  } catch {
    throw new AgentOsRuntimeError(
      'AGENT_SESSION_CONTROL_SCOPE_INVALID',
      'Task control must use matching canonical organization and session names.',
    );
  }
}
