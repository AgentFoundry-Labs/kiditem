import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  SourcingCoupangObservationCommandSchema, SourcingWingCatalogBatchInputSchema,
  SourcingWingCatalogFinalizeSchema, SourcingWingCatalogKeywordSchema,
  SourcingWingCatalogObservationBatchSchema, SourcingWingCatalogSnapshotSchema,
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
import { assertToken, boundedText, requireIdempotencyKey, toPermit } from './sourcing-source-attempt-primitives';
import type { AuthorizedCollectionOutput, SourcingCollectionPermit } from '../port/out/repository/sourcing-collection.repository.port';

const SOURCE = 'coupang.wing_catalog';
const SCOPE = { sourceKey: SOURCE, scopeKey: 'default', targetKey: 'catalog' };
const ALERT = { sourceType: SOURCE, dedupeKey: 'source:coupang-wing-catalog',
  title: 'Wing 카탈로그 수집 실패', href: '/sourcing-ai/wing-catalog' };
const ReceiptSchema = z.object({
  sequence: z.number().int().min(0).max(11), keyword: SourcingWingCatalogKeywordSchema,
  checksum: z.string().regex(/^[a-f0-9]{64}$/), count: z.number().int().min(0).max(100),
  acceptedCount: z.number().int().min(0).max(100).optional(),
  duplicateCount: z.number().int().min(0).max(100),
}).strict();
const FinalizeSchema = SourcingWingCatalogFinalizeSchema.extend({ receipts: z.array(ReceiptSchema).max(12) });
export type SourcingWingCatalogIngestInput = SourcingCoupangObservationCommand & {
  organizationId: string; actorUserId: string;
};

@Injectable()
export class SourcingWingCatalogIngestService {
  constructor(
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
    @Inject(SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT)
    private readonly sources: SourcingRecommendationSourceRepositoryPort,
  ) {}

  async begin(input: { organizationId: string; requestedByUserId: string | null; idempotencyKey: string; input: unknown }) {
    const parsed = SourcingWingCatalogBatchInputSchema.safeParse(input.input);
    if (!parsed.success) throw new BadRequestException('INVALID_WING_CATALOG_REQUEST');
    const plan = { source: SOURCE, ...parsed.data };
    const { attempt } = await this.attempts.beginAttempt({
      organizationId: input.organizationId, ...SCOPE, idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
      requestFingerprint: hashCollectionRequest(plan), plan, planChecksum: hashCollectionRequest(plan),
      requestedByUserId: input.requestedByUserId, collectorKey: 'wing-catalog-observation-ingest',
      collectorVersion: 'coupang-wing-catalog/v2', expiresInMs: 15 * 60_000, failureAlert: ALERT,
    });
    return attempt;
  }

  async read(input: { organizationId: string; attemptId: string }) {
    const attempt = await this.attempts.readAttempt(input);
    if (!attempt || attempt.sourceKey !== SOURCE || attempt.scopeKey !== SCOPE.scopeKey
      || attempt.targetKey !== SCOPE.targetKey || attempt.plan.source !== SOURCE) {
      throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    }
    return attempt;
  }

  async current(organizationId: string) {
    const status = await this.attempts.readSourceStatus({ organizationId, ...SCOPE, currentPlanChecksum: '' });
    return status.latestAttempt;
  }

  async upload(input: { organizationId: string; attemptId: string; attemptToken: string; batch: unknown }) {
    const attempt = await this.read(input);
    assertToken(attempt, input.attemptToken);
    const { source: _source, ...frozen } = attempt.plan;
    const plan = SourcingWingCatalogBatchInputSchema.parse(frozen);
    const parsed = SourcingWingCatalogObservationBatchSchema.safeParse(input.batch);
    if (!parsed.success) throw new BadRequestException('INVALID_WING_CATALOG_BATCH');
    const batch = parsed.data;
    const keyword = sourcingWingCatalogKeywordIdentity(batch.keyword);
    const sequence = plan.keywords.findIndex((value) => sourcingWingCatalogKeywordIdentity(value) === keyword);
    if (sequence < 0 || batch.maxPages !== plan.maxPages || batch.purpose !== plan.purpose
      || batch.items.some((item) => sourcingWingCatalogKeywordIdentity(item.sourceKeyword) !== keyword)) {
      throw new ConflictException('SOURCE_PLAN_MISMATCH');
    }
    return this.attempts.stageWingCatalogBatch({
      organizationId: input.organizationId, attemptId: input.attemptId, attemptToken: input.attemptToken,
      planChecksum: attempt.planChecksum, sequence, keyword: plan.keywords[sequence], checksum: hashCollectionRequest(batch),
      output: buildBatchOutput({ organizationId: input.organizationId,
        permit: toPermit(attempt, input.organizationId), items: batch.items }),
    });
  }

  async complete(input: { organizationId: string; attemptId: string; attemptToken: string; finalization: unknown }) {
    const attempt = await this.read(input);
    assertToken(attempt, input.attemptToken);
    const { source: _source, ...frozen } = attempt.plan;
    const plan = SourcingWingCatalogBatchInputSchema.parse(frozen);
    const parsed = FinalizeSchema.safeParse(input.finalization);
    if (!parsed.success) throw new BadRequestException('INVALID_WING_CATALOG_FINALIZATION');
    const finalization = parsed.data;
    if (finalization.purpose !== plan.purpose || finalization.keywords.length !== plan.keywords.length
      || finalization.keywords.some((result, index) => sourcingWingCatalogKeywordIdentity(result.keyword)
        !== sourcingWingCatalogKeywordIdentity(plan.keywords[index]))) throw new ConflictException('SOURCE_PLAN_MISMATCH');
    if (finalization.keywords.some((result) => result.outcome === 'failed' || result.failed > 0)) {
      return this.fail({ ...input, code: 'SOURCE_PLAN_INCOMPLETE',
        message: 'Wing catalog collection did not complete every requested keyword.' });
    }
    if (finalization.receipts.some((receipt, index) => {
      const result = finalization.keywords[index];
      const acceptedCount = receipt.acceptedCount ?? receipt.count - receipt.duplicateCount;
      return !result || receipt.count !== result.discovered || receipt.count !== result.accepted + result.duplicate
        || acceptedCount !== result.accepted || receipt.duplicateCount !== result.duplicate;
    })) throw new ConflictException('SOURCE_RECEIPTS_MISMATCH');
    return this.attempts.completeWingCatalogAttempt({
      organizationId: input.organizationId, attemptId: input.attemptId, attemptToken: input.attemptToken,
      planChecksum: attempt.planChecksum, contentChecksum: hashCollectionRequest(finalization),
      receipts: finalization.receipts,
      qualityReport: { source: SOURCE, snapshots: plan.keywords.map((keyword) => ({
        keyword: sourcingWingCatalogKeywordIdentity(keyword),
      })) },
    });
  }

  /** Operator stop without the attempt token; only a Wing catalog attempt of this organization. */
  async cancel(input: { organizationId: string; attemptId: string }) {
    await this.read(input);
    return this.attempts.cancelAttempt(input);
  }

  async fail(input: { organizationId: string; attemptId: string; attemptToken: string; code: string; message: string }) {
    await this.read(input);
    return this.attempts.failAttempt({ ...input, code: boundedText(input.code, 100) || 'SOURCE_COLLECTION_FAILED',
      message: boundedText(input.message, 1000) || 'Wing catalog collection failed.',});
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
