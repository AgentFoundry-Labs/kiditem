import { Inject, Injectable } from '@nestjs/common';
import { deriveOwnerIdempotencyKey } from '../../../../common/owner-idempotency-key';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
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
import { SOURCING_SCRAPE_URL_OPERATION } from '../../../domain/operation/sourcing.operations';
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
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operations: OperationRunnerPort,
    @Inject(SOURCING_CAPABILITY_ADMISSION_PORT)
    private readonly admissions: SourcingCapabilityAdmissionPort,
  ) {}

  duplicateCheck({ context, input }: { context: Pick<SourcingOwnerExecutionContext, 'organizationId'>; input: { sourceUrl: string } }) {
    return this.discovery.duplicateCheck({ organizationId: context.organizationId, sourceUrl: input.sourceUrl });
  }

  async scrapeProductUrl({ context, input }: { context: Pick<SourcingOwnerExecutionContext, 'organizationId' | 'initiatingUserId' | 'attemptId'>; input: { sourceUrl: string } }) {
    const snapshot = await this.discovery.scrapeProductUrl({ sourceUrl: input.sourceUrl });
    this.admissions.recordScrapeSnapshot({ ...context, snapshot });
    return { snapshot };
  }

  async ingestCandidate({ context, input }: { context: SourcingOwnerExecutionContext & { ownerIdempotencyKey: string }; input: { snapshot: import('../../../application/port/in/capability/sourcing-final-capability.port').SourcingSourceSnapshot } }) {
    const idempotencyKey = requiredDerivedIdempotency(
      context,
      'sourcing.ingestCandidate',
      input,
    );
    return this.discovery.ingestCandidate({
      organizationId: context.organizationId,
      initiatingUserId: context.initiatingUserId,
      idempotencyKey,
      snapshot: input.snapshot,
    });
  }

  async createReviewBatch({ context, input }: { context: SourcingOwnerExecutionContext; input: { recommendationRunId: string; workspaceKey: 'entry' | 'final'; items: Array<{ itemKey: string; expectedVersion: number }> } }) {
    const ownerIdempotencyKey = requiredDerivedIdempotency(
      context,
      'sourcing.createReviewBatch',
      input,
    );
    return this.mutations.createReviewBatch({
      organizationId: context.organizationId,
      requestedByUserId: context.initiatingUserId,
      recommendationRunId: input.recommendationRunId,
      workspaceKey: input.workspaceKey,
      items: input.items,
      idempotencyKey: ownerIdempotencyKey,
    });
  }

  async inspectRecommendationRun({ context, input }: { context: Pick<SourcingOwnerExecutionContext, 'organizationId'>; input: { recommendationRunId?: string } }) {
    return this.reads.inspectRecommendationRun({
      organizationId: context.organizationId,
      recommendationRunId: input.recommendationRunId ?? null,
    });
  }

  async refreshCollection({ context, input }: { context: SourcingOwnerExecutionContext; input: { sources: Array<'naver' | '1688' | 'shorts'> } }) {
    const ownerIdempotencyKey = requiredDerivedIdempotency(
      context,
      'sourcing.refreshCollection',
      input,
    );
    const run = await this.operations.start({
      organizationId: context.organizationId,
      operationKey: 'sourcing.collect_daily_trends',
      triggerSource: 'agent',
      input: { sources: input.sources },
      requestedByUserId: context.initiatingUserId,
      idempotencyKey: ownerIdempotencyKey,
    });
    return { operationRunId: run.id, status: run.status };
  }

  async refreshValidation({ context, input }: { context: SourcingOwnerExecutionContext & { ownerIdempotencyKey: string }; input: { recommendationRunId: string } }) {
    const ownerIdempotencyKey = requiredDerivedIdempotency(
      context,
      'sourcing.refreshValidation',
      input,
    );
    return this.mutations.refreshValidation({
      organizationId: context.organizationId,
      recommendationRunId: input.recommendationRunId,
      idempotencyKey: ownerIdempotencyKey,
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
    const idempotencyKey = requiredDerivedIdempotency(
      context,
      'sourcing.scrapeUrlWorkflow',
      input,
    );
    const duplicate = await this.discovery.duplicateCheck({
      organizationId: context.organizationId,
      sourceUrl: input.sourceUrl,
    });
    if (duplicate.duplicate && duplicate.candidateId) {
      return { kind: 'existing' as const, candidateId: duplicate.candidateId };
    }
    const run = await this.operations.start({
      organizationId: context.organizationId,
      operationKey: SOURCING_SCRAPE_URL_OPERATION.key,
      triggerSource: 'agent',
      input: { sourceUrl: input.sourceUrl },
      requestedByUserId: context.initiatingUserId,
      idempotencyKey,
    });
    return { kind: 'enqueued' as const, operationRunId: run.id, status: run.status };
  }

  async collectShadowSignals({ context, input }: { context: SourcingOwnerExecutionContext; input: Record<string, never> }) {
    return this.shadow.collectShadowSignals({
      organizationId: context.organizationId,
      requestedByUserId: context.initiatingUserId,
      idempotencyKey: requiredDerivedIdempotency(
        context,
        'sourcing.collect_shadow_signals',
        input,
      ),
    });
  }
}

function requiredIdempotency(input: { ownerIdempotencyKey?: string }): string {
  if (!input.ownerIdempotencyKey?.trim()) throw new Error('owner_idempotency_key_required');
  return input.ownerIdempotencyKey;
}

function requiredDerivedIdempotency(
  context: SourcingOwnerExecutionContext,
  capabilityKey: string,
  input: unknown,
): string {
  const ownerIdempotencyKey = requiredIdempotency(context);
  const expected = deriveOwnerIdempotencyKey({
    attemptId: context.attemptId,
    capabilityKey,
    input,
  });
  if (ownerIdempotencyKey !== expected) {
    throw new Error('owner_idempotency_input_conflict');
  }
  return ownerIdempotencyKey;
}

function boundedRequiredText(value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('sourcing_evidence_text_missing');
  return normalized.slice(0, maximum);
}
