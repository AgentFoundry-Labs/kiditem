import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  KiditemConflictError,
  KiditemInvalidValueError,
  KiditemNotFoundError,
  KiditemPreconditionError,
  type KiditemErrorCode,
} from '@kiditem/shared/errors';
import {
  accountLockKey,
  resourceLockKey,
  type OperationLockKey,
  type OperationPlanResult,
  type OperationStagedChunk,
} from '@kiditem/shared/operation';
import {
  SourcingKeywordSuggestionObservationBatchSchema,
  SourcingWingCatalogBatchInputSchema,
  SourcingWingCatalogObservationBatchSchema,
  SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
  sourcingWingCatalogKeywordIdentity,
  type SourcingWingCatalogObservation,
} from '@kiditem/shared/sourcing';
import {
  SOURCING_CHUNK_KINDS,
  SOURCING_EXTENSION_SCOPE_SCHEMAS,
  SOURCING_OPERATION_KINDS,
  type SourcingExtensionKind,
  type SourcingOperationResult,
} from '@kiditem/shared/sourcing-operation';
import { SourceRecordDuplicateError } from '../../domain/source-record-admission';
import type {
  SourcingExtensionOperationPort,
  SourcingOperationFinalizeContext,
  SourcingOperationPlanContext,
} from '../port/in/sourcing-extension-operation.port';
import {
  SOURCING_CHANNEL_ACCOUNT_PORT,
  type SourcingChannelAccountPort,
} from '../port/out/cross-domain/sourcing-channel-account.port';
import type {
  AuthorizedCollectionOutput,
  SourcingCollectionPermit,
} from '../port/out/repository/sourcing-collection.repository.port';
import {
  SOURCING_OPERATION_LEDGER_REPOSITORY_PORT,
  type SourcingOperationLedgerRepositoryPort,
} from '../port/out/repository/sourcing-operation-ledger.repository.port';
import {
  build1688SourcePlan,
  normalize1688SourceBatch,
  parse1688SourcePlan,
  sameFrozenKeywordSet,
  SOURCE_1688_HOT_PRODUCT,
} from './sourcing-1688-source-attempt.mapper';
import {
  hashCollectionRequest,
  map1688HotProductsToAuthorizedOutput,
  mapTrendTypedRecordsToAuthorizedOutput,
} from './sourcing-collection-mappers';
import { buildKeywordSuggestionOutput } from './sourcing-keyword-suggestion.mapper';
import {
  buildBrowserLiveCommercePlan,
  normalizeBrowserLiveCommerceBatch,
  parseBrowserLiveCommercePlan,
  SOURCE_LIVE_COMMERCE_SCOPE,
  sourceKeyForBrowserLiveCommerce,
  type BrowserLiveCommerceSourceBatch,
} from './sourcing-live-commerce-source-attempt.mapper';
import {
  buildExtensionOutput,
  extensionSourceRecordProjection,
  parseSupplierUrl,
  ProductExtensionDocumentSchema,
  productAlert,
  productPlan,
  toV1Command,
} from './sourcing-product-extension.mapper';
import {
  buildTiktokSourcePlan,
  hasCompleteTiktokCoverage,
  normalizeTiktokSourceBatch,
  parseTiktokSourcePlan,
  plannedTiktokTargetIds,
  SOURCE_TIKTOK_CREATIVE,
  TIKTOK_SOURCE_SCOPE,
  TIKTOK_SOURCE_TARGET,
} from './sourcing-tiktok-source-attempt.mapper';
import { buildWingCatalogOutput } from './sourcing-wing-catalog.mapper';
import { TrendCollectService } from './trend-collect.service';

const KINDS = SOURCING_OPERATION_KINDS;
const NOT_A_SOURCE_FAILURE = new Set(['SOURCING_DUPLICATE_RECORD']);
const CHUNKS = SOURCING_CHUNK_KINDS;

/** 모든 확장 kind의 plan JSON에 남는 값. 발행 이력의 키·수집기와 실패 알림이 여기서 나온다. */
const PlanBaseSchema = z.object({
  sourceKey: z.string().min(1),
  scopeKey: z.string().min(1),
  targetKey: z.string().min(1),
  collectorKey: z.string().min(1),
  collectorVersion: z.string().min(1),
  startedBy: z.string().uuid().nullable(),
  failureAlert: z.object({
    sourceType: z.string(),
    dedupeKey: z.string(),
    title: z.string(),
    href: z.string(),
  }).strict(),
}).passthrough();
type PlanBase = z.infer<typeof PlanBaseSchema>;

interface PlannedBase {
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  collectorKey: string;
  collectorVersion: string;
  failureAlert: { sourceType: string; dedupeKey: string; title: string; href: string };
}

interface Planned {
  base: PlannedBase;
  kindPlan: Record<string, unknown>;
  lockKeys: OperationLockKey[];
}

interface Assembled {
  output: AuthorizedCollectionOutput;
  windowStartAt: Date | null;
  windowEndAt: Date | null;
  /** 원장에 보관하는 이 발행의 내용 지문 입력(청크 원문). */
  content: unknown;
}

const WING_SOURCE = 'coupang.wing_catalog';
const WING_ALERT = { sourceType: WING_SOURCE, dedupeKey: 'source:coupang-wing-catalog',
  title: 'Wing 카탈로그 수집 실패', href: '/sourcing-ai/wing-catalog' };
const KEYWORD_SOURCE = 'coupang.keyword_suggestion';
const TREND_1688_ALERT = { sourceType: SOURCE_1688_HOT_PRODUCT, dedupeKey: 'source:1688-hot-product',
  title: '1688 인기상품 수집 실패', href: '/sourcing-ai/market' };
const TIKTOK_ALERT = { sourceType: SOURCE_TIKTOK_CREATIVE, dedupeKey: 'source:tiktok-creative',
  title: 'TikTok 크리에이티브 트렌드 수집 실패', href: '/sourcing-ai/market' };

const KeywordSuggestionDocumentSchema = SourcingKeywordSuggestionObservationBatchSchema.extend({
  warnings: z.array(z.string()).optional(),
});
const Offers1688ElementSchema = z.object({
  keyword: z.string(),
  items: z.array(z.record(z.unknown())),
}).strict();
const LiveBroadcastElementSchema = z.object({
  source: z.enum(['1688', 'douyin']),
  pageUrl: z.string(),
  broadcast: z.record(z.unknown()),
}).strict();
const CreativeTrendElementSchema = z.object({
  targetId: z.string().min(1),
  region: z.string(),
  items: z.array(z.unknown()),
}).strict();

/**
 * 확장 구동 소싱 kind 6종의 owner 일(KID-360). plan은 옛 attempt begin이 얼리던 범위를 그대로 얼리고,
 * finalize는 옛 attempt 종료가 하던 검증·원장 쓰기를 실행 계약의 finish 트랜잭션 안에서 한다. 원장 쓰기와
 * 발행 이력은 `SOURCING_OPERATION_LEDGER_REPOSITORY_PORT`가, 실행 행은 계약이 맡는다.
 */
@Injectable()
export class SourcingExtensionOperationService implements SourcingExtensionOperationPort {
  constructor(
    @Inject(SOURCING_OPERATION_LEDGER_REPOSITORY_PORT)
    private readonly ledger: SourcingOperationLedgerRepositoryPort,
    @Inject(SOURCING_CHANNEL_ACCOUNT_PORT)
    private readonly accounts: SourcingChannelAccountPort,
    private readonly trends: TrendCollectService,
  ) {}

  async plan(
    kind: SourcingExtensionKind,
    scope: Record<string, unknown>,
    context: SourcingOperationPlanContext,
  ): Promise<OperationPlanResult> {
    const parsedScope = SOURCING_EXTENSION_SCOPE_SCHEMAS[kind].safeParse(scope);
    if (!parsedScope.success) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: { reason: 'invalid_scope', kind, issues: parsedScope.error.issues.map((issue) => issue.path.join('.')) },
      });
    }
    const planned = await this.planFor(kind, parsedScope.data, context);
    await this.assertSourceEnabled(context.organizationId, planned.base.sourceKey);
    return {
      plan: { ...planned.kindPlan, ...planned.base, startedBy: context.userId },
      lockKeys: planned.lockKeys,
    };
  }

  async finalize(
    kind: SourcingExtensionKind,
    chunks: OperationStagedChunk[],
    context: SourcingOperationFinalizeContext,
  ): Promise<SourcingOperationResult> {
    const base = parsePlanBase(context.plan);
    await this.assertSourceEnabled(context.organizationId, base.sourceKey, context);
    const now = new Date();
    const permit: SourcingCollectionPermit = {
      runId: context.operationId,
      organizationId: context.organizationId,
      sourceKey: base.sourceKey,
      scopeKey: base.scopeKey,
      targetKey: base.targetKey,
      leaseToken: '',
      generation: 1,
      leaseExpiresAt: now,
    };
    const assembled = this.assemble(kind, chunks, context, base, permit);
    const persisted = await this.persist(context, permit, assembled.output, now);
    let acceptedCount = Math.max(0, assembled.output.discoveredCount - assembled.output.rejectedCount);
    let qualityReport: Record<string, unknown> = { ...assembled.output.qualityReport, completeSnapshot: true };
    if (kind === KINDS.wingCatalog) {
      const wing = await this.wingReceipts(context, assembled);
      acceptedCount = wing.acceptedCount;
      qualityReport = { ...qualityReport, source: WING_SOURCE, snapshots: wing.snapshots, wingReceipts: wing.receipts };
    }
    const duplicateCount = kind === KINDS.wingCatalog
      ? assembled.output.discoveredCount - acceptedCount
      : persisted.duplicateCount;
    const contentChecksum = hashCollectionRequest(assembled.content);
    await this.ledger.publish(context.tx, context.organizationId, context.operationId, {
      sourceKey: base.sourceKey,
      scopeKey: base.scopeKey,
      targetKey: base.targetKey,
      collectorKey: base.collectorKey,
      collectorVersion: base.collectorVersion,
      plan: context.plan,
      windowStartAt: assembled.windowStartAt,
      windowEndAt: assembled.windowEndAt,
      discoveredCount: assembled.output.discoveredCount,
      acceptedCount,
      duplicateCount,
      contentChecksum,
      qualityReport,
      completedAt: now,
    });
    await this.ledger.resolveSourceFailure(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      alert: base.failureAlert,
    });
    return {
      sourceKey: base.sourceKey,
      scopeKey: base.scopeKey,
      targetKey: base.targetKey,
      discoveredCount: assembled.output.discoveredCount,
      acceptedCount,
      duplicateCount,
      rejectedCount: 0,
      coverage: null,
      windowStartAt: assembled.windowStartAt?.toISOString() ?? null,
      windowEndAt: assembled.windowEndAt?.toISOString() ?? null,
      ...(kind === KINDS.productExtension ? { admitted: persisted.admitted } : {}),
    };
  }

  async failed(
    _kind: SourcingExtensionKind,
    context: SourcingOperationFinalizeContext & { errorCode: string; errorMessage: string | null },
  ): Promise<void> {
    const parsed = PlanBaseSchema.safeParse(context.plan);
    // 이미 수집한 원본(KID-313)은 원천이 실패한 것이 아니다 — 옛 attempt처럼 알림을 남기지 않는다.
    if (!parsed.success || NOT_A_SOURCE_FAILURE.has(context.errorCode)) return;
    await this.ledger.recordSourceFailure(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      alert: parsed.data.failureAlert,
      code: context.errorCode,
      message: (context.errorMessage ?? context.errorCode).slice(0, 1_000),
    });
  }

  // ── plan ──────────────────────────────────────────────────────────────────

  private async planFor(kind: SourcingExtensionKind, scope: unknown, context: SourcingOperationPlanContext): Promise<Planned> {
    switch (kind) {
      case KINDS.wingCatalog: {
        const parsed = SOURCING_EXTENSION_SCOPE_SCHEMAS[kind].parse(scope);
        const batch = SourcingWingCatalogBatchInputSchema.safeParse({
          keywords: parsed.keywords, maxPages: parsed.maxPages, purpose: parsed.purpose,
        });
        if (!batch.success) {
          throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'duplicate_keywords', kind } });
        }
        if (!(await this.accounts.isActiveCoupangAccount(context.organizationId, parsed.channelAccountId))) {
          throw new KiditemNotFoundError('SOURCING_ACCOUNT_NOT_FOUND', { details: { channelAccountId: parsed.channelAccountId } });
        }
        return {
          base: { sourceKey: WING_SOURCE, scopeKey: 'default', targetKey: 'catalog', collectorKey: kind,
            collectorVersion: 'coupang-wing-catalog/v2', failureAlert: WING_ALERT },
          kindPlan: { source: WING_SOURCE, ...batch.data, channelAccountId: parsed.channelAccountId },
          // 그 계정의 Wing 로그인(카탈로그 동기화와 서로 막음) + 조직에 하나뿐인 발행 대상 'catalog'.
          lockKeys: [accountLockKey(parsed.channelAccountId), resourceLockKey('coupang-wing', 'catalog')],
        };
      }
      case KINDS.coupangKeywordSuggestion: {
        const parsed = SOURCING_EXTENSION_SCOPE_SCHEMAS[kind].parse(scope);
        const targetKey = `keyword:${sourcingWingCatalogKeywordIdentity(parsed.keyword)}`;
        return {
          base: { sourceKey: KEYWORD_SOURCE, scopeKey: 'default', targetKey, collectorKey: kind,
            collectorVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
            failureAlert: { sourceType: KEYWORD_SOURCE, dedupeKey: `source:coupang-keyword-suggestion:${targetKey}`,
              title: '쿠팡 키워드 제안 수집 실패', href: '/sourcing-ai/market' } },
          kindPlan: { source: KEYWORD_SOURCE, keyword: parsed.keyword, maxResults: parsed.maxResults },
          lockKeys: [resourceLockKey('coupang', lockId(targetKey))],
        };
      }
      case KINDS.trend1688: {
        const targets = await this.trends.list1688Targets(context.organizationId);
        const plan = build1688SourcePlan(targets.map((target) => target.keyword));
        return {
          base: { sourceKey: SOURCE_1688_HOT_PRODUCT, scopeKey: 'default', targetKey: 'all', collectorKey: kind,
            collectorVersion: 'source-owner/v1', failureAlert: TREND_1688_ALERT },
          kindPlan: plan,
          lockKeys: [resourceLockKey('ali1688', 'all')],
        };
      }
      case KINDS.liveCommerce: {
        const parsed = SOURCING_EXTENSION_SCOPE_SCHEMAS[kind].parse(scope);
        const plan = invalidAs('SOURCING_COLLECTION_INVALID', () => buildBrowserLiveCommercePlan(parsed.url));
        if (plan.source !== parsed.platform) {
          throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'platform_url_mismatch', kind } });
        }
        const targetKey = liveCommerceTargetKey(plan.source, plan.pageUrl);
        return {
          base: { sourceKey: sourceKeyForBrowserLiveCommerce(plan.source), scopeKey: SOURCE_LIVE_COMMERCE_SCOPE, targetKey,
            collectorKey: kind, collectorVersion: 'source-owner/v1',
            failureAlert: {
              sourceType: `${plan.source}.live_commerce`,
              dedupeKey: `source:${plan.source}-live-commerce`,
              title: `${plan.source === '1688' ? '1688' : '도우인'} 라이브 수집 실패`,
              href: '/sourcing-ai/market',
            } },
          kindPlan: plan,
          lockKeys: [resourceLockKey(plan.source === '1688' ? 'ali1688' : 'douyin', lockId(targetKey))],
        };
      }
      case KINDS.tiktokCreative: {
        const parsed = SOURCING_EXTENSION_SCOPE_SCHEMAS[kind].parse(scope);
        const targetSeeds = await this.trends.listTiktokCcTargets(context.organizationId);
        const plan = buildTiktokSourcePlan({ targetSeeds, maxItems: parsed.maxItems, region: parsed.region });
        return {
          base: { sourceKey: SOURCE_TIKTOK_CREATIVE, scopeKey: TIKTOK_SOURCE_SCOPE, targetKey: TIKTOK_SOURCE_TARGET,
            collectorKey: kind, collectorVersion: 'source-owner/v1', failureAlert: TIKTOK_ALERT },
          kindPlan: { ...plan, targetIds: plannedTiktokTargetIds(plan) },
          lockKeys: [resourceLockKey('tiktok', TIKTOK_SOURCE_TARGET)],
        };
      }
      case KINDS.productExtension: {
        const parsed = SOURCING_EXTENSION_SCOPE_SCHEMAS[kind].parse(scope);
        const plan = invalidAs('VALIDATION_FAILED', () => productPlan(parsed.url));
        if (plan.platform !== parsed.platform) {
          throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'platform_url_mismatch', kind } });
        }
        const targetKey = hashCollectionRequest(parseSupplierUrl(plan.sourceUrl).normalizedUrl);
        return {
          base: { sourceKey: plan.source, scopeKey: 'current-tab', targetKey, collectorKey: kind,
            collectorVersion: 'kiditem-os/v1', failureAlert: productAlert(plan.source) },
          kindPlan: plan,
          lockKeys: [resourceLockKey(plan.platform === '1688' ? 'ali1688' : 'alibaba', targetKey)],
        };
      }
    }
  }

  private async assertSourceEnabled(organizationId: string, sourceKey: string, context?: SourcingOperationFinalizeContext) {
    const failure = await this.ledger.sourceAccessFailure(organizationId, sourceKey, context?.tx);
    if (failure) {
      throw new KiditemPreconditionError('SOURCING_SOURCE_DISABLED', { details: { sourceKey, reason: failure } });
    }
  }

  // ── finalize: 청크 → 옛 attempt 출력 ───────────────────────────────────────

  private assemble(
    kind: SourcingExtensionKind,
    chunks: OperationStagedChunk[],
    context: SourcingOperationFinalizeContext,
    base: PlanBase,
    permit: SourcingCollectionPermit,
  ): Assembled {
    switch (kind) {
      case KINDS.wingCatalog: return this.assembleWing(chunks, context, permit);
      case KINDS.coupangKeywordSuggestion: return this.assembleKeywordSuggestion(chunks, context, permit);
      case KINDS.trend1688: return this.assemble1688(chunks, context, permit);
      case KINDS.liveCommerce: return this.assembleLiveCommerce(chunks, context, permit);
      case KINDS.tiktokCreative: return this.assembleTiktok(chunks, context, permit);
      case KINDS.productExtension: return this.assembleProduct(chunks, context, base, permit);
    }
  }

  private assembleWing(chunks: OperationStagedChunk[], context: SourcingOperationFinalizeContext, permit: SourcingCollectionPermit): Assembled {
    const plan = SourcingWingCatalogBatchInputSchema.parse({
      keywords: context.plan.keywords, maxPages: context.plan.maxPages, purpose: context.plan.purpose,
    });
    const elements = elementsOf(chunks, [CHUNKS.wingSearchPage]).map((element) =>
      parseOr(SourcingWingCatalogObservationBatchSchema, element));
    const byKeyword = new Map<string, SourcingWingCatalogObservation[]>();
    for (const batch of elements) {
      const keyword = sourcingWingCatalogKeywordIdentity(batch.keyword);
      if (byKeyword.has(keyword) || batch.maxPages !== plan.maxPages || batch.purpose !== plan.purpose
        || batch.items.some((item) => sourcingWingCatalogKeywordIdentity(item.sourceKeyword) !== keyword)) {
        throw invalid('wing_batch_mismatch');
      }
      byKeyword.set(keyword, batch.items);
    }
    const planned = plan.keywords.map(sourcingWingCatalogKeywordIdentity);
    if (byKeyword.size !== planned.length || planned.some((keyword) => !byKeyword.has(keyword))) {
      throw incomplete('wing_keywords_missing');
    }
    const items = planned.flatMap((keyword) => byKeyword.get(keyword) ?? []);
    return {
      output: buildWingCatalogOutput({ organizationId: context.organizationId, permit, items }),
      windowStartAt: null,
      windowEndAt: new Date(),
      content: { keywords: planned, batches: planned.map((keyword) => byKeyword.get(keyword)) },
    };
  }

  private async wingReceipts(context: SourcingOperationFinalizeContext, assembled: Assembled) {
    const planned = (context.plan.keywords as string[]).map(sourcingWingCatalogKeywordIdentity);
    const counts = await this.ledger.countWingCatalogSnapshots(context.tx, context.organizationId, context.operationId);
    const discovered = new Map<string, number>();
    for (const record of assembled.output.typedRecords) {
      if (record.kind !== 'wing_catalog_product') continue;
      const keyword = sourcingWingCatalogKeywordIdentity(record.row.sourceKeyword);
      discovered.set(keyword, (discovered.get(keyword) ?? 0) + 1);
    }
    const receipts = planned.map((keyword, sequence) => {
      const count = discovered.get(keyword) ?? 0;
      const acceptedCount = counts.get(keyword) ?? 0;
      if (acceptedCount > count) throw incomplete('wing_receipts_mismatch');
      return { sequence, keyword, count, acceptedCount, duplicateCount: count - acceptedCount };
    });
    return {
      receipts,
      snapshots: planned.map((keyword) => ({ keyword })),
      acceptedCount: receipts.reduce((sum, receipt) => sum + receipt.acceptedCount, 0),
    };
  }

  private assembleKeywordSuggestion(chunks: OperationStagedChunk[], context: SourcingOperationFinalizeContext, permit: SourcingCollectionPermit): Assembled {
    const elements = elementsOf(chunks, [CHUNKS.keywordSuggestions]);
    if (elements.length !== 1) throw incomplete('keyword_suggestion_document_missing');
    const { warnings = [], ...batch } = parseOr(KeywordSuggestionDocumentSchema, elements[0]);
    const plan = z.object({ keyword: z.string(), maxResults: z.number().int() }).passthrough().parse(context.plan);
    const normalizedKeyword = sourcingWingCatalogKeywordIdentity(batch.keyword);
    if (normalizedKeyword !== sourcingWingCatalogKeywordIdentity(plan.keyword)
      || batch.items.length > plan.maxResults || batch.productNameTokens.length > plan.maxResults
      || batch.items.some((item) => item.rank > plan.maxResults)) {
      throw incomplete('keyword_suggestion_plan_mismatch');
    }
    const output = buildKeywordSuggestionOutput({ organizationId: context.organizationId, permit, normalizedKeyword, batch });
    output.qualityReport = { ...output.qualityReport, warnings };
    return {
      output,
      windowStartAt: null,
      windowEndAt: new Date(batch.capturedAt),
      content: { batch: { ...batch, keyword: normalizedKeyword }, warnings },
    };
  }

  private assemble1688(chunks: OperationStagedChunk[], context: SourcingOperationFinalizeContext, permit: SourcingCollectionPermit): Assembled {
    const plan = invalidAs('SOURCING_COLLECTION_INVALID', () =>
      parse1688SourcePlan(context.plan as Parameters<typeof parse1688SourcePlan>[0]));
    const keywords = elementsOf(chunks, [CHUNKS.offers1688]).map((element) => parseOr(Offers1688ElementSchema, element));
    const normalized = invalidAs('SOURCING_COLLECTION_INVALID', () =>
      normalize1688SourceBatch(context.organizationId, { keywords: keywords as Parameters<typeof normalize1688SourceBatch>[1]['keywords'] }));
    if (!sameFrozenKeywordSet(plan.keywords, normalized.keywords)) throw incomplete('trend_1688_keywords_missing');
    return {
      output: map1688HotProductsToAuthorizedOutput({
        permit,
        rows: normalized.rows,
        qualityReport: {
          source: SOURCE_1688_HOT_PRODUCT,
          expectedKeywordCount: plan.keywords.length,
          observedKeywordCount: normalized.keywords.length,
        },
      }),
      windowStartAt: null,
      windowEndAt: new Date(),
      content: { keywords },
    };
  }

  private assembleLiveCommerce(chunks: OperationStagedChunk[], context: SourcingOperationFinalizeContext, permit: SourcingCollectionPermit): Assembled {
    const plan = invalidAs('SOURCING_COLLECTION_INVALID', () =>
      parseBrowserLiveCommercePlan(context.plan as Parameters<typeof parseBrowserLiveCommercePlan>[0]));
    const broadcasts = elementsOf(chunks, [CHUNKS.liveBroadcast, CHUNKS.liveProducts], CHUNKS.liveBroadcast);
    if (broadcasts.length !== 1) throw incomplete('live_broadcast_missing');
    const header = parseOr(LiveBroadcastElementSchema, broadcasts[0]);
    const products = elementsOf(chunks, [CHUNKS.liveBroadcast, CHUNKS.liveProducts], CHUNKS.liveProducts);
    const batch = { ...header, products } as BrowserLiveCommerceSourceBatch;
    const normalized = invalidAs('SOURCING_COLLECTION_INVALID', () =>
      normalizeBrowserLiveCommerceBatch({ organizationId: context.organizationId, operationId: context.operationId, plan, batch }));
    return {
      output: mapTrendTypedRecordsToAuthorizedOutput({
        permit,
        typedRecords: [
          { kind: 'live_commerce_broadcast' as const, row: normalized.broadcast },
          ...normalized.products.map((row) => ({ kind: 'live_commerce_product' as const, row })),
        ],
        qualityReport: { source: normalized.source, pageUrl: normalized.pageUrl, productCount: normalized.products.length },
      }),
      windowStartAt: null,
      windowEndAt: new Date(),
      content: batch,
    };
  }

  private assembleTiktok(chunks: OperationStagedChunk[], context: SourcingOperationFinalizeContext, permit: SourcingCollectionPermit): Assembled {
    const plan = invalidAs('SOURCING_COLLECTION_INVALID', () =>
      parseTiktokSourcePlan(context.plan as Parameters<typeof parseTiktokSourcePlan>[0]));
    const visits = elementsOf(chunks, [CHUNKS.creativeTrends]).map((element) => parseOr(CreativeTrendElementSchema, element));
    const regions = [...new Set(visits.map((visit) => visit.region))];
    if (regions.length > 1) throw invalid('tiktok_region_mismatch');
    const batch = {
      region: regions[0] ?? plan.regionOverride ?? '',
      items: visits.flatMap((visit) => visit.items),
      visitedTargetIds: visits.map((visit) => visit.targetId),
    };
    const normalized = invalidAs('SOURCING_COLLECTION_INVALID', () =>
      normalizeTiktokSourceBatch({ organizationId: context.organizationId, operationId: context.operationId, batch }));
    if (!hasCompleteTiktokCoverage(plan, normalized)) throw incomplete('tiktok_targets_missing');
    return {
      output: mapTrendTypedRecordsToAuthorizedOutput({
        permit,
        typedRecords: normalized.rows.map((row) => ({ kind: 'tiktok_creative' as const, row })),
        qualityReport: {
          source: SOURCE_TIKTOK_CREATIVE,
          expectedTargetCount: plannedTiktokTargetIds(plan).length,
          visitedTargetCount: normalized.visitedTargetIds.length,
        },
      }),
      windowStartAt: null,
      windowEndAt: new Date(),
      content: batch,
    };
  }

  private assembleProduct(
    chunks: OperationStagedChunk[],
    context: SourcingOperationFinalizeContext,
    base: PlanBase,
    permit: SourcingCollectionPermit,
  ): Assembled {
    const elements = elementsOf(chunks, [CHUNKS.productDocument]);
    if (elements.length !== 1) throw incomplete('product_document_missing');
    const { product, description, hadDescription } = parseOr(ProductExtensionDocumentSchema, elements[0]);
    const frozen = z.object({ source: z.string(), sourceUrl: z.string(), platform: z.string() }).passthrough().parse(context.plan);
    const plan = invalidAs('SOURCING_COLLECTION_INVALID', () => productPlan(product.source_url));
    if (hashCollectionRequest(plan) !== hashCollectionRequest({ source: frozen.source, sourceUrl: frozen.sourceUrl, platform: frozen.platform })
      || (product.source_platform && product.source_platform.toLowerCase() !== plan.platform)
      || hadDescription !== Boolean(description) || product.page_type === 'description'
      || (description && (product.page_type === 'search' || description.source_url !== product.source_url
        || description.product_id !== product.product_id))) {
      throw invalid('product_plan_mismatch');
    }
    const commands = invalidAs('SOURCING_COLLECTION_INVALID', () => product.page_type === 'search' ? [] : [toV1Command(product),
      ...(description ? [toV1Command({ ...description, page_type: 'description' })] : [])]);
    const outputs = commands.map((command) => buildExtensionOutput(permit, command,
      extensionSourceRecordProjection(command, context.organizationId, base.startedBy)));
    return {
      output: {
        observations: outputs.flatMap((output) => output.observations),
        typedRecords: outputs.flatMap((output) => output.typedRecords),
        discoveredCount: outputs.length,
        rejectedCount: 0,
        qualityReport: { schemaVersion: 'v1', searchArtifact: outputs.length === 0 },
      },
      windowStartAt: null,
      windowEndAt: new Date(),
      content: { product, description, hadDescription },
    };
  }

  private async persist(
    context: SourcingOperationFinalizeContext,
    permit: SourcingCollectionPermit,
    output: AuthorizedCollectionOutput,
    now: Date,
  ) {
    try {
      return await this.ledger.persistFacts(context.tx, permit, output, now);
    } catch (error) {
      // 같은 원본의 두 번째 수집(KID-313): 초안이나 판매 상품으로 갈 곳을 details에 싣는다.
      if (error instanceof SourceRecordDuplicateError) {
        throw new KiditemConflictError('SOURCING_DUPLICATE_RECORD', {
          message: error.message,
          details: { reason: error.refusal.reason, existing: error.refusal.existing },
          cause: error,
        });
      }
      throw error;
    }
  }
}

function parsePlanBase(plan: Record<string, unknown>): PlanBase {
  const parsed = PlanBaseSchema.safeParse(plan);
  if (!parsed.success) throw invalid('plan_malformed');
  return parsed.data;
}

/** 청크 순서대로 원소를 편다. 이 kind가 모르는 chunkKind는 거절한다. `only`를 주면 그 종류만. */
function elementsOf(chunks: OperationStagedChunk[], allowed: readonly string[], only?: string): unknown[] {
  if (chunks.some((chunk) => !allowed.includes(chunk.chunkKind))) throw invalid('unknown_chunk_kind');
  return [...chunks]
    .filter((chunk) => !only || chunk.chunkKind === only)
    .sort((left, right) => left.chunkKind.localeCompare(right.chunkKind) || left.sequence - right.sequence)
    .flatMap((chunk) => chunk.payload);
}

function parseOr<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalid('chunk_malformed');
  return parsed.data;
}

function invalidAs<T>(code: 'SOURCING_COLLECTION_INVALID' | 'VALIDATION_FAILED', work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw new KiditemInvalidValueError(code as KiditemErrorCode, { details: { reason: 'owner_rejected' }, cause: error });
  }
}

function invalid(reason: string) {
  return new KiditemInvalidValueError('SOURCING_COLLECTION_INVALID', { details: { reason } });
}

function incomplete(reason: string) {
  return new KiditemConflictError('SOURCING_COLLECTION_INCOMPLETE', { details: { reason } });
}

/**
 * lockKey `resource:<site>:<id>`의 id는 공백이 없어야 한다(`[^\s]+`). 대상 키의 공백은 `_`로 바꾸고,
 * 길면(키워드가 긴 한글이면) 대상 키의 SHA-256 앞 32자로 줄인다 — 같은 대상은 늘 같은 id다.
 */
export function lockId(targetKey: string): string {
  const compact = targetKey.replace(/\s+/gu, '_');
  return compact.length <= 200 ? compact : createHash('sha256').update(targetKey).digest('hex').slice(0, 32);
}

/** 방송 URL의 방(origin + path) 지문. 쿼리·조각은 plan에만 얼리고 대상 키에 남기지 않는다(옛 attempt와 같다). */
function liveCommerceTargetKey(source: '1688' | 'douyin', pageUrl: string): string {
  const url = new URL(pageUrl);
  return `room:${hashCollectionRequest({ source, room: `${url.origin}${url.pathname}` })}`;
}
