import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCING_OPERATION_KINDS as KINDS } from '@kiditem/shared/sourcing-operation';
import type { PrismaService } from '../../prisma/prisma.service';
import { makeTestPrisma, OTHER_ORGANIZATION_ID, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { realSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { sourcingExtensionOperations, type SourcingOperationChunk } from '../../test-helpers/sourcing-extension-operations';
import { LiveCommerceRepositoryAdapter } from '../adapter/out/repository/live-commerce.repository.adapter';
import { persistBrowserSourceAttemptFacts } from '../adapter/out/repository/sourcing-browser-source-attempt.persistence';
import { SourcingKeywordSuggestionRepositoryAdapter } from '../adapter/out/repository/sourcing-keyword-suggestion.repository.adapter';
import { SourcingRecommendationSourceRepositoryAdapter } from '../adapter/out/repository/sourcing-recommendation-source.repository.adapter';
import { TrendCollectionRepositoryAdapter } from '../adapter/out/repository/trend-collection.repository.adapter';

/**
 * 확장 구동 소싱 kind(KID-360)의 발행이 이력 리더에 어떻게 보이는가. 옛 attempt 스펙이 잠그던 규칙을 실행 계약
 * seam(begin → 청크 → finish)으로 다시 잠근다: 현재 세대만, 날짜별 최신 성공, 빈 교체는 그 날짜에만, 실패는
 * 아무것도 바꾸지 않음, 같은 시각 사실의 발행별 소유, 알림 해소 실패 시 사실·발행 롤백.
 */
const product = JSON.parse(readFileSync(resolve(__dirname, '../../../../../extensions/tests/fixtures/1688-product-detail-v1.json'), 'utf8'));
const LIVE_URL = 'https://live.douyin.com/fixture';
const HOURS = 60 * 60 * 1000;

/** 리더는 KST 7일 창을 본다 — 오늘 기준 이틀 전·하루 전 KST 날짜(UTC 자정 표기). */
function recentHistoryDates(): { dayOne: Date; dayTwo: Date } {
  const kstNow = new Date(Date.now() + 9 * HOURS);
  const [year, month, day] = kstNow.toISOString().slice(0, 10).split('-').map(Number);
  return { dayOne: new Date(Date.UTC(year, month - 1, day - 2)), dayTwo: new Date(Date.UTC(year, month - 1, day - 1)) };
}

/** 그 KST 날짜 정오(UTC 03:00)에 수집한 것처럼 앱 시계를 맞춘다. */
function collectOn(day: Date, minutes = 0) {
  vi.setSystemTime(new Date(day.getTime() + 3 * HOURS + minutes * 60_000));
}

describe('sourcing extension kinds → history readers (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let operations: ReturnType<typeof sourcingExtensionOperations>;
  let trends: TrendCollectionRepositoryAdapter;
  let live: LiveCommerceRepositoryAdapter;

  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => prisma?.$disconnect());
  afterEach(() => vi.useRealTimers());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    operations = sourcingExtensionOperations(prisma, realSalesProductDraftPort(prisma));
    trends = new TrendCollectionRepositoryAdapter(prisma as unknown as PrismaService);
    live = new LiveCommerceRepositoryAdapter(prisma as unknown as PrismaService);
    await prisma.trendSeedKeyword.create({ data: { organizationId: ORG, keyword: '연필', keywordCn: '铅笔', sources: ['1688', 'tiktok-cc'] } });
  });

  /** 1688 인기상품 한 번: 첫 키워드(铅笔)에 offer들, 나머지 계획 키워드는 빈 결과. */
  function collect1688(offerIds: string[]) {
    return operations.run(ORG, KINDS.trend1688, {}, (plan): SourcingOperationChunk[] =>
      (plan.keywords as string[]).map((keyword) => ({
        chunkKind: 'offers_1688',
        payload: [{ keyword, items: keyword === '铅笔' ? offerIds.map((offerId, index) => ({ offerId, title: `연필 ${offerId}`, priceCny: 3.5, rank: index + 1 })) : [] }],
      })));
  }
  const fail1688 = () => operations.run(ORG, KINDS.trend1688, {}, []);

  function collectTiktok(entityKeys: string[]) {
    return operations.run(ORG, KINDS.tiktokCreative, {}, (plan): SourcingOperationChunk[] =>
      (plan.targetIds as string[]).map((targetId, index) => ({
        chunkKind: 'creative_trends',
        payload: [{ targetId, region: 'KR', items: index === 0 ? entityKeys.map((entityKey) => ({ trendType: 'hashtag', entityKey })) : [] }],
      })));
  }

  function collectLive(withProduct: boolean, url = LIVE_URL) {
    return operations.run(ORG, KINDS.liveCommerce, { platform: 'douyin', url }, [
      { chunkKind: 'live_broadcast', payload: [{ source: 'douyin', pageUrl: url, broadcast: { broadcastId: 'fixture-broadcast', title: '방송' } }] },
      ...(withProduct ? [{ chunkKind: 'live_products', payload: [{ productId: 'fixture-product', title: '상품', rank: 1 }] }] : []),
    ]);
  }

  describe(KINDS.trend1688, () => {
    it('uses only the current publication for 1688 rows: a failure keeps it, an explicit zero publication empties it', async () => {
      const offers = new SourcingRecommendationSourceRepositoryAdapter(prisma as unknown as PrismaService);
      const readOffers = () => offers.listLatestOfferObservations({ organizationId: ORG, cutoffAt: new Date(), lookbackDays: 7, limit: 10 });

      const baseline = await collect1688(['baseline']);
      expect(baseline.refusedWith).toBeNull();
      await expect(trends.find1688HotHistory({ organizationId: ORG, days: 7 })).resolves.toHaveLength(1);
      await expect(readOffers()).resolves.toMatchObject({ items: [{ operationId: baseline.operation.id }], rejectedCount: 0 });

      expect((await fail1688()).refusedWith).toBe('SOURCING_COLLECTION_INCOMPLETE');
      await expect(trends.find1688HotHistory({ organizationId: ORG, days: 7 })).resolves.toHaveLength(1);
      await expect(readOffers()).resolves.toMatchObject({ items: [{ operationId: baseline.operation.id }] });

      expect((await collect1688([])).refusedWith).toBeNull();
      await expect(trends.find1688HotHistory({ organizationId: ORG, days: 7 })).resolves.toEqual([]);
      await expect(readOffers()).resolves.toEqual({ items: [], rejectedCount: 0 });
    });

    it('reads the newest successful publication per date, excluding failed and empty replacements', async () => {
      const { dayOne, dayTwo } = recentHistoryDates();
      vi.useFakeTimers({ toFake: ['Date'] });
      collectOn(dayOne);
      await collect1688(['old-day-one']);
      collectOn(dayTwo);
      await collect1688(['day-two']);
      collectOn(dayOne, 30);
      await collect1688(['new-day-one']);
      collectOn(dayTwo, 30);
      await fail1688();
      vi.useRealTimers();

      const history = await trends.find1688HotHistory({ organizationId: ORG, days: 7 });
      expect(history).toEqual(expect.arrayContaining([
        expect.objectContaining({ businessDate: dayOne, offerId: 'new-day-one' }),
        expect.objectContaining({ businessDate: dayTwo, offerId: 'day-two' }),
      ]));
      expect(history).not.toEqual(expect.arrayContaining([expect.objectContaining({ offerId: 'old-day-one' })]));

      vi.useFakeTimers({ toFake: ['Date'] });
      collectOn(dayTwo, 60);
      await collect1688([]);
      vi.useRealTimers();
      await expect(trends.find1688HotHistory({ organizationId: ORG, days: 7 }))
        .resolves.toEqual([expect.objectContaining({ businessDate: dayOne, offerId: 'new-day-one' })]);
    });

    it('keeps same-provider 1688 facts and their evidence owned by each publication', async () => {
      const first = await collect1688(['same-offer']);
      const second = await collect1688(['same-offer']);
      const rows = await prisma.sourcing1688OfferKeywordObservation.findMany({
        where: { organizationId: ORG, externalOfferId: 'same-offer' }, include: { evidenceObservation: true } });
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((row) => row.operationId))).toEqual(new Set([first.operation.id, second.operation.id]));
      for (const row of rows) expect(row.evidenceObservation.operationId).toBe(row.operationId);
      expect(rows[0].evidenceObservation.payloadHash).toBe(rows[1].evidenceObservation.payloadHash);
    });
  });

  describe(KINDS.tiktokCreative, () => {
    it('reads the newest successful publication per date and fences an empty replacement to its date', async () => {
      const { dayOne, dayTwo } = recentHistoryDates();
      vi.useFakeTimers({ toFake: ['Date'] });
      collectOn(dayOne);
      await collectTiktok(['old-day-one']);
      collectOn(dayTwo);
      await collectTiktok(['day-two']);
      collectOn(dayOne, 30);
      await collectTiktok(['new-day-one']);
      vi.useRealTimers();

      await expect(trends.findTiktokCcHistory({ organizationId: ORG, days: 7 })).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ businessDate: dayOne, entityKey: 'new-day-one' }),
        expect.objectContaining({ businessDate: dayTwo, entityKey: 'day-two' }),
      ]));

      vi.useFakeTimers({ toFake: ['Date'] });
      collectOn(dayTwo, 30);
      await collectTiktok([]);
      vi.useRealTimers();
      await expect(trends.findTiktokCcHistory({ organizationId: ORG, days: 7 }))
        .resolves.toEqual([expect.objectContaining({ businessDate: dayOne, entityKey: 'new-day-one' })]);
    });
  });

  describe(KINDS.liveCommerce, () => {
    it('hides prior products after an explicit zero-product publication of the same room', async () => {
      await collectLive(true);
      await expect(live.findProductSnapshots({ organizationId: ORG, days: 7, source: 'douyin' })).resolves.toHaveLength(1);
      await collectLive(false);
      await expect(live.findBroadcastSnapshots({ organizationId: ORG, days: 7, source: 'douyin' })).resolves.toHaveLength(1);
      await expect(live.findProductSnapshots({ organizationId: ORG, days: 7, source: 'douyin' })).resolves.toEqual([]);
    });

    it('keeps history across dates while replacing only the same room/date, and a failure changes nothing', async () => {
      const { dayOne, dayTwo } = recentHistoryDates();
      vi.useFakeTimers({ toFake: ['Date'] });
      collectOn(dayOne);
      await collectLive(true);
      collectOn(dayTwo);
      await collectLive(true);
      collectOn(dayOne, 30);
      await collectLive(false);
      vi.useRealTimers();

      await expect(live.findBroadcastSnapshots({ organizationId: ORG, days: 7, source: 'douyin' })).resolves.toHaveLength(2);
      await expect(live.findProductSnapshots({ organizationId: ORG, days: 7, source: 'douyin' }))
        .resolves.toEqual([expect.objectContaining({ businessDate: dayTwo, productId: 'fixture-product' })]);

      const failed = await operations.run(ORG, KINDS.liveCommerce, { platform: 'douyin', url: LIVE_URL }, []);
      expect(failed.refusedWith).toBe('SOURCING_COLLECTION_INCOMPLETE');
      await expect(live.findProductSnapshots({ organizationId: ORG, days: 7, source: 'douyin' })).resolves.toHaveLength(1);
    });
  });

  describe(KINDS.coupangKeywordSuggestion, () => {
    const reader = () => new SourcingKeywordSuggestionRepositoryAdapter(prisma as unknown as PrismaService);
    const collect = () => operations.run(ORG, KINDS.coupangKeywordSuggestion, { keyword: '  Ａ   Pencil ', maxResults: 30 }, [{
      chunkKind: 'keyword_suggestions',
      payload: [{ keyword: 'A Pencil', capturedAt: new Date().toISOString(),
        items: [{ rank: 1, keyword: 'a pencil case', source: 'coupang-autocomplete' }], productNameTokens: [], warnings: [] }],
    }]);
    const latestItems = async (organizationId = ORG) =>
      (await reader().findLatest({ organizationId, normalizedKeyword: 'a pencil' }))?.items ?? [];

    it('does not recover a published suggestion from retained raw evidence once its typed rows are gone', async () => {
      const done = await collect();
      expect(done.refusedWith).toBeNull();
      await expect(latestItems()).resolves.toHaveLength(1);
      expect(await prisma.sourcingEvidenceObservation.count({ where: { operationId: done.operation.id } })).toBe(1);
      await prisma.sourcingKeywordSuggestionSnapshot.deleteMany({ where: { organizationId: ORG } });

      await expect(latestItems()).resolves.toEqual([]);
    });

    it('organization-scopes the typed rows and withholds a superseded observation revision', async () => {
      const done = await collect();
      await expect(latestItems(OTHER_ORGANIZATION_ID)).resolves.toEqual([]);
      const original = await prisma.sourcingEvidenceObservation.findFirstOrThrow({ where: { organizationId: ORG, operationId: done.operation.id } });
      const { id, supersedesObservationId: _supersedes, revision: _revision, revisionAt: _revisionAt, payloadHash: _payload,
        envelopeHash: _envelope, ingestedAt: _ingested, ...rest } = original;
      await prisma.sourcingEvidenceObservation.create({
        data: { ...rest, payload: rest.payload ?? undefined, supersedesObservationId: id, revision: 2, revisionAt: new Date(),
          payloadHash: 'a'.repeat(64), envelopeHash: 'b'.repeat(64), ingestedAt: new Date() } as never,
      });

      await expect(latestItems()).resolves.toEqual([]);
    });
  });

  describe(KINDS.productExtension, () => {
    it('serializes tracking-URL variants of one product on one target and keeps the first record through a failed refresh', async () => {
      const firstUrl = `${product.source_url}?spm=first#detail`;
      const nextUrl = `${product.source_url}?spm=second#description`;
      const first = await operations.start(ORG, KINDS.productExtension, { platform: '1688', url: firstUrl });
      expect(first.operation.plan).toMatchObject({ sourceUrl: firstUrl });
      await expect(operations.start(ORG, KINDS.productExtension, { platform: '1688', url: nextUrl }))
        .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });

      const done = await operations.complete(ORG, first, [{ chunkKind: 'product_document', payload: [{ product: { ...product, source_url: firstUrl }, hadDescription: false }] }]);
      expect(done.refusedWith).toBeNull();
      const before = await prisma.sourceRecord.findFirstOrThrow();

      const next = await operations.start(ORG, KINDS.productExtension, { platform: '1688', url: nextUrl });
      expect(next.operation.plan).toMatchObject({ sourceUrl: nextUrl, targetKey: first.operation.plan?.targetKey });
      expect(next.operation.lockKeys).toEqual(first.operation.lockKeys);
      const failed = await operations.complete(ORG, next, []);
      expect(failed.refusedWith).toBe('SOURCING_COLLECTION_INCOMPLETE');
      expect(await prisma.sourceRecord.findFirstOrThrow()).toEqual(before);
      expect(await prisma.sourcingSourcePublication.findMany({ where: { isCurrent: true }, select: { operationId: true } }))
        .toEqual([{ operationId: first.operation.id }]);
    });

    it('accepts only the platforms its extension source keys authorize', async () => {
      const permit = { runId: '11111111-1111-4111-8111-111111111111', organizationId: ORG,
        sourceKey: 'alibaba.product_extension', scopeKey: 'current-tab', targetKey: 't', leaseToken: 'l', generation: 1,
        leaseExpiresAt: new Date() };
      const projection = { organizationId: ORG, pageType: 'detail' as const, sourceUrl: product.source_url,
        sourcePlatform: 'TAOBAO', externalOfferId: '1', variantKeyNormalized: '', sourceIdentityHash: 'h', rawData: {},
        name: 'x', description: null, category: null, tags: [], thumbnailUrl: null, imageUrl: null, costCny: null,
        triggeredByUserId: null, images: [] };
      const output = { observations: [], typedRecords: [{ kind: 'extension_source_record' as const, row: projection }],
        discoveredCount: 1, rejectedCount: 0, qualityReport: {} };

      await expect(persistBrowserSourceAttemptFacts(prisma as never, permit, output, new Date(), realSalesProductDraftPort(prisma)))
        .rejects.toThrow('does not match its authorized source attempt');
      await expect(persistBrowserSourceAttemptFacts(prisma as never, { ...permit, sourceKey: '1688.product_extension' },
        { ...output, typedRecords: [{ kind: 'extension_source_record' as const, row: { ...projection, sourcePlatform: 'ALIBABA' } }] },
        new Date(), realSalesProductDraftPort(prisma))).rejects.toThrow('does not match its authorized source attempt');
      expect(await prisma.sourceRecord.count()).toBe(0);
    });
  });
});
