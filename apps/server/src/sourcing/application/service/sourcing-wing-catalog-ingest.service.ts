import { Inject, Injectable } from '@nestjs/common';
import {
  SourcingCoupangObservationCommandSchema, SourcingWingCatalogKeywordSchema,
  SourcingWingCatalogSnapshotSchema,
  sourcingWingCatalogKeywordIdentity, type SourcingCoupangObservationCommand,
  type SourcingWingCatalogObservation, type SourcingWingCatalogSnapshot,
} from '@kiditem/shared/sourcing';
import {
  SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type SourcingBrowserSourceAttemptRepositoryPort,
} from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import {
  SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT,
  type SourcingRecommendationSourceRepositoryPort,
} from '../port/out/repository/sourcing-recommendation-source.repository.port';
import { hashCollectionRequest } from './sourcing-collection-mappers';
import { buildWingCatalogOutput as buildBatchOutput } from './sourcing-wing-catalog.mapper';
import { toPermit } from './sourcing-source-attempt-primitives';

const SOURCE = 'coupang.wing_catalog';
const SCOPE = { sourceKey: SOURCE, scopeKey: 'default', targetKey: 'catalog' };
const ALERT = { sourceType: SOURCE, dedupeKey: 'source:coupang-wing-catalog',
  title: 'Wing 카탈로그 수집 실패', href: '/sourcing-ai/wing-catalog' };
export type SourcingWingCatalogIngestInput = SourcingCoupangObservationCommand & {
  organizationId: string; actorUserId: string;
};

/**
 * Wing 카탈로그 원천의 서버 입구: 수동 적재(POST workspace/coupang-observations, run 표 attempt — 서버 구동)와
 * 키워드 스냅숏 읽기. 확장 수집은 실행 kind `sourcing.wing_catalog`(KID-360)다.
 */
@Injectable()
export class SourcingWingCatalogIngestService {
  constructor(
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
    @Inject(SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT)
    private readonly sources: SourcingRecommendationSourceRepositoryPort,
  ) {}

  /** 끝난 Wing 검색 소싱 실행(KID-360)의 발행 용도. 발행이 없으면(실패·진행 중·다른 원천) null. */
  publishedPurpose(input: { organizationId: string; operationId: string }): Promise<string | null> {
    return this.sources.findWingPublicationPurpose(input);
  }

  async ingest(input: SourcingWingCatalogIngestInput) {
    const command = SourcingCoupangObservationCommandSchema.parse({ idempotencyKey: input.idempotencyKey, items: input.items });
    const items = deduplicateExactManualObservations(
      command.items.map(toCurrentObservation),
    );
    const keywords = [...new Set(items.map((item) => sourcingWingCatalogKeywordIdentity(item.sourceKeyword)))];
    const plan = { source: SOURCE, kind: 'manual', keywords };
    const { attempt } = await this.attempts.beginAttempt({
      organizationId: input.organizationId, ...SCOPE, idempotencyKey: command.idempotencyKey,
      requestFingerprint: hashCollectionRequest(command), plan, planChecksum: hashCollectionRequest(plan),
      requestedByUserId: input.actorUserId, collectorKey: 'wing-catalog-observation-ingest',
      collectorVersion: 'coupang-wing-catalog/v2', triggerKind: 'manual', expiresInMs: 15 * 60_000, failureAlert: ALERT,
    });
    return this.attempts.completeAttempt({
      organizationId: input.organizationId, attemptId: attempt.attemptId, attemptToken: attempt.attemptToken,
      planChecksum: attempt.planChecksum, contentChecksum: hashCollectionRequest(command),
      output: { ...buildBatchOutput({ organizationId: input.organizationId, permit: toPermit(attempt, input.organizationId), items }),
        qualityReport: {
          source: SOURCE,
          snapshots: keywords.map((keyword) => ({ keyword })),
          wingReceipts: keywords.map((keyword) => {
            const count = items.filter((item) =>
              sourcingWingCatalogKeywordIdentity(item.sourceKeyword) === keyword).length;
            return { count, acceptedCount: count, duplicateCount: 0 };
          }),
        } },
    });
  }

  async snapshot(input: { organizationId: string; keyword: string }): Promise<SourcingWingCatalogSnapshot> {
    const keyword = SourcingWingCatalogKeywordSchema.parse(input.keyword);
    const result = await this.sources.listWingCatalogSnapshot({
      organizationId: input.organizationId, normalizedKeyword: sourcingWingCatalogKeywordIdentity(keyword), limit: 400,
    });
    return SourcingWingCatalogSnapshotSchema.parse({ keyword,
      generatedAt: result.generatedAt?.toISOString() ?? null, items: result.items, rejectedCount: result.rejectedCount });
  }
}

function deduplicateExactManualObservations(
  items: SourcingWingCatalogObservation[],
): SourcingWingCatalogObservation[] {
  const byPayload = new Map<string, SourcingWingCatalogObservation>();
  for (const item of items) {
    const identity = hashCollectionRequest(item);
    if (!byPayload.has(identity)) byPayload.set(identity, item);
  }
  return [...byPayload.values()];
}

function toCurrentObservation(
  item: SourcingCoupangObservationCommand['items'][number],
): SourcingWingCatalogObservation {
  return {
    ...item,
    itemName: null,
    brandName: null,
    manufacture: null,
    categoryHierarchy: null,
    imagePath: null,
    estimatedRevenue28d: null,
    conversionRate28d: null,
    deliveryInfo: null,
  };
}
