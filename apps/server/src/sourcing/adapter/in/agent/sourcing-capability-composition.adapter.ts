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

/** Sourcing owns direct definition-to-owner-port adapters. */
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
      defineCapabilityComposition(sourcingCapability('sourcing.duplicateCheck'), this.sourcing, {
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
      defineCapabilityComposition(sourcingCapability('sourcing.scrapeProductUrl'), this.sourcing, {
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
      defineCapabilityComposition(sourcingCapability('sourcing.ingestCandidate'), this.sourcing, {
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
      defineCapabilityComposition(sourcingCapability('sourcing.retrieveWorkspaceEvidence'), this.sourcing, {
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
      defineCapabilityComposition(sourcingCapability('sourcing.inspectRecommendationRun'), this.sourcing, {
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
      defineCapabilityComposition(sourcingCapability('sourcing.refreshValidation'), this.sourcing, {
        capabilityKey: 'sourcing.refreshValidation',
        ownerInputPort: 'sourcing.refreshValidation',
        invoke: ({ context, input }) =>
          this.sourcing.refreshValidation({
            context: sourcingMutationContext(context),
            input,
          }),
      }),
      defineCapabilityComposition(sourcingCapability('sourcing.createReviewBatch'), this.sourcing, {
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
    ];
  }
}

type SourcingCapability = (typeof SOURCING_CAPABILITIES)[number];

function sourcingCapability<K extends SourcingCapability['key']>(
  key: K,
): Extract<SourcingCapability, { key: K }> {
  const definition = SOURCING_CAPABILITIES.find(
    (candidate): candidate is Extract<SourcingCapability, { key: K }> =>
      candidate.key === key,
  );
  if (!definition) throw new Error(`sourcing_capability_definition_missing:${key}`);
  return definition;
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
