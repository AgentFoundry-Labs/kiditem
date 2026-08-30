import { Inject, Injectable } from '@nestjs/common';
import {
  defineCapabilityComposition,
  type CapabilityExecutionContext,
} from '../../../../common/capability-composition';
import { SOURCING_CAPABILITIES } from '../../../domain/capability/sourcing.capabilities';
import {
  SOURCING_FINAL_CAPABILITY_PORT,
  type SourcingFinalCapabilityPort,
  type SourcingMutationExecutionContext,
} from '../../../application/port/in/capability/sourcing-final-capability.port';
import type { SourcingCapabilityCompositionPort } from '../../../application/port/in/capability/sourcing-capability-composition.port';

/** Sourcing owns all ten definition-to-owner-port Adapters. */
@Injectable()
export class SourcingCapabilityCompositionAdapter
  implements SourcingCapabilityCompositionPort
{
  readonly compositions;

  constructor(
    @Inject(SOURCING_FINAL_CAPABILITY_PORT)
    private readonly sourcing: SourcingFinalCapabilityPort,
  ) {
    this.compositions = [
      defineCapabilityComposition(SOURCING_CAPABILITIES[0], this.sourcing, {
        capabilityKey: 'sourcing.duplicateCheck',
        ownerInputPort: 'sourcing.duplicateCheck',
        invoke: ({ context, input }) =>
          this.sourcing.duplicateCheck({
            context: { organizationId: context.organizationId },
            input,
          }),
        resourceRef: (output) =>
          output.candidateId
            ? { kind: 'sourcing_candidate', id: output.candidateId }
            : null,
      }),
      defineCapabilityComposition(SOURCING_CAPABILITIES[1], this.sourcing, {
        capabilityKey: 'sourcing.scrapeProductUrl',
        ownerInputPort: 'sourcing.scrapeProductUrl',
        invoke: ({ context, input }) =>
          this.sourcing.scrapeProductUrl({
            context: {
              organizationId: context.organizationId,
              initiatingUserId: context.initiatingUserId,
              executionId: context.executionId,
            },
            input,
          }),
      }),
      defineCapabilityComposition(SOURCING_CAPABILITIES[2], this.sourcing, {
        capabilityKey: 'sourcing.ingestCandidate',
        ownerInputPort: 'sourcing.ingestCandidate',
        invoke: ({ context, input }) =>
          this.sourcing.ingestCandidate({
            context: sourcingMutationContext(context),
            input,
          }),
        resourceRef: (output) => ({
          kind: 'sourcing_candidate',
          id: output.candidateId,
        }),
      }),
      defineCapabilityComposition(SOURCING_CAPABILITIES[3], this.sourcing, {
        capabilityKey: 'sourcing.scrapeUrlWorkflow',
        ownerInputPort: 'sourcing.scrapeUrlWorkflow',
        invoke: ({ context, input }) =>
          this.sourcing.scrapeUrlWorkflow({
            context: sourcingMutationContext(context),
            input,
          }),
        resourceRef: (output) =>
          output.kind === 'existing'
            ? { kind: 'sourcing_candidate', id: output.candidateId }
            : null,
        operationRef: (output) =>
          output.kind === 'enqueued' ? output.operationRunId : null,
      }),
      defineCapabilityComposition(SOURCING_CAPABILITIES[4], this.sourcing, {
        capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
        ownerInputPort: 'sourcing.retrieveWorkspaceEvidence',
        invoke: ({ context, input }) =>
          this.sourcing.retrieveWorkspaceEvidence({
            context: { organizationId: context.organizationId },
            input,
          }),
        resourceRef: (output) => ({
          kind: 'sourcing_workspace_evidence',
          id: output.inputHash,
        }),
      }),
      defineCapabilityComposition(SOURCING_CAPABILITIES[5], this.sourcing, {
        capabilityKey: 'sourcing.inspectRecommendationRun',
        ownerInputPort: 'sourcing.inspectRecommendationRun',
        invoke: ({ context, input }) =>
          this.sourcing.inspectRecommendationRun({
            context: { organizationId: context.organizationId },
            input,
          }),
        resourceRef: (output) => ({
          kind: 'sourcing_recommendation_run',
          id: output.runId,
        }),
      }),
      defineCapabilityComposition(SOURCING_CAPABILITIES[6], this.sourcing, {
        capabilityKey: 'sourcing.refreshCollection',
        ownerInputPort: 'sourcing.refreshCollection',
        invoke: ({ context, input }) =>
          this.sourcing.refreshCollection({
            context: sourcingMutationContext(context),
            input,
          }),
        operationRef: (output) => output.operationRunId,
      }),
      defineCapabilityComposition(SOURCING_CAPABILITIES[7], this.sourcing, {
        capabilityKey: 'sourcing.refreshValidation',
        ownerInputPort: 'sourcing.refreshValidation',
        invoke: ({ context, input }) =>
          this.sourcing.refreshValidation({
            context: sourcingMutationContext(context),
            input,
          }),
      }),
      defineCapabilityComposition(SOURCING_CAPABILITIES[8], this.sourcing, {
        capabilityKey: 'sourcing.createReviewBatch',
        ownerInputPort: 'sourcing.createReviewBatch',
        invoke: ({ context, input }) =>
          this.sourcing.createReviewBatch({
            context: sourcingMutationContext(context),
            input,
          }),
        resourceRef: (output) => ({
          kind: 'sourcing_review_batch',
          id: output.reviewBatchId,
        }),
      }),
      defineCapabilityComposition(SOURCING_CAPABILITIES[9], this.sourcing, {
        capabilityKey: 'sourcing.collect_shadow_signals',
        ownerInputPort: 'sourcing.collectShadowSignals',
        invoke: ({ context, input }) =>
          this.sourcing.collectShadowSignals({
            context: sourcingMutationContext(context),
            input,
          }),
        operationRef: (output) => output.operationRunId,
      }),
    ];
  }
}

function sourcingMutationContext(
  context: CapabilityExecutionContext,
): SourcingMutationExecutionContext {
  return {
    organizationId: context.organizationId,
    initiatingUserId: context.initiatingUserId,
    executionId: context.executionId,
    ownerIdempotencyKey: requiredOwnerIdempotencyKey(context),
    ownerInputHash: requiredOwnerInputHash(context),
  };
}

function requiredOwnerIdempotencyKey(
  context: CapabilityExecutionContext,
): string {
  if (!context.ownerIdempotencyKey?.trim()) {
    throw new Error('owner_idempotency_key_required');
  }
  return context.ownerIdempotencyKey;
}

function requiredOwnerInputHash(
  context: CapabilityExecutionContext,
): string {
  if (!context.ownerInputHash?.match(/^[a-f0-9]{64}$/)) {
    throw new Error('owner_input_hash_required');
  }
  return context.ownerInputHash;
}
