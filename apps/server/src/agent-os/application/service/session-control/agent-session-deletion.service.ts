import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_SESSION_DELETION_PORT,
  type AgentSessionDeletionPort,
  type ScopedDeletionActor,
} from '../../port/in/session-control/agent-session-deletion.port';
import {
  AGENT_SESSION_DELETION_COMMAND_TRANSACTION,
  type AgentSessionDeletionCommandTransactionPort,
} from '../../port/out/transaction/session-deletion/agent-session-deletion-command.transaction.port';
import {
  AGENT_SESSION_DELETION_QUERY,
  type AgentSessionDeletionQueryPort,
} from '../../port/out/repository/session-deletion/agent-session-deletion-query.port';
import {
  AGENT_SESSION_DELETE_OPERATION,
  AGENT_SESSION_DELETE_OPERATION_KEY,
  AgentSessionDeleteOperationInputSchema,
} from '../../../domain/operation/agent-session-deletion.operations';
import type { AgentSessionOperationDefinitionSnapshot } from '../../port/out/operation/agent-session-operation-platform.port';

const DELETION_DEFINITION: AgentSessionOperationDefinitionSnapshot = Object.freeze({
  key: AGENT_SESSION_DELETE_OPERATION_KEY,
  version: AGENT_SESSION_DELETE_OPERATION.version,
  title: AGENT_SESSION_DELETE_OPERATION.title,
  ownerDomain: AGENT_SESSION_DELETE_OPERATION.ownerDomain,
  engineType: AGENT_SESSION_DELETE_OPERATION.engineType,
  resourceClass: AGENT_SESSION_DELETE_OPERATION.resourceClass,
  executionTimeoutMs: AGENT_SESSION_DELETE_OPERATION.executionTimeoutMs,
  maxAttempts: AGENT_SESSION_DELETE_OPERATION.maxAttempts,
  successPersistence: 'ephemeral_on_success',
});

@Injectable()
export class AgentSessionDeletionService implements AgentSessionDeletionPort {
  constructor(
    @Inject(AGENT_SESSION_DELETION_COMMAND_TRANSACTION)
    private readonly commands: AgentSessionDeletionCommandTransactionPort,
    @Inject(AGENT_SESSION_DELETION_QUERY)
    private readonly query: AgentSessionDeletionQueryPort,
  ) {}

  async request(input: ScopedDeletionActor) {
    const parsedInput = AgentSessionDeleteOperationInputSchema.parse({
      session: input.session,
      retryGeneration: 1,
    });
    const result = await this.commands.begin({
      ...input,
      signal: new AbortController().signal,
      definition: DELETION_DEFINITION,
      parsedInput,
    });
    return result ?? this.query.findAuthorizedStatus(input);
  }

  status(input: ScopedDeletionActor) {
    return this.query.findAuthorizedStatus(input);
  }

  retry(input: ScopedDeletionActor) {
    return this.commands.retry({
      ...input,
      signal: new AbortController().signal,
      definition: DELETION_DEFINITION,
    });
  }
}
