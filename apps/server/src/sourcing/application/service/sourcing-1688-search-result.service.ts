import { Inject, Injectable } from '@nestjs/common';
import {
  Sourcing1688ImageMatchInputSchema,
  Sourcing1688KeywordBatchInputSchema,
  Sourcing1688SearchSnapshotSchema,
  type Sourcing1688SearchSnapshot,
} from '@kiditem/shared/sourcing';
import {
  SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT,
  type Sourcing1688SearchResultRepositoryPort,
} from '../port/out/repository/sourcing-1688-search-result.repository.port';
import { SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type SourcingBrowserSourceAttemptRepositoryPort } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { hashCollectionRequest, normalizeCollectionTarget } from './sourcing-collection-mappers';

@Injectable()
export class Sourcing1688SearchResultService {
  constructor(
    @Inject(SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT)
    private readonly repository: Sourcing1688SearchResultRepositoryPort,
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
  ) {}

  async latest(input: {
    organizationId: string;
    keywords?: string[];
    targetIds?: string[];
  }): Promise<Sourcing1688SearchSnapshot> {
    const keywords = input.keywords && input.keywords.length > 0
      ? Sourcing1688KeywordBatchInputSchema.parse({ keywords: input.keywords }).keywords
      : undefined;
    const targetIds = input.targetIds && input.targetIds.length > 0
      ? Sourcing1688ImageMatchInputSchema.parse({ targetIds: input.targetIds }).targetIds
      : undefined;
    const imageTargets = targetIds ? await this.repository.resolveImageTargets({ organizationId: input.organizationId, targetIds }) : null;
    const targets = new Map(imageTargets?.targets.map((target) => [target.targetId, target]));
    const plans = [
      ...(keywords ?? []).map((keyword) => ({ keyword, targetId: null,
        targetKey: normalizeCollectionTarget(keyword),
        plan: { source: '1688.hot_product', keyword, maxResults: 6 } })),
      ...(targetIds ?? []).map((targetId) => {
        const target = targets.get(targetId);
        const keyword = target?.searchQuery.trim() || 'unauthorized-target';
        return { keyword, targetId, targetKey: `image-target:${hashCollectionRequest(targetId)}`,
          plan: { source: '1688.image_search', targetId, imageUrl: target?.imageUrl ?? null, keyword, maxResults: 18 } };
      }),
    ];
    const statuses = await Promise.all(plans.map(async ({ keyword, targetId, targetKey, plan }) => ({
      keyword, targetId, source: await this.attempts.readSourceStatus({
        organizationId: input.organizationId, sourceKey: plan.source, scopeKey: 'default', targetKey,
        currentPlanChecksum: hashCollectionRequest(plan),
      }),
    })));
    const snapshot = await this.repository.findLatest({
      organizationId: input.organizationId,
      keywords,
      targetIds,
      // Pin observations to the same COMPLETE identities as the status projection,
      // even if another attempt finishes between these reads.
      completeAttemptIds: plans.length ? statuses.flatMap(({ source }) => source.latestComplete ? [source.latestComplete.attemptId] : []) : undefined,
    });
    return Sourcing1688SearchSnapshotSchema.parse({
      generatedAt: snapshot.generatedAt?.toISOString() ?? null,
      sourceStatuses: statuses.map(({ keyword, targetId, source }) => ({
        keyword, targetId, ready: source.ready,
        latestAttemptId: source.latestAttempt?.attemptId ?? null,
        latestAttemptState: source.latestAttempt?.state ?? null,
        actualCutoffAt: source.actualCutoffAt?.toISOString() ?? null,
        errorCode: source.errorCode, errorMessage: source.errorMessage,
      })),
      observations: snapshot.observations.map((observation) => ({
        keyword: observation.keyword,
        targetId: observation.targetId,
        capturedAt: observation.capturedAt.toISOString(),
        items: observation.items,
      })),
    });
  }
}
