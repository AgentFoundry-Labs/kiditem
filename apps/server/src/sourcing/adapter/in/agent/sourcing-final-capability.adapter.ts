import { Inject, Injectable } from '@nestjs/common';
import { TREND_COLLECTION_PORT, type TrendCollectionPort } from '../../../application/port/in/trend-collection.port';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { SourcingScrapeUrlService } from '../../../application/service/sourcing-scrape-url.service';
import {
  SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT,
  SOURCING_AGENT_WORKSPACE_READ_CAPABILITY_PORT,
  type SourcingAgentWorkspaceMutationCapabilityPort,
  type SourcingAgentWorkspaceReadCapabilityPort,
} from '../../../application/port/in/capability/sourcing-agent-workspace-capability.port';
import {
  SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT,
  type SourcingFinalDiscoveryCapabilityPort,
} from '../../../application/port/in/capability/sourcing-final-discovery-capability.port';
import {
  MARKET_SHADOW_COLLECTION_CAPABILITY_PORT,
  type MarketShadowCollectionCapabilityPort,
} from '../../../application/port/in/capability/market-shadow-capability.port';
import {
  SOURCING_CAPABILITY_ADMISSION_PORT,
  type SourcingCapabilityAdmissionPort,
} from '../../../application/port/in/capability/sourcing-capability-admission.port';
import type {
  SourcingFinalCapabilityPort,
  SourcingOwnerExecutionContext,
} from '../../../application/port/in/capability/sourcing-final-capability.port';

/** Translates final server context into independently owned Sourcing ports. */
@Injectable()
export class SourcingFinalCapabilityAdapter implements SourcingFinalCapabilityPort {
  constructor(
    @Inject(SOURCING_AGENT_WORKSPACE_READ_CAPABILITY_PORT)
    private readonly reads: SourcingAgentWorkspaceReadCapabilityPort,
    @Inject(SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT)
    private readonly mutations: SourcingAgentWorkspaceMutationCapabilityPort,
    @Inject(SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT)
    private readonly discovery: SourcingFinalDiscoveryCapabilityPort,
    @Inject(MARKET_SHADOW_COLLECTION_CAPABILITY_PORT)
    private readonly shadow: MarketShadowCollectionCapabilityPort,
    private readonly scrapes: SourcingScrapeUrlService,
    @Inject(SOURCING_CAPABILITY_ADMISSION_PORT)
    private readonly admissions: SourcingCapabilityAdmissionPort,
    @Inject(TREND_COLLECTION_PORT) private readonly trends: TrendCollectionPort,
  ) {}

  duplicateCheck({ context, input }: { context: Pick<SourcingOwnerExecutionContext, 'organizationId'>; input: { sourceUrl: string } }) {
    return this.discovery.duplicateCheck({ organizationId: context.organizationId, sourceUrl: input.sourceUrl });
  }

  async scrapeProductUrl({ context, input }: { context: Pick<SourcingOwnerExecutionContext, 'organizationId' | 'initiatingUserId' | 'executionId'>; input: { sourceUrl: string } }) {
    const snapshot = await this.discovery.scrapeProductUrl({ sourceUrl: input.sourceUrl });
    this.admissions.recordScrapeSnapshot({ ...context, snapshot });
    return { snapshot };
  }

  async ingestCandidate({ context, input }: { context: SourcingOwnerExecutionContext & { ownerIdempotencyKey: string }; input: { snapshot: import('../../../application/port/in/capability/sourcing-final-capability.port').SourcingSourceSnapshot } }) {
    const idempotencyKey = requiredIdempotency(context);
    const requestHash = requiredOwnerInputHash(context, input);
    return this.discovery.ingestCandidate({
      organizationId: context.organizationId,
      initiatingUserId: context.initiatingUserId,
      idempotencyKey,
      requestHash,
      snapshot: input.snapshot,
    });
  }

  async createReviewBatch({ context, input }: { context: SourcingOwnerExecutionContext; input: { recommendationRunId: string; workspaceKey: 'entry' | 'final'; items: Array<{ itemKey: string; expectedVersion: number }> } }) {
    const ownerIdempotencyKey = requiredIdempotency(context);
    const requestHash = requiredOwnerInputHash(context, input);
    return this.mutations.createReviewBatch({
      organizationId: context.organizationId,
      requestedByUserId: context.initiatingUserId,
      recommendationRunId: input.recommendationRunId,
      workspaceKey: input.workspaceKey,
      items: input.items,
      idempotencyKey: ownerIdempotencyKey,
      requestHash,
    });
  }

  async inspectRecommendationRun({ context, input }: { context: Pick<SourcingOwnerExecutionContext, 'organizationId'>; input: { recommendationRunId?: string } }) {
    return this.reads.inspectRecommendationRun({
      organizationId: context.organizationId,
      recommendationRunId: input.recommendationRunId ?? null,
    });
  }

  async refreshCollection({ context, input }: { context: SourcingOwnerExecutionContext; input: { sources: Array<'naver' | '1688' | 'shorts'> } }) {
    const ownerIdempotencyKey = requiredOwnerReceipt(context, input);
    return this.trends.collect(context.organizationId, input.sources, context.initiatingUserId, ownerIdempotencyKey);
  }

  async refreshValidation({ context, input }: { context: SourcingOwnerExecutionContext & { ownerIdempotencyKey: string }; input: { recommendationRunId: string } }) {
    const ownerIdempotencyKey = requiredOwnerReceipt(context, input);
    return this.mutations.refreshValidation({
      organizationId: context.organizationId,
      recommendationRunId: input.recommendationRunId,
      idempotencyKey: ownerIdempotencyKey,
      requestHash: context.ownerInputHash!,
    });
  }

  async retrieveWorkspaceEvidence({ context, input }: { context: Pick<SourcingOwnerExecutionContext, 'organizationId'>; input: { query: string; topK?: number; days?: number } }) {
    const result = await this.reads.retrieveWorkspaceEvidence({
      organizationId: context.organizationId,
      query: input.query,
      ...(input.topK === undefined ? {} : { topK: input.topK }),
      ...(input.days === undefined ? {} : { days: input.days }),
    });
    return {
      inputHash: result.inputHash,
      documentCount: result.documentCount,
      documents: result.documents.slice(0, 12).map((document) => ({
        documentId: document.documentId,
        title: boundedRequiredText(document.title, 500),
        text: boundedRequiredText(document.text, 8_000),
        sourceScope: document.sourceScope, sourceDate: document.sourceDate, sourceSnapshotId: document.sourceSnapshotId,
      })),
      dataGaps: result.dataGaps
        .slice(0, 20)
        .map((gap) => boundedRequiredText(gap, 200)),
    };
  }

  async scrapeUrlWorkflow({ context, input }: { context: SourcingOwnerExecutionContext; input: { sourceUrl: string } }) {
    const idempotencyKey = requiredOwnerReceipt(context, input);
    return this.scrapes.collect({ organizationId: context.organizationId, userId: context.initiatingUserId,
      sourceUrl: input.sourceUrl, idempotencyKey });
  }

  async collectShadowSignals({ context, input }: { context: SourcingOwnerExecutionContext; input: Record<string, never> }) {
    return this.shadow.collectShadowSignals({
      organizationId: context.organizationId,
      requestedByUserId: context.initiatingUserId,
      idempotencyKey: requiredOwnerReceipt(context, input),
    });
  }
}

function requiredIdempotency(input: { ownerIdempotencyKey?: string }): string {
  if (!input.ownerIdempotencyKey?.trim()) throw new Error('owner_idempotency_key_required');
  return input.ownerIdempotencyKey;
}

function requiredOwnerReceipt(
  context: SourcingOwnerExecutionContext,
  input: unknown,
): string {
  const ownerIdempotencyKey = requiredIdempotency(context);
  requiredOwnerInputHash(context, input);
  return ownerIdempotencyKey;
}

function requiredOwnerInputHash(
  context: SourcingOwnerExecutionContext,
  input: unknown,
): string {
  if (
    !context.ownerInputHash ||
    context.ownerInputHash !== canonicalOwnerInputHash(input)
  ) {
    throw new Error('owner_idempotency_input_conflict');
  }
  return context.ownerInputHash;
}

function boundedRequiredText(value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('sourcing_evidence_text_missing');
  return normalized.slice(0, maximum);
}
