import { createHash } from 'node:crypto';
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
import type {
  AgentSessionCancellationPort,
  CancelAgentSessionTaskInput,
} from '../../port/in/session-control/agent-session-cancellation.port';
import {
  AGENT_SESSION_CANCELLATION_TRANSACTION,
  type AgentSessionCancellationCommand,
  type AgentSessionCancellationTransactionPort,
} from '../../port/out/transaction/session-control/agent-session-cancellation.transaction.port';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';

@Injectable()
export class AgentSessionCancellationService implements AgentSessionCancellationPort {
  private readonly pending = new Map<string, Promise<{ status: string }>>();

  constructor(
    @Inject(AGENT_SESSION_CANCELLATION_TRANSACTION)
    private readonly cancellations: AgentSessionCancellationTransactionPort,
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operations: OperationRunnerPort,
  ) {}

  async cancel(input: CancelAgentSessionTaskInput): Promise<{ status: string }> {
    const graph = parseGraph(input);
    const key = JSON.stringify([
      graph.organizationId,
      graph.sessionId,
      graph.taskId,
      input.actorId,
      input.idempotencyKey,
    ]);
    const current = this.pending.get(key);
    if (current) return current;
    const action = this.cancelOnce({
      ...graph,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      expectedStatus: input.expectedStatus,
      reason: input.reason,
      fingerprint: fingerprint({
        ...graph,
        actorId: input.actorId,
        expectedStatus: input.expectedStatus,
        reason: input.reason,
      }),
    })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, action);
    return action;
  }

  private async cancelOnce(
    command: AgentSessionCancellationCommand,
  ): Promise<{ status: string }> {
    const begun = await this.cancellations.begin(command);
    if (begun.kind === 'completed') return { status: begun.status };
    const run = await this.operations.cancel({
      organizationId: command.organizationId,
      runId: begun.operationRunId,
      requestedByUserId: command.actorId,
      reason: command.reason,
    });
    return this.cancellations.complete({
      organizationId: command.organizationId,
      sessionId: command.sessionId,
      taskId: command.taskId,
      actorId: command.actorId,
      idempotencyKey: command.idempotencyKey,
      fingerprint: command.fingerprint,
      operationRunId: begun.operationRunId,
      status: run.status,
    });
  }
}

function fingerprint(input: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');
}

function parseGraph(input: CancelAgentSessionTaskInput): {
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
