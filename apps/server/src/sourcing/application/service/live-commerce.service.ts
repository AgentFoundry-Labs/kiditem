import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import { matchStationeryToyTrend } from '../../domain/stationery-toy-trend';
import { selectTaobaoLiveIds } from '../../domain/taobao-live-selection';
import {
  TAOBAO_LIVE_PORT,
  type TaobaoLivePort,
} from '../port/out/provider/taobao-live.port';
import {
  LIVE_COMMERCE_REPOSITORY_PORT,
  type LiveCommerceBroadcastSnapshotUpsert,
  type LiveCommerceProductSnapshotRow,
  type LiveCommerceProductSnapshotUpsert,
  type LiveCommerceRepositoryPort,
  type LiveCommerceSource,
} from '../port/out/repository/live-commerce.repository.port';
import {
  SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type SourcingBrowserSourceAttemptRepositoryPort,
} from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import {
  hashCollectionRequest,
  mapTrendTypedRecordsToAuthorizedOutput,
} from './sourcing-collection-mappers';
import { requireIdempotencyKey, toPermit } from './sourcing-source-attempt-primitives';

const MAX_LIVE_KEYWORD_SAMPLE_TITLES = 3;
const LIVE_COMPOSITE_ID_SEPARATOR = '\u0000';

export interface TaobaoLiveRequest {
  queryDate?: string;
  liveIds?: string[];
  pageSize?: number;
}

const TAOBAO_SOURCE = { sourceKey: 'taobao.live', scopeKey: 'default', targetKey: 'all' };
const TAOBAO_FAILURE_ALERT = {
  sourceType: 'sourcing.taobao-live',
  dedupeKey: 'sourcing:taobao-live',
  title: '타오바오 라이브 수집 실패',
  href: '/sourcing-ai/market',
};

export interface LiveTrendKeywordView {
  keyword: string;
  productCount: number;
  broadcastCount: number;
  sources: string[];
  totalSales: number | null;
  minPriceCny: number | null;
  maxPriceCny: number | null;
  sampleTitles: string[];
  topImageUrl: string | null;
  latestCapturedAt: string | null;
}

@Injectable()
export class LiveCommerceService {
  constructor(
    @Inject(TAOBAO_LIVE_PORT)
    private readonly taobao: TaobaoLivePort,
    @Inject(LIVE_COMMERCE_REPOSITORY_PORT)
    private readonly repository: LiveCommerceRepositoryPort,
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
  ) {}

  async status(organizationId: string, input: TaobaoLiveRequest = {}) {
    const [broadcasts, products] = await Promise.all([
      this.repository.findBroadcastSnapshots({ organizationId, days: 7 }),
      this.repository.findProductSnapshots({ organizationId, days: 7 }),
    ]);
    const latestBySource = new Map<LiveCommerceSource, Date>();
    for (const row of [...broadcasts, ...products]) {
      const current = latestBySource.get(row.source);
      if (!current || row.capturedAt > current) latestBySource.set(row.source, row.capturedAt);
    }
    const readiness = this.taobao.readiness();
    const sourceStatus = await this.readTaobao(organizationId, input);
    return {
      sources: [
        {
          source: 'taobao' as const,
          connection: 'official-api' as const,
          configured: readiness.configured,
          missing: readiness.missing,
          requiresLogin: false,
          latestCapturedAt: latestBySource.get('taobao')?.toISOString() ?? null,
          sourceStatus,
        },
        {
          source: '1688' as const,
          connection: 'chrome-extension' as const,
          configured: true,
          missing: [],
          requiresLogin: true,
          latestCapturedAt: latestBySource.get('1688')?.toISOString() ?? null,
        },
        {
          source: 'douyin' as const,
          connection: 'chrome-extension' as const,
          configured: true,
          missing: [],
          requiresLogin: true,
          latestCapturedAt: latestBySource.get('douyin')?.toISOString() ?? null,
        },
      ],
    };
  }

  async readTaobao(organizationId: string, input: TaobaoLiveRequest = {}) {
    return this.attempts.readSourceStatus({
      organizationId,
      ...TAOBAO_SOURCE,
      currentPlanChecksum: hashCollectionRequest(taobaoPlan(input, new Date())),
    });
  }

  async collectTaobao(
    organizationId: string,
    input: TaobaoLiveRequest,
    idempotencyKey: string,
    controls: { signal?: AbortSignal } = {},
  ) {
    controls.signal?.throwIfAborted();
    const capturedAt = new Date();
    const businessDate = kstBusinessDate(capturedAt);
    const plan = taobaoPlan(input, capturedAt);
    const { created, attempt } = await this.attempts.beginAttempt({
      organizationId,
      ...TAOBAO_SOURCE,
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
      // Omitted dates remain omitted in request identity so midnight transport
      // replays recover the original server-frozen calendar date.
      requestFingerprint: hashCollectionRequest({
        ...plan, queryDate: input.queryDate ? canonicalTaobaoQueryDate(input.queryDate) : null,
      }),
      plan,
      planChecksum: hashCollectionRequest(plan),
      requestedByUserId: null,
      collectorKey: 'taobao-live-collection',
      collectorVersion: '2026-08-08',
      triggerKind: 'manual',
      // Preserve the former Taobao execution deadline as one fixed expiry.
      expiresInMs: 15 * 60_000,
      failureAlert: TAOBAO_FAILURE_ALERT,
    });
    if (!created) return attempt;

    // Provider IO runs after begin commits and without a database lock.
    let result;
    try {
      controls.signal?.throwIfAborted();
      result = await this.taobao.collect({
        queryDate: plan.queryDate,
        liveIds: plan.liveIds,
        pageSize: plan.pageSize,
        signal: controls.signal,
      });
      controls.signal?.throwIfAborted();
    } catch (error) {
      const failed = await this.attempts.failAttempt({
        organizationId,
        attemptId: attempt.attemptId,
        attemptToken: attempt.attemptToken,
        code: controls.signal?.aborted ? 'SOURCE_COLLECTION_ABORTED' : 'SOURCE_COLLECTION_FAILED',
        message: (error instanceof Error ? error.message : String(error)).slice(0, 1_000),
        failureAlert: TAOBAO_FAILURE_ALERT,
      });
      if (controls.signal?.aborted) controls.signal.throwIfAborted();
      return failed;
    }
    const broadcasts: LiveCommerceBroadcastSnapshotUpsert[] = result.rooms.map((room) => ({
      organizationId, ingestionRunId: attempt.attemptId, businessDate, source: 'taobao', ...room, capturedAt,
    }));
    const products: LiveCommerceProductSnapshotUpsert[] = result.products.map((product) => ({
      organizationId, ingestionRunId: attempt.attemptId, businessDate, source: 'taobao', ...product, capturedAt,
    }));
    const output = mapTrendTypedRecordsToAuthorizedOutput({
      permit: toPermit(attempt, organizationId),
      typedRecords: [
        ...broadcasts.map((row) => ({ kind: 'live_commerce_broadcast' as const, row })),
        ...products.map((row) => ({ kind: 'live_commerce_product' as const, row })),
      ],
      qualityReport: { source: 'taobao', warningCount: result.warnings.length, warnings: result.warnings },
    });
    return this.attempts.completeAttempt({
      organizationId,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      planChecksum: attempt.planChecksum,
      contentChecksum: hashCollectionRequest(result),
      output,
      sourceWindowEndAt: capturedAt,
      failureAlert: TAOBAO_FAILURE_ALERT,
    });
  }

  async list(
    organizationId: string,
    input: { days: number; source?: LiveCommerceSource },
  ) {
    const [broadcastRows, productRows] = await Promise.all([
      this.repository.findBroadcastSnapshots({ organizationId, ...input }),
      this.repository.findProductSnapshots({ organizationId, ...input }),
    ]);
    const broadcasts = latestRows(broadcastRows, (row) => `${row.source}\u0000${row.broadcastId}`).map((row) => ({
      ...row,
      businessDate: toDateString(row.businessDate),
      capturedAt: row.capturedAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
    }));
    const products = latestRows(
      productRows,
      (row) => `${row.source}\u0000${row.broadcastId}\u0000${row.productId}`,
    ).map((row) => ({
      ...row,
      businessDate: toDateString(row.businessDate),
      capturedAt: row.capturedAt.toISOString(),
    }));
    return { days: input.days, broadcasts, products };
  }

  // 라이브 방송에 노출된 상품 제목에서 문구·완구 트렌드 키워드를 역추출한다.
  // 도우인/1688 라이브 상품명은 중문이라 stationery-toy 도메인 분류(중문 포함)로 매칭한다.
  // "SNS 라이브에서 뜬 → 검색·소싱할 키워드" 신호를 만든다.
  async keywordDigest(
    organizationId: string,
    input: { days: number; source?: LiveCommerceSource },
  ): Promise<{ days: number; keywords: LiveTrendKeywordView[] }> {
    const productRows = await this.repository.findProductSnapshots({ organizationId, ...input });
    const latest = latestRows(
      productRows,
      (row) => [row.source, row.broadcastId, row.productId].join(LIVE_COMPOSITE_ID_SEPARATOR),
    );

    const groups = new Map<string, LiveKeywordAggregate>();
    for (const row of latest) {
      const label = matchStationeryToyTrend([row.title]);
      if (!label) continue;
      const aggregate = groups.get(label) ?? createLiveKeywordAggregate();
      accumulateLiveKeyword(aggregate, row);
      groups.set(label, aggregate);
    }

    const keywords: LiveTrendKeywordView[] = [...groups.entries()]
      .map(([keyword, aggregate]) => ({
        keyword,
        productCount: aggregate.productCount,
        broadcastCount: aggregate.broadcastIds.size,
        sources: [...aggregate.sources].sort(),
        totalSales: aggregate.hasSales ? aggregate.totalSales : null,
        minPriceCny: aggregate.minPriceCny,
        maxPriceCny: aggregate.maxPriceCny,
        sampleTitles: aggregate.sampleTitles,
        topImageUrl: aggregate.topImageUrl,
        latestCapturedAt: aggregate.latestCapturedAt?.toISOString() ?? null,
      }))
      .sort((a, b) => {
        if (b.productCount !== a.productCount) return b.productCount - a.productCount;
        return (b.totalSales ?? 0) - (a.totalSales ?? 0);
      });

    return { days: input.days, keywords };
  }
}

interface LiveKeywordAggregate {
  productCount: number;
  broadcastIds: Set<string>;
  sources: Set<string>;
  totalSales: number;
  hasSales: boolean;
  minPriceCny: number | null;
  maxPriceCny: number | null;
  sampleTitles: string[];
  topImageUrl: string | null;
  latestCapturedAt: Date | null;
}

function createLiveKeywordAggregate(): LiveKeywordAggregate {
  return {
    productCount: 0,
    broadcastIds: new Set(),
    sources: new Set(),
    totalSales: 0,
    hasSales: false,
    minPriceCny: null,
    maxPriceCny: null,
    sampleTitles: [],
    topImageUrl: null,
    latestCapturedAt: null,
  };
}

function accumulateLiveKeyword(aggregate: LiveKeywordAggregate, row: LiveCommerceProductSnapshotRow): void {
  aggregate.productCount += 1;
  aggregate.broadcastIds.add([row.source, row.broadcastId].join(LIVE_COMPOSITE_ID_SEPARATOR));
  aggregate.sources.add(row.source);
  if (row.salesCount != null) {
    aggregate.totalSales += row.salesCount;
    aggregate.hasSales = true;
  }
  if (row.priceCny != null) {
    aggregate.minPriceCny = aggregate.minPriceCny == null ? row.priceCny : Math.min(aggregate.minPriceCny, row.priceCny);
    aggregate.maxPriceCny = aggregate.maxPriceCny == null ? row.priceCny : Math.max(aggregate.maxPriceCny, row.priceCny);
  }
  const title = row.title?.trim();
  if (title && aggregate.sampleTitles.length < MAX_LIVE_KEYWORD_SAMPLE_TITLES && !aggregate.sampleTitles.includes(title)) {
    aggregate.sampleTitles.push(title);
  }
  if (!aggregate.topImageUrl && row.imageUrl) aggregate.topImageUrl = row.imageUrl;
  if (!aggregate.latestCapturedAt || row.capturedAt > aggregate.latestCapturedAt) {
    aggregate.latestCapturedAt = row.capturedAt;
  }
}

function formatChinaCalendarDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}${read('month')}${read('day')}`;
}

function canonicalTaobaoQueryDate(value: string): string {
  const normalized = value.trim();
  if (/^\d{8}$/.test(normalized)) return normalized;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized.replaceAll('-', '');
  throw new BadRequestException('taobao_query_date_invalid');
}

function latestRows<T extends { capturedAt: Date }>(rows: T[], keyOf: (row: T) => string): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = latest.get(key);
    if (!current || row.capturedAt > current.capturedAt) latest.set(key, row);
  }
  return [...latest.values()].sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function taobaoPlan(input: TaobaoLiveRequest, now: Date) {
  return {
    source: 'taobao.live',
    queryDate: input.queryDate ? canonicalTaobaoQueryDate(input.queryDate) : formatChinaCalendarDate(now),
    liveIds: selectTaobaoLiveIds(input.liveIds ?? []),
    pageSize: input.pageSize ?? 100,
  };
}
