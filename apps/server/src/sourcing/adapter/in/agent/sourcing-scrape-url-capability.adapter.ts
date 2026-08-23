import { Inject, Injectable } from '@nestjs/common';
import {
  OperationRunIdSchema,
  OrganizationIdSchema,
  formatOperationRunName,
} from '@kiditem/shared/identifiers';
import type {
  SourcingScrapeUrlWorkflowInput,
  SourcingScrapeUrlWorkflowPort,
  SourcingScrapeUrlWorkflowResult,
} from '../../../application/port/in/capability/sourcing-capability.ports';
import {
  SOURCING_SCRAPE_OPERATION_PORT,
  type SourcingScrapeOperationPort,
} from '../../../application/port/out/cross-domain/sourcing-scrape-operation.port';

/** Sourcing-only operation adapter. It no longer registers an Agent OS handler. */
@Injectable()
export class SourcingScrapeUrlCapabilityAdapter implements SourcingScrapeUrlWorkflowPort {
  constructor(
    @Inject(SOURCING_SCRAPE_OPERATION_PORT)
    private readonly operations: SourcingScrapeOperationPort,
  ) {}

  async scrapeUrlWorkflow(input: SourcingScrapeUrlWorkflowInput): Promise<SourcingScrapeUrlWorkflowResult> {
    if (!input.idempotencyKey.trim()) throw new Error('owner_idempotency_key_required');
    const result = await this.operations.startDirect({
      organizationId: input.organizationId,
      requestedByUserId: input.triggeredByUserId ?? null,
      sourceUrl: input.sourceUrl,
      idempotencyKey: input.idempotencyKey,
    });
    return {
      skipped: false,
      candidateId: null,
      href: null,
      operation: formatOperationRunName(
        OrganizationIdSchema.parse(input.organizationId),
        OperationRunIdSchema.parse(result.operationRunId),
      ),
    };
  }
}
