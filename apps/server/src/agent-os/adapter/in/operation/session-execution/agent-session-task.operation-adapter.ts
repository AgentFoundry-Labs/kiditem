import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  formatOperationRunName,
  OperationRunIdSchema,
  OrganizationIdSchema,
  parseAgentSessionName,
} from '@kiditem/shared/identifiers';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../../../operations/application/port/in/operation-handler-registry.port';
import type {
  OperationCancelContext,
  OperationHandler,
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../../common/operation-definition';
import {
  AGENT_SESSION_TASK_EXECUTION_PORT,
  type AgentSessionTaskExecutionPort,
  type AgentSessionTaskExecutionResult,
} from '../../../../application/port/in/session-execution/agent-session-task-execution.port';
import {
  AGENT_OS_OPERATIONS,
  AgentSessionTaskOperationInputSchema,
} from '../../../../domain/operation/agent-os.operations';

@Injectable()
export class AgentSessionTaskOperationAdapter implements OperationHandler, OnModuleInit {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(AGENT_SESSION_TASK_EXECUTION_PORT)
    private readonly execution: AgentSessionTaskExecutionPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(AGENT_OS_OPERATIONS[0], this);
  }

  async execute(context: OperationHandlerContext): Promise<OperationHandlerResult> {
    const input = AgentSessionTaskOperationInputSchema.parse(context.input);
    const session = parseAgentSessionName(input.session);
    if (session.organization !== context.organizationId) {
      throw new Error('AGENT_SESSION_OPERATION_SCOPE_INVALID');
    }
    const result = await this.execution.execute({
      organizationId: context.organizationId,
      session: input.session,
      task: input.task,
      execution: input.execution,
      operation: formatOperationRunName(
        OrganizationIdSchema.parse(context.organizationId),
        OperationRunIdSchema.parse(context.runId),
      ),
      operationAttemptToken: context.attemptToken,
      requestedByUserId: context.requestedByUserId,
      signal: context.signal,
    });
    return mapExecutionResult(result);
  }

  async cancel(context: OperationCancelContext): Promise<void> {
    await this.execution.cancel({
      organizationId: context.organizationId,
      operation: formatOperationRunName(
        OrganizationIdSchema.parse(context.organizationId),
        OperationRunIdSchema.parse(context.runId),
      ),
      requestedByUserId: context.requestedByUserId,
      reason: context.reason,
    });
  }
}

function mapExecutionResult(result: AgentSessionTaskExecutionResult): OperationHandlerResult {
  switch (result.status) {
    case 'completed': return { kind: 'completed', result: result.output };
    case 'attention_required': return {
      kind: 'attention_required', reason: result.reason, result: result.output,
    };
    case 'cancelled': return { kind: 'cancelled', result: result.output };
    case 'failed': return { kind: 'failed', code: result.code, message: result.message };
  }
}
