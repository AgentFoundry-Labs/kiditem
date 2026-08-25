import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../domain/sourcing-stable-json';
import {
  SOURCING_RECOMMENDATION_REPOSITORY_PORT,
  type SourcingRecommendationRepositoryPort,
} from '../port/out/repository/sourcing-recommendation.repository.port';
import {
  SOURCING_REVIEW_REPOSITORY_PORT,
  type SourcingReviewRepositoryPort,
} from '../port/out/repository/sourcing-review.repository.port';

@Injectable()
export class SourcingReviewService {
  constructor(
    @Inject(SOURCING_RECOMMENDATION_REPOSITORY_PORT)
    private readonly recommendations: SourcingRecommendationRepositoryPort,
    @Inject(SOURCING_REVIEW_REPOSITORY_PORT)
    private readonly repository: SourcingReviewRepositoryPort,
  ) {}

  async listSelections(input: {
    organizationId: string;
    workspaceKey: 'entry' | 'final';
    recommendationRunId: string;
  }) {
    await this.requireRun(input.organizationId, input.recommendationRunId);
    return this.repository.listSelections(input);
  }

  async saveSelection(input: {
    organizationId: string;
    workspaceKey: 'entry' | 'final';
    recommendationRunId: string;
    itemKey: string;
    state: 'neutral' | 'selected' | 'removed';
    expectedVersion: number;
  }) {
    const run = await this.requireRun(input.organizationId, input.recommendationRunId);
    if (!run.items.some((item) => item.itemKey === input.itemKey)) {
      throw new BadRequestException('Recommendation item does not belong to this run');
    }

    const result = await this.repository.saveSelection(input);
    if (result.kind === 'version_conflict') {
      throw new ConflictException({
        code: 'REVIEW_SELECTION_VERSION_CONFLICT',
        currentVersion: result.currentVersion,
      });
    }
    return result.selection;
  }

  async createBatch(input: {
    organizationId: string;
    requestedByUserId: string;
    recommendationRunId: string;
    itemKeys: string[];
    idempotencyKey: string;
    requestHash?: string;
    workspaceKey?: 'entry' | 'final';
    expectedSelections?: Array<{
      itemKey: string;
      expectedVersion: number;
    }>;
  }) {
    const run = await this.requireRun(input.organizationId, input.recommendationRunId);
    const itemKeys = [...new Set(input.itemKeys.map((itemKey) => itemKey.trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    if (itemKeys.length === 0) {
      throw new BadRequestException('At least one recommendation item is required');
    }
    const byKey = new Map(run.items.map((item) => [item.itemKey, item]));
    const invalidItems = itemKeys.filter((itemKey) => {
      const item = byKey.get(itemKey);
      return !item
        || item.sourcePlatform !== '1688'
        || offerObservationIds(item.sourceSnapshot).length === 0;
    });
    if (invalidItems.length > 0) {
      throw new BadRequestException({
        code: 'REVIEW_BATCH_INVALID_ITEMS',
        itemKeys: invalidItems,
      });
    }

    const expectedSelections = input.expectedSelections
      ? [...input.expectedSelections]
          .map((selection) => ({
            itemKey: selection.itemKey.trim(),
            expectedVersion: selection.expectedVersion,
          }))
          .sort((left, right) => left.itemKey.localeCompare(right.itemKey))
      : undefined;
    const requestHash = input.requestHash ?? createHash('sha256').update(canonicalJson({
      recommendationRunId: input.recommendationRunId,
      itemKeys,
      ...(input.workspaceKey && expectedSelections
        ? {
            workspaceKey: input.workspaceKey,
            expectedSelections,
          }
        : {}),
    })).digest('hex');
    const result = await this.repository.createBatch({
      ...input,
      itemKeys,
      expectedSelections,
      requestHash,
    });
    if (result.kind === 'idempotency_conflict') {
      throw new ConflictException({ code: 'REVIEW_BATCH_IDEMPOTENCY_CONFLICT' });
    }
    if (result.kind === 'selection_conflict') {
      throw new ConflictException({
        code: 'REVIEW_SELECTION_VERSION_CONFLICT',
        itemKeys: result.itemKeys,
      });
    }
    if (result.kind === 'invalid_items') {
      throw new BadRequestException({
        code: 'REVIEW_BATCH_INVALID_ITEMS',
        itemKeys: result.itemKeys,
      });
    }
    return result.batch;
  }

  async getBatch(organizationId: string, id: string) {
    const batch = await this.repository.findBatch({ organizationId, id });
    if (!batch) throw new NotFoundException('Sourcing review batch not found');
    return batch;
  }

  private async requireRun(organizationId: string, recommendationRunId: string) {
    const run = await this.recommendations.findById({
      organizationId,
      id: recommendationRunId,
    });
    if (!run) throw new NotFoundException('Sourcing recommendation run not found');
    return run;
  }
}

function offerObservationIds(value: Record<string, unknown>): string[] {
  const raw = value.offerObservationIds;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : []);
}
