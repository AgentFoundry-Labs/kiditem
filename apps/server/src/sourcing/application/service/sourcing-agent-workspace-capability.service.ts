import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  SourcingAgentWorkspaceMutationCapabilityPort,
  SourcingAgentWorkspaceReadCapabilityPort,
  SourcingWorkspaceEvidenceResult,
} from '../port/in/capability/sourcing-agent-workspace-capability.port';
import {
  SOURCING_RECOMMENDATION_REPOSITORY_PORT,
  type SourcingRecommendationRepositoryPort,
} from '../port/out/repository/sourcing-recommendation.repository.port';
import {
  SOURCING_VALIDATION_REPOSITORY_PORT,
  type SourcingValidationRepositoryPort,
} from '../port/out/repository/sourcing-validation.repository.port';
import { SourcingAgentRagService } from './sourcing-agent-rag.service';
import { SourcingReviewService } from './sourcing-review.service';
import { SourcingValidationService } from './sourcing-validation.service';
import { canonicalOwnerInputHash } from '../../../common/owner-idempotency-key';
import { businessDateKey } from '../../../common/kst';

@Injectable()
export class SourcingAgentWorkspaceReadCapabilityService
  implements SourcingAgentWorkspaceReadCapabilityPort
{
  constructor(
    private readonly rag: SourcingAgentRagService,
    @Inject(SOURCING_RECOMMENDATION_REPOSITORY_PORT)
    private readonly recommendations: SourcingRecommendationRepositoryPort,
    @Inject(SOURCING_VALIDATION_REPOSITORY_PORT)
    private readonly validationRows: SourcingValidationRepositoryPort,
  ) {}

  retrieveWorkspaceEvidence(input: {
    organizationId: string;
    query: string;
    topK?: number;
    days?: number;
  }): Promise<SourcingWorkspaceEvidenceResult> {
    return this.rag.retrieveWorkspaceEvidence(input);
  }

  async inspectRecommendationRun(input: {
    organizationId: string;
    recommendationRunId?: string | null;
  }) {
    const run = input.recommendationRunId
      ? await this.recommendations.findById({
          organizationId: input.organizationId,
          id: input.recommendationRunId,
        })
      : await this.recommendations.findLatest({
          organizationId: input.organizationId,
          now: new Date(),
        });
    if (!run) {
      throw new NotFoundException({ code: 'RECOMMENDATION_RUN_MISSING' });
    }
    if (run.status === 'staged_complete' || run.status === 'staged_partial') {
      throw new NotFoundException({ code: 'RECOMMENDATION_RUN_MISSING' });
    }
    const validation = await this.validationRows.listForRun({
      organizationId: input.organizationId,
      recommendationRunId: run.id,
      limit: 100,
    });
    const missingCount = validation.items.reduce(
      (count, item) => count + item.checks.filter(
        (check) =>
          check.status === 'missing' ||
          check.status === 'pending' ||
          check.status === 'fail',
      ).length,
      0,
    );
    return {
      runId: run.id,
      status: run.status,
      businessDate: businessDateKey(run.businessDate),
      itemCount: run.items.length,
      warningCodes: [...run.warningCodes],
      validation: {
        itemCount: validation.items.length,
        missingCount,
      },
    };
  }

}

@Injectable()
export class SourcingAgentWorkspaceMutationCapabilityService
  implements SourcingAgentWorkspaceMutationCapabilityPort
{
  constructor(
    private readonly validations: SourcingValidationService,
    private readonly reviews: SourcingReviewService,
  ) {}

  async refreshValidation(input: {
    organizationId: string;
    recommendationRunId: string;
    idempotencyKey: string;
    requestHash: string;
  }) {
    if (!input.idempotencyKey.trim()) throw new Error('owner_idempotency_key_required');
    if (input.requestHash !== canonicalOwnerInputHash(refreshValidationBusinessInput(input))) {
      throw new Error('owner_idempotency_input_conflict');
    }
    const envelope = await this.validations.refreshForRun(input);
    if (!envelope.data) {
      throw new NotFoundException({
        code: envelope.error?.code ?? 'RECOMMENDATION_RUN_MISSING',
      });
    }
    const missingEvidence = [
      ...new Set(
        envelope.data.items.flatMap((item) =>
          item.checks.flatMap((check) =>
            check.status === 'missing' ||
            check.status === 'pending' ||
            check.status === 'fail'
              ? [check.checkKey]
              : [],
          ),
        ),
      ),
    ].sort();
    return {
      recommendationRunId: envelope.data.recommendationRunId,
      validationEpisodeIds: envelope.data.items.map((item) => item.episodeId),
      missingEvidence,
    };
  }

  async createReviewBatch(input: {
    organizationId: string;
    requestedByUserId: string;
    recommendationRunId: string;
    workspaceKey: 'entry' | 'final';
    items: Array<{ itemKey: string; expectedVersion: number }>;
    idempotencyKey: string;
    requestHash: string;
  }) {
    if (input.requestHash !== canonicalOwnerInputHash(reviewBatchBusinessInput(input))) {
      throw new Error('owner_idempotency_input_conflict');
    }
    const expectedSelections = [...input.items]
      .map((item) => ({
        itemKey: item.itemKey.trim(),
        expectedVersion: item.expectedVersion,
      }))
      .sort((left, right) => left.itemKey.localeCompare(right.itemKey));
    const batch = await this.reviews.createBatch({
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      recommendationRunId: input.recommendationRunId,
      workspaceKey: input.workspaceKey,
      expectedSelections,
      itemKeys: expectedSelections.map((item) => item.itemKey),
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
    });
    return {
      reviewBatchId: batch.id,
      itemCount: batch.itemCount,
      status: batch.status,
    };
  }
}

function refreshValidationBusinessInput(input: { recommendationRunId: string }) {
  return { recommendationRunId: input.recommendationRunId };
}

function reviewBatchBusinessInput(input: {
  recommendationRunId: string;
  workspaceKey: 'entry' | 'final';
  items: Array<{ itemKey: string; expectedVersion: number }>;
}) {
  return {
    recommendationRunId: input.recommendationRunId,
    workspaceKey: input.workspaceKey,
    items: input.items,
  };
}
