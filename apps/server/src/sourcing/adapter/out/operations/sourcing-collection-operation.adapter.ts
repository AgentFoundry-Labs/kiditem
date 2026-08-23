import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_SESSION_OWNED_OPERATION_PORT,
  type AgentSessionOwnedOperationPort,
} from '../../../../agent-os/application/port/in/session-control/agent-session-owned-operation.port';
import {
  ownerCapabilityContext,
  ownerCapabilityIdempotencyKey,
} from '../../../../agent-os/application/port/out/capability/agent-capability-owner-context';
import {
  formatOperationRunName,
  OperationRunIdSchema,
  OrganizationIdSchema,
  parseAgentSessionName,
} from '@kiditem/shared/identifiers';
import type { SourcingCollectionOperationPort } from '../../../application/port/out/cross-domain/sourcing-collection-operation.port';

@Injectable()
export class SourcingCollectionOperationAdapter
  implements SourcingCollectionOperationPort
{
  constructor(
    @Inject(AGENT_SESSION_OWNED_OPERATION_PORT)
    private readonly operations: AgentSessionOwnedOperationPort,
  ) {}

  async startOfficial(
    input: Parameters<SourcingCollectionOperationPort['startOfficial']>[0],
  ): Promise<{ operation: string; status: string }> {
    const owner = ownerCapabilityContext(input.execution);
    const run = await this.operations.startCapability({
      organizationId: owner.organizationId,
      sessionId: parseAgentSessionName(input.execution.session).session,
      operationKey: 'sourcing.collect_daily_trends',
      input: input.sources.length > 0 ? { sources: input.sources } : {},
      requestedByUserId: owner.actorId,
      idempotencyKey: ownerCapabilityIdempotencyKey(
        input.execution,
        `sourcing.refreshCollection:${input.sources.join(',')}`,
      ),
    });
    return {
      operation: formatOperationRunName(
        OrganizationIdSchema.parse(owner.organizationId),
        OperationRunIdSchema.parse(run.operationRunId),
      ),
      status: 'queued',
    };
  }
}
