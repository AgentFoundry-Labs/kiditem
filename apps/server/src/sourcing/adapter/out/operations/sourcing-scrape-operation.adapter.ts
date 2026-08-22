import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_SESSION_OWNED_OPERATION_PORT,
  type AgentSessionOwnedOperationPort,
} from '../../../../agent-os/application/port/in/session-control/agent-session-owned-operation.port';
import {
  ownerCapabilityContext,
  ownerCapabilityIdempotencyKey,
} from '../../../../agent-os/application/port/out/capability/agent-capability-owner-context';
import { parseAgentSessionName } from '@kiditem/shared/identifiers';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
import type { SourcingScrapeOperationPort } from '../../../application/port/out/cross-domain/sourcing-scrape-operation.port';
import { SOURCING_SCRAPE_URL_OPERATION } from '../../../domain/operation/sourcing.operations';

@Injectable()
export class SourcingScrapeOperationAdapter implements SourcingScrapeOperationPort {
  constructor(
    @Inject(OPERATION_RUNNER_PORT) private readonly operations: OperationRunnerPort,
    @Inject(AGENT_SESSION_OWNED_OPERATION_PORT)
    private readonly sessionOperations: AgentSessionOwnedOperationPort,
  ) {}

  async startDirect(input: {
    organizationId: string;
    requestedByUserId: string | null;
    sourceUrl: string;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string; status: string }> {
    const run = await this.operations.start({
      organizationId: input.organizationId,
      operationKey: SOURCING_SCRAPE_URL_OPERATION.key,
      triggerSource: 'domain_screen',
      input: { sourceUrl: input.sourceUrl },
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: input.idempotencyKey,
    });
    return { operationRunId: run.id, status: run.status };
  }

  async startOfficial(input: {
    execution: Parameters<SourcingScrapeOperationPort['startOfficial']>[0]['execution'];
    sourceUrl: string;
  }): Promise<{ operationRunId: string; status: string }> {
    const owner = ownerCapabilityContext(input.execution);
    const run = await this.sessionOperations.startCapability({
      organizationId: owner.organizationId,
      sessionId: parseAgentSessionName(input.execution.session).session,
      operationKey: SOURCING_SCRAPE_URL_OPERATION.key,
      requestedByUserId: owner.actorId,
      input: { sourceUrl: input.sourceUrl },
      idempotencyKey: ownerCapabilityIdempotencyKey(
        input.execution,
        `${SOURCING_SCRAPE_URL_OPERATION.key}:${input.sourceUrl}`,
      ),
    });
    return { operationRunId: run.operationRunId, status: 'queued' };
  }
}
