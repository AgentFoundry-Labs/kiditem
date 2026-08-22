import { Inject, Injectable } from '@nestjs/common';
import { parseAgentSessionName } from '@kiditem/shared/identifiers';
import {
  AGENT_SESSION_DELETION_OPERATION_PORT,
  type AgentSessionDeletionOperationPort,
} from '../../port/in/session-execution/agent-session-deletion-operation.port';
import {
  AGENT_SESSION_DELETION_EXECUTION_PORT,
  type AgentSessionDeletionExecutionPort,
} from '../../port/in/session-execution/agent-session-deletion-execution.port';
import {
  AGENT_SESSION_DELETION_EXECUTION_TRANSACTION,
  AGENT_SESSION_DELETION_FAILURE_CODES,
  type AgentSessionDeletionExecutionTransactionPort,
  type AgentSessionDeletionFailureCode,
} from '../../port/out/transaction/session-deletion/agent-session-deletion-execution.transaction.port';
import {
  AGENT_SESSION_DELETION_FINALIZATION_TRANSACTION,
  type AgentSessionDeletionFinalizationTransactionPort,
} from '../../port/out/transaction/session-deletion/agent-session-deletion-finalization.transaction.port';
import {
  AGENT_SESSION_DELETE_MAX_ATTEMPTS,
  AGENT_SESSION_DELETE_RETRY_DELAYS_MS,
  AgentSessionDeleteOperationInputSchema,
} from '../../../domain/operation/agent-session-deletion.operations';
import type {
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../common/operation-definition';

const SAFE_DELETION_FAILURE_MESSAGES: Record<AgentSessionDeletionFailureCode, string> = {
  RUNTIME_CLEANUP_UNKNOWN: 'AgentSession deletion could not confirm runtime cleanup',
  ARTIFACT_WRITER_NOT_FENCED: 'AgentSession deletion could not fence an artifact writer',
  STORAGE_DELETE_PRESENT: 'AgentSession deletion found a remaining artifact',
  STORAGE_DELETE_UNKNOWN: 'AgentSession deletion could not confirm artifact absence',
  SESSION_OPERATION_OWNERSHIP_INVALID: 'AgentSession deletion found invalid operation ownership',
  SESSION_GRAPH_CHANGED: 'AgentSession deletion graph changed during cleanup',
  SESSION_DELETION_INVARIANT: 'AgentSession deletion invariant failed',
};

@Injectable()
export class AgentSessionDeletionOperationService
  implements AgentSessionDeletionOperationPort
{
  constructor(
    @Inject(AGENT_SESSION_DELETION_EXECUTION_PORT)
    private readonly execution: AgentSessionDeletionExecutionPort,
    @Inject(AGENT_SESSION_DELETION_EXECUTION_TRANSACTION)
    private readonly executionTransactions: AgentSessionDeletionExecutionTransactionPort,
    @Inject(AGENT_SESSION_DELETION_FINALIZATION_TRANSACTION)
    private readonly finalizationTransactions: AgentSessionDeletionFinalizationTransactionPort,
  ) {}

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    const parsed = AgentSessionDeleteOperationInputSchema.parse(context.input);
    const session = parseAgentSessionName(parsed.session);
    if (session.organization !== context.organizationId) {
      throw new Error('AGENT_SESSION_OPERATION_SCOPE_INVALID');
    }
    const fallbackConsumedAttempts =
      (AGENT_SESSION_DELETE_MAX_ATTEMPTS - context.maxAttempts) + context.attempts;
    let result: Awaited<ReturnType<AgentSessionDeletionExecutionPort['execute']>>;
    try {
      result = await this.execution.execute({
        signal: context.signal,
        organizationId: context.organizationId,
        sessionId: session.session,
        operationRunId: context.runId,
        attemptToken: context.attemptToken,
        fallbackConsumedAttempts,
        enterEphemeralFinalization: () => context.enterEphemeralFinalization(),
      });
    } catch (error) {
      if (context.signal.aborted) throw context.signal.reason;
      result = {
        kind: 'retryable',
        code: 'SESSION_DELETION_INVARIANT',
        consumedAttempts: fallbackConsumedAttempts,
      };
    }
    if (result.kind === 'completed') return { kind: 'completed', result: {} };
    const retryAfterMs = AGENT_SESSION_DELETE_RETRY_DELAYS_MS[result.consumedAttempts - 1];
    if (retryAfterMs === undefined && context.attempts < context.maxAttempts) {
      throw new Error('agent_session_deletion_retry_budget_invalid');
    }
    return {
      kind: 'retryable',
      code: result.code,
      message: SAFE_DELETION_FAILURE_MESSAGES[result.code],
      retryAfterMs: retryAfterMs ?? 0,
    };
  }

  async exhaustRetry(
    context: OperationHandlerContext,
    failure: { code: string; message: string },
  ): Promise<void> {
    const session = this.sessionForContext(context);
    await this.executionTransactions.markDeleteFailed({
      signal: context.signal,
      organizationId: context.organizationId,
      sessionId: session.session,
      operationRunId: context.runId,
      attemptToken: context.attemptToken,
      failureCode: validFailureCode(failure.code),
    });
  }

  async finalizeEphemeralSuccess(
    context: OperationHandlerContext,
    _result: Record<string, unknown>,
  ): Promise<void> {
    const session = this.sessionForContext(context);
    const finalization = await context.enterEphemeralFinalization();
    await this.finalizationTransactions.purgeGraphDeletedLineage({
      signal: finalization.signal,
      organizationId: context.organizationId,
      sessionId: session.session,
      currentOperationRunId: context.runId,
      expectedAttemptToken: context.attemptToken,
    });
  }

  private sessionForContext(context: OperationHandlerContext) {
    const input = AgentSessionDeleteOperationInputSchema.parse(context.input);
    const session = parseAgentSessionName(input.session);
    if (session.organization !== context.organizationId) {
      throw new Error('AGENT_SESSION_OPERATION_SCOPE_INVALID');
    }
    return session;
  }
}

function validFailureCode(code: string): AgentSessionDeletionFailureCode {
  if (AGENT_SESSION_DELETION_FAILURE_CODES.includes(code as AgentSessionDeletionFailureCode)) {
    return code as AgentSessionDeletionFailureCode;
  }
  return 'SESSION_DELETION_INVARIANT';
}

export { AGENT_SESSION_DELETION_OPERATION_PORT };
