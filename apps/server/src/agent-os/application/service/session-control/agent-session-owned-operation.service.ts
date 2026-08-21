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
import type { AgentSessionOwnedOperationPort } from '../../port/in/session-control/agent-session-owned-operation.port';
import {
  AGENT_SESSION_OPERATION_PLATFORM_PORT,
  type AgentSessionOperationPlatformPort,
} from '../../port/out/operation/agent-session-operation-platform.port';
import {
  AGENT_SESSION_OWNED_OPERATION_TRANSACTION,
  type AgentSessionOwnedOperationTransactionPort,
} from '../../port/out/transaction/session-control/agent-session-owned-operation.transaction.port';

@Injectable()
export class AgentSessionOwnedOperationService
  implements AgentSessionOwnedOperationPort
{
  constructor(
    @Inject(AGENT_SESSION_OPERATION_PLATFORM_PORT)
    private readonly platform: AgentSessionOperationPlatformPort,
    @Inject(AGENT_SESSION_OWNED_OPERATION_TRANSACTION)
    private readonly transaction: AgentSessionOwnedOperationTransactionPort,
  ) {}

  async startExecution(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    operationKey: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string; attemptId: string }> {
    const { operationKey, ...transactionInput } = input;
    const organizationId = OrganizationIdSchema.parse(input.organizationId);
    const sessionId = AgentSessionIdSchema.parse(input.sessionId);
    const taskId = AgentSessionTaskIdSchema.parse(input.taskId);
    const executionId = AgentExecutionIdSchema.parse(input.executionId);
    const resolved = this.platform.resolveAccepting({
      operationKey,
      triggerSource: 'agent',
      input: {
        session: formatAgentSessionName(organizationId, sessionId),
        task: formatAgentSessionTaskName(organizationId, sessionId, taskId),
        execution: formatAgentExecutionName(organizationId, sessionId, executionId),
      },
    });
    return this.transaction.createExecutionRun({
      ...transactionInput,
      definition: resolved.definition,
      parsedInput: resolved.parsedInput,
      signal: resolved.signal,
    });
  }

  async startCapability(input: {
    organizationId: string;
    sessionId: string;
    operationKey: string;
    requestedByUserId: string | null;
    input: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string }> {
    const organizationId = OrganizationIdSchema.parse(input.organizationId);
    const sessionId = AgentSessionIdSchema.parse(input.sessionId);
    const resolved = this.platform.resolveAccepting({
      operationKey: input.operationKey,
      triggerSource: 'agent',
      input: input.input,
    });
    return this.transaction.createCapabilityRun({
      organizationId,
      sessionId,
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: input.idempotencyKey,
      definition: resolved.definition,
      parsedInput: resolved.parsedInput,
      signal: resolved.signal,
    });
  }
}
