import { unusedSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, TEST_USER_ID } from '../../test-helpers/real-prisma';
import { Sourcing1688SearchController } from '../adapter/in/http/sourcing-1688-search.controller';
import { Sourcing1688SearchResultController } from '../adapter/in/http/sourcing-1688-search-result.controller';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { Sourcing1688SearchResultRepositoryAdapter } from '../adapter/out/repository/sourcing-1688-search-result.repository.adapter';
import { Sourcing1688KeywordSearchService } from '../application/service/sourcing-1688-keyword-search.service';
import { Sourcing1688ImageSearchService } from '../application/service/sourcing-1688-image-search.service';
import { Sourcing1688SearchResultService } from '../application/service/sourcing-1688-search-result.service';
import { SourcingWingCatalogIngestService } from '../application/service/sourcing-wing-catalog-ingest.service';
import { SourcingRecommendationSourceRepositoryAdapter } from '../adapter/out/repository/sourcing-recommendation-source.repository.adapter';
import { Sourcing1688KeywordAttentionError, Sourcing1688KeywordProviderError,
  type Search1688KeywordItem } from '../application/port/out/provider/1688-keyword-search.port';
import type { PrismaClient } from '@prisma/client';

const organizationId = TEST_ORGANIZATION_ID;
const user = { id: TEST_USER_ID };
const offer = { offerId: '123', title: '儿童餐盘', priceCny: 3.5,
  sourceUrl: 'https://detail.1688.com/offer/123.html', imageUrl: null,
  monthlySales: 10, tradeScore: 4.8, repurchaseRate: '20%', supplierName: 'factory', score: 88 };

describe('1688 server source owner HTTP with disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let controller: Sourcing1688SearchController;
  let results: Sourcing1688SearchResultController;
  let wing: SourcingWingCatalogIngestService;
  let searchResultsRepository: Sourcing1688SearchResultRepositoryAdapter;
  const session = { searchKeyword: vi.fn<(input: { keyword: string; signal?: AbortSignal }) => Promise<Search1688KeywordItem[]>>(async () => [offer]), close: vi.fn(async () => undefined) };
  const keywordProvider = { openSession: vi.fn(async () => session) };
  const imageProvider = { getStatus: vi.fn(), searchByImage: vi.fn() };

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const attempts = new SourcingBrowserSourceAttemptRepositoryAdapter(prisma as never,
      new SourceFailureAlerts(prisma as never), unusedSalesProductDraftPort);
    const repository = new Sourcing1688SearchResultRepositoryAdapter(prisma as never);
    searchResultsRepository = repository;
    wing = new SourcingWingCatalogIngestService(attempts, new SourcingRecommendationSourceRepositoryAdapter(prisma as never));
    controller = new Sourcing1688SearchController(
      new Sourcing1688KeywordSearchService(keywordProvider, attempts, repository),
      new Sourcing1688ImageSearchService(imageProvider, attempts, repository),
    );
    results = new Sourcing1688SearchResultController(new Sourcing1688SearchResultService(repository, attempts));
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    vi.clearAllMocks();
    keywordProvider.openSession.mockReset().mockImplementation(async () => session);
    session.searchKeyword.mockReset().mockImplementation(async () => [offer]);
    imageProvider.searchByImage.mockReset();
  });

  it('reload read exposes failed source status with the prior COMPLETE cutoff, then replaces it with confirmed empty', async () => {
    const input = { keywords: ['儿童餐盘'] };
    const prior = await controller.searchKeywords(organizationId, user as never, 'read-prior', input);
    session.searchKeyword.mockImplementation(async () => [{ ...offer, offerId: null }]);
    const failed = await controller.searchKeywords(organizationId, user as never, 'read-failed', input);
    const read = await results.latest(['儿童餐盘', 'missing'], undefined, organizationId);
    expect(read).toMatchObject({
      observations: [{ items: [{ offerId: '123' }] }],
      sourceStatuses: [
        { keyword: '儿童餐盘', targetId: null, ready: true,
          latestAttemptId: failed.attempts[0].attemptId, latestAttemptState: 'FAILED',
          actualCutoffAt: prior.attempts[0].completedAt?.toISOString(), errorCode: 'SOURCE_PLAN_INCOMPLETE' },
        { keyword: 'missing', ready: false, latestAttemptState: null, actualCutoffAt: null },
      ],
    });
    session.searchKeyword.mockResolvedValue([]);
    const empty = await controller.searchKeywords(organizationId, user as never, 'read-empty', input);
    expect(await results.latest('儿童餐盘', undefined, organizationId)).toMatchObject({
      observations: [{ items: [] }],
      sourceStatuses: [{ ready: true, latestAttemptState: 'COMPLETE', actualCutoffAt: empty.attempts[0].completedAt?.toISOString(), errorCode: null }],
    });
    expect(keywordProvider.openSession).toHaveBeenCalledTimes(3);
    expect((await results.latest('儿童餐盘', undefined, '00000000-0000-4000-8000-000000000099')).observations).toEqual([]);
  });

  it('keeps an absent source score unavailable instead of publishing zero', async () => {
    await controller.searchKeywords(
      organizationId,
      user as never,
      'read-null-score',
      { keywords: ['儿童餐盘'] },
    );
    await prisma.sourcing1688OfferKeywordObservation.updateMany({
      where: { organizationId, externalOfferId: '123' },
      data: { rawOffer: { tradeScore: 4.8 } },
    });

    await expect(results.latest('儿童餐盘', undefined, organizationId))
      .resolves.toMatchObject({ observations: [{ items: [{ score: null }] }] });
  });

  it('reload read projects RUNNING and expiry without collecting or exposing provider rows', async () => {
    await controller.searchKeywords(organizationId, user as never, 'read-before-running', { keywords: ['儿童餐盘'] });
    let finish!: (items: Search1688KeywordItem[]) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    session.searchKeyword.mockImplementation(async () => { started(); return new Promise((resolve) => { finish = resolve; }); });
    const work = controller.searchKeywords(organizationId, user as never, 'read-running', { keywords: ['儿童餐盘'] });
    await ready;
    try {
      const read = await results.latest('儿童餐盘', undefined, organizationId);
      expect(read).toMatchObject({ observations: [{ items: [{ offerId: '123' }] }],
        sourceStatuses: [{ latestAttemptState: 'RUNNING' }] });
      await prisma.sourcingEvidenceIngestionRun.update({ where: { id: read.sourceStatuses[0].latestAttemptId! }, data: { leaseExpiresAt: new Date(0) } });
      expect(await results.latest('儿童餐盘', undefined, organizationId)).toMatchObject({
        observations: [{ items: [{ offerId: '123' }] }],
        sourceStatuses: [{ ready: true, latestAttemptState: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' }],
      });
      expect(keywordProvider.openSession).toHaveBeenCalledTimes(2);
    } finally { finish([offer]); await work.catch(() => undefined); }
  });

  it('reload read marks a changed authorized image plan STALE while retaining its COMPLETE offers', async () => {
    await publishWing('catalog/owner.jpg');
    imageProvider.searchByImage.mockResolvedValue({ imageUrl: 'source', convertedImageUrl: null,
      items: [{ title: 'case', priceCny: 4, sourceUrl: 'https://detail.1688.com/offer/900.html', imageUrl: null, score: 93 }] });
    const prior = await controller.matchImages(organizationId, user as never, 'read-image', { targetIds: ['product-1::'] });
    expect(await results.latest(undefined, 'product-1::', organizationId)).toMatchObject({
      sourceStatuses: [{ ready: true, latestAttemptState: 'COMPLETE' }],
    });
    await publishWing('catalog/newer.jpg');
    expect(await results.latest(undefined, 'product-1::', organizationId)).toMatchObject({
      observations: [{ items: [{ offerId: '900' }] }],
      sourceStatuses: [{ targetId: 'product-1::', ready: false, actualCutoffAt: prior.attempts[0].completedAt?.toISOString() }],
    });
    expect(imageProvider.searchByImage).toHaveBeenCalledTimes(1);
  });

  it('freezes normalized keyword intent, shares one session, caps six offers and replays the exact source result', async () => {
    session.searchKeyword.mockImplementation(async () => Array.from({ length: 7 }, (_, index) => ({
      ...offer, offerId: String(index + 1), sourceUrl: `https://detail.1688.com/offer/${index + 1}.html`,
    })));
    const first = await controller.searchKeywords(organizationId, user as never, 'keyword-first', { keywords: [' Ａ   Pencil ', '儿童餐盘'] });
    expect(first.attempts).toMatchObject([
      { state: 'COMPLETE', plan: { source: '1688.hot_product', keyword: 'A Pencil', maxResults: 6 } },
      { state: 'COMPLETE', plan: { source: '1688.hot_product', keyword: '儿童餐盘', maxResults: 6 } },
    ]);
    expect(first.attempts[0]).not.toHaveProperty('attemptToken');
    expect(first.result?.units).toMatchObject([
      { keyword: 'A Pencil', discovered: 6, accepted: 6, failed: 0 },
      { keyword: '儿童餐盘', discovered: 6, accepted: 6, failed: 0 },
    ]);
    expect(keywordProvider.openSession).toHaveBeenCalledTimes(1);
    expect(session.searchKeyword.mock.calls.map(([input]) => input.keyword)).toEqual(['A Pencil', '儿童餐盘']);
    expect(session.close).toHaveBeenCalledTimes(1);
    const snapshot = await results.latest(['A Pencil', '儿童餐盘'], undefined, organizationId);
    expect(snapshot.observations).toHaveLength(2);
    expect(snapshot.observations[0].items).toHaveLength(6);
    expect(snapshot.observations[0].items[0]).toMatchObject({ priceCny: 3.5, monthlySales: 10,
      tradeScore: 4.8, repurchaseRate: '20%', supplierName: 'factory', score: 88 });
    expect(await controller.searchKeywords(organizationId, user as never, 'keyword-first', { keywords: ['A Pencil', '儿童餐盘'] })).toEqual(first);
    expect(keywordProvider.openSession).toHaveBeenCalledTimes(1);
    expect((await prisma.$queryRaw<Array<{ absent: boolean }>>`
      SELECT to_regclass('public.operation_runs') IS NULL AS absent
    `)[0]?.absent).toBe(true);
    expect(await prisma.sourcingRecommendationRun.count()).toBe(0);
    expect(await prisma.masterProductAbcEvaluation.count()).toBe(0);
  });

  it('keeps a failed keyword refresh off current data and replays an exact confirmed empty result after newer data', async () => {
    const command = (key: string) => controller.searchKeywords(organizationId, user as never, key, { keywords: ['儿童餐盘'] });
    await command('prior');
    session.searchKeyword.mockImplementation(async () => [{ ...offer, offerId: null }]);
    const failed = await command('rejected');
    expect(failed.attempts[0].state).toBe('FAILED');
    expect(failed.result?.units[0]).toMatchObject({ outcome: 'failed', discovered: 1, accepted: 0, failed: 1, errorCode: 'all_results_rejected' });
    expect(await command('rejected')).toEqual(failed);
    expect((await results.latest('儿童餐盘', undefined, organizationId)).observations[0].items).toHaveLength(1);
    expect(await prisma.alert.count({ where: { organizationId, status: 'OPEN' } })).toBe(1);
    session.searchKeyword.mockImplementation(async () => []);
    const empty = await command('empty');
    expect(empty.result?.units[0]).toMatchObject({ outcome: 'no_change', discovered: 0, accepted: 0 });
    expect((await results.latest('儿童餐盘', undefined, organizationId)).observations[0].items).toEqual([]);
    session.searchKeyword.mockImplementation(async () => [offer]);
    await command('newer');
    expect(await command('empty')).toEqual(empty);
    expect(keywordProvider.openSession).toHaveBeenCalledTimes(4);
    expect(await prisma.alert.count({ where: { organizationId, status: 'OPEN' } })).toBe(0);
  });

  it('freezes authorized image targets, keeps the 18-result provider plan and persists the original field mapping', async () => {
    await publishWing('catalog/owner.jpg');
    imageProvider.searchByImage.mockImplementation(async (input) => ({ imageUrl: input.imageUrl, convertedImageUrl: 'https://images.example/converted.jpg', items: [{
      title: 'pencil case', priceCny: 4, sourceUrl: 'https://detail.1688.com/offer/900.html?from=search', imageUrl: null,
      score: 93, salesNum: 120, salesText: '120件', supplierName: 'factory', supplierFactoryUrl: 'https://factory.1688.com',
      supplierTags: ['源头工厂'], purchaseTags: ['退货'], minOrderQuantity: 2, shippingFulfillmentRate: '98%',
      shippingPickupRate: '96%', shipFrom: '义乌', serviceScore: 4.8, repurchaseRate: '30%',
    }] }));
    const first = await controller.matchImages(organizationId, user as never, 'image-first', { targetIds: ['product-1::'] });
    expect(first.attempts[0]).toMatchObject({ state: 'COMPLETE', plan: { targetId: 'product-1::', keyword: '儿童笔袋文具盒',
      imageUrl: 'https://thumbnail10.coupangcdn.com/thumbnails/remote/160x160ex/image/catalog/owner.jpg', maxResults: 18 } });
    expect(imageProvider.searchByImage).toHaveBeenCalledWith(expect.objectContaining({ keyword: '儿童笔袋文具盒', maxResults: 18 }));
    expect((await results.latest(undefined, 'product-1::', organizationId)).observations[0].items[0]).toMatchObject({
      offerId: '900', title: 'pencil case', score: 93, monthlySales: 120, tradeScore: 4.8, repurchaseRate: '30%',
      salesText: '120件', supplierTags: ['源头工厂'], purchaseTags: ['退货'], minOrderQuantity: 2,
      shippingFulfillmentRate: '98%', shippingPickupRate: '96%', shipFrom: '义乌', serviceScore: 4.8,
    });
    await publishWing('catalog/newer.jpg');
    expect(await controller.matchImages(organizationId, user as never, 'image-first', { targetIds: ['product-1::'] })).toEqual(first);
    expect(imageProvider.searchByImage).toHaveBeenCalledTimes(1);
  });

  it('does not authorize an old image target after a confirmed empty Wing refresh', async () => {
    await publishWing('catalog/owner.jpg');
    await publishWing('catalog/owner.jpg', true);
    const result = await controller.matchImages(organizationId, user as never, 'empty-target', { targetIds: ['product-1::'] });
    expect(result.attempts[0].state).toBe('FAILED');
    expect(result.result?.units[0].errorCode).toBe('target_not_authorized');
    expect(imageProvider.searchByImage).not.toHaveBeenCalled();
  });

  it('masks an old image target when the latest keyword publication is partial or missing', async () => {
    await publishWing('catalog/old-valid.jpg');
    await publishWing('catalog/latest-partial.jpg');
    const latest = await prisma.sourcingSourcePublication.findFirstOrThrow({
      where: { organizationId, sourceKey: 'coupang.wing_catalog' },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    });
    await prisma.sourcingSourcePublication.update({
      where: { id: latest.id },
      data: {
        acceptedCount: 2,
        qualityReport: {
          snapshots: [{ keyword: '초등 필통' }],
          wingReceipts: [{ count: 2, acceptedCount: 2, duplicateCount: 0 }],
        },
      },
    });

    const read = () => searchResultsRepository.resolveImageTargets({
      organizationId,
      targetIds: ['product-1::'],
    });
    await expect(read()).resolves.toEqual({
      targets: [],
      missingTargetIds: ['product-1::'],
    });

    await prisma.sourcingWingCatalogProductSnapshot.deleteMany({
      where: { organizationId, operationId: latest.id },
    });
    await expect(read()).resolves.toEqual({
      targets: [],
      missingTargetIds: ['product-1::'],
    });
  });

  it('stops once when the shared keyword provider session cannot open, preserving its safe error code', async () => {
    keywordProvider.openSession.mockRejectedValue(new Sourcing1688KeywordProviderError('cdp_unavailable'));
    const input = { keywords: ['儿童餐盘', '儿童笔袋'] };
    const result = await controller.searchKeywords(organizationId, user as never, 'provider-open', input);
    expect(result.result?.units).toHaveLength(1);
    expect(result.result?.units[0].errorCode).toBe('cdp_unavailable');
    expect(result.attempts[0].state).toBe('FAILED');
    expect(keywordProvider.openSession).toHaveBeenCalledTimes(1);
    expect(session.close).not.toHaveBeenCalled();
    expect(await controller.searchKeywords(organizationId, user as never, 'provider-open', input)).toEqual(result);
    expect(keywordProvider.openSession).toHaveBeenCalledTimes(1);
  });

  it('returns an existing RUNNING attempt on transport retry without starting a second provider and supports an organization-fenced read', async () => {
    let finish!: (value: Search1688KeywordItem[]) => void;
    let started!: () => void;
    const startedSignal = new Promise<void>((resolve) => { started = resolve; });
    session.searchKeyword.mockImplementation(async () => { started(); return new Promise((resolve) => { finish = resolve; }); });
    const input = { keywords: ['儿童餐盘'] };
    const first = controller.searchKeywords(organizationId, user as never, 'concurrent', input);
    await startedSignal;
    try {
      const retry = await controller.searchKeywords(organizationId, user as never, 'concurrent', input);
      expect(retry).toMatchObject({ attempts: [{ state: 'RUNNING' }], result: null });
      expect(retry.attempts[0]).not.toHaveProperty('attemptToken');
      expect(await controller.readKeywordAttempt(retry.attempts[0].attemptId, organizationId)).toMatchObject({ attempt: { state: 'RUNNING' }, unit: null });
      await expect(controller.readKeywordAttempt(retry.attempts[0].attemptId, '00000000-0000-4000-8000-000000000099')).rejects.toThrow('SOURCE_ATTEMPT_NOT_FOUND');
      await expect(controller.searchKeywords(organizationId, user as never, 'other-active', input)).rejects.toThrow();
      expect(keywordProvider.openSession).toHaveBeenCalledTimes(1);
    } finally { finish([offer]); await first; }
  });

  it('persists a replayable FAILED receipt when the source is disabled during provider IO without publishing its result', async () => {
    const input = { keywords: ['儿童餐盘'] };
    await controller.searchKeywords(organizationId, user as never, 'before-disable', input);
    session.searchKeyword.mockImplementation(async () => {
      await prisma.sourcingCollectionSourceControl.create({ data: { organizationId, sourceKey: '1688.hot_product', enabled: false } });
      return [{ ...offer, offerId: 'newer' }];
    });
    const first = await controller.searchKeywords(organizationId, user as never, 'during-disable', input);
    expect(first.attempts[0]).toMatchObject({ state: 'FAILED', errorCode: 'SOURCE_DISABLED', acceptedCount: 0 });
    expect(first.result?.units[0]).toMatchObject({ discovered: 1, accepted: 1 });
    expect(await controller.searchKeywords(organizationId, user as never, 'during-disable', input)).toEqual(first);
    expect((await results.latest('儿童餐盘', undefined, organizationId)).observations[0].items[0].offerId).toBe('123');
    expect(keywordProvider.openSession).toHaveBeenCalledTimes(2);
    expect(await prisma.sourcing1688OfferKeywordObservation.count()).toBe(1);
    expect(await prisma.alert.count({ where: { organizationId, status: 'OPEN' } })).toBe(1);
  });

  it('rejects explicit source disable and untrusted plan inputs before provider IO', async () => {
    await prisma.sourcingCollectionSourceControl.createMany({ data: ['1688.hot_product', '1688.image_search'].map((sourceKey) => ({ organizationId, sourceKey, enabled: false })) });
    await expect(controller.searchKeywords(organizationId, user as never, 'disabled', { keywords: ['儿童餐盘'] })).rejects.toThrow('SOURCE_DISABLED');
    await expect(controller.matchImages(organizationId, user as never, 'disabled', { targetIds: ['product-1::'] })).rejects.toThrow('SOURCE_DISABLED');
    await expect(controller.searchKeywords(organizationId, user as never, 'invalid', { keywords: ['x'], source: 'other' })).rejects.toThrow('INVALID_1688_KEYWORD_REQUEST');
    await expect(controller.matchImages(organizationId, user as never, 'invalid', { targetIds: ['product-1::'], imageUrl: 'https://attacker.example/a' })).rejects.toThrow('INVALID_1688_IMAGE_REQUEST');
    expect(keywordProvider.openSession).not.toHaveBeenCalled();
    expect(imageProvider.searchByImage).not.toHaveBeenCalled();
  });

  it.each([
    { error: new Sourcing1688KeywordAttentionError('security_challenge'), units: 1, code: 'marketplace_login_required' },
    { error: new Sourcing1688KeywordProviderError('search_extraction_failed'), units: 2, code: 'search_extraction_failed' },
  ])('preserves keyword stop/continue and closes its session for $code', async ({ error, units, code }) => {
    session.searchKeyword.mockRejectedValueOnce(error).mockResolvedValueOnce([]);
    const input = { keywords: ['儿童餐盘', '儿童笔袋'] };
    const first = await controller.searchKeywords(organizationId, user as never, 'provider-search', input);
    expect(first.result?.units).toHaveLength(units);
    expect(first.result?.units[0].errorCode).toBe(code);
    expect(first.attempts[0].state).toBe('FAILED');
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(await controller.searchKeywords(organizationId, user as never, 'provider-search', input)).toEqual(first);
    expect(keywordProvider.openSession).toHaveBeenCalledTimes(1);
    expect(session.searchKeyword).toHaveBeenCalledTimes(units);
  });

  it('preserves unexpected keyword errors while closing the session', async () => {
    session.searchKeyword.mockRejectedValueOnce(new Error('unexpected provider fixture'));
    await expect(controller.searchKeywords(organizationId, user as never, 'unexpected', { keywords: ['儿童餐盘'] })).rejects.toThrow('unexpected provider fixture');
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(await prisma.sourcingEvidenceIngestionRun.count({ where: { status: 'FAILED' } })).toBe(1);
  });

  it('keeps image URL rejection and duplicate handling, preserves the prior complete result, and records an exact empty image result', async () => {
    await publishWing('catalog/owner.jpg');
    const image = { title: 'case', priceCny: 4, sourceUrl: 'https://detail.1688.com/offer/900.html', imageUrl: null, score: 93 };
    const input = { targetIds: ['product-1::'] };
    imageProvider.searchByImage.mockResolvedValue({ imageUrl: 'source', convertedImageUrl: null, items: [image, image] });
    const first = await controller.matchImages(organizationId, user as never, 'image-duplicates', input);
    expect(first.result?.units[0]).toMatchObject({ discovered: 2, accepted: 2, duplicate: 0 });
    expect((await results.latest(undefined, 'product-1::', organizationId)).observations[0].items).toHaveLength(1);
    imageProvider.searchByImage.mockResolvedValue({ imageUrl: 'source', convertedImageUrl: null,
      items: [image, { ...image, sourceUrl: 'https://attacker.example/offer/123.html' }] });
    const rejected = await controller.matchImages(organizationId, user as never, 'image-rejected', input);
    expect(rejected.attempts[0].state).toBe('FAILED');
    expect(rejected.result?.units[0]).toMatchObject({ discovered: 2, accepted: 1, failed: 1 });
    expect(await controller.matchImages(organizationId, user as never, 'image-rejected', input)).toEqual(rejected);
    expect((await results.latest(undefined, 'product-1::', organizationId)).observations[0].items).toHaveLength(1);
    imageProvider.searchByImage.mockResolvedValue({ imageUrl: 'source', convertedImageUrl: null, items: [] });
    const empty = await controller.matchImages(organizationId, user as never, 'image-empty', input);
    expect(empty.result?.units[0].outcome).toBe('no_change');
    expect((await results.latest(undefined, 'product-1::', organizationId)).observations[0].items).toEqual([]);
    expect(await controller.matchImages(organizationId, user as never, 'image-duplicates', input)).toEqual(first);
    expect(imageProvider.searchByImage).toHaveBeenCalledTimes(3);
  });

  it('fails closed on a corrupt exact unit receipt instead of replaying a newer current snapshot', async () => {
    const input = { keywords: ['儿童餐盘'] };
    const old = await controller.searchKeywords(organizationId, user as never, 'corrupt-old', input);
    await controller.searchKeywords(organizationId, user as never, 'valid-newer', input);
    await prisma.sourcingEvidenceIngestionRun.update({ where: { id: old.attempts[0].attemptId }, data: {
      qualityReport: { resultSchemaVersion: 'sourcing-1688-search-result/v1', keyword: '儿童餐盘', targetId: null,
        unitResult: { keyword: '儿童餐盘', targetId: null, outcome: 'complete', discovered: 7, accepted: 7, duplicate: 0, failed: 0 } },
    } });
    await expect(controller.searchKeywords(organizationId, user as never, 'corrupt-old', input)).rejects.toThrow('1688 search result is not yet available.');
    expect(keywordProvider.openSession).toHaveBeenCalledTimes(2);
  });

  async function publishWing(imagePath: string, empty = false) {
    const attempt = await wing.begin({ organizationId, requestedByUserId: TEST_USER_ID, idempotencyKey: randomUUID(),
      input: { keywords: ['초등 필통'], maxPages: 1, purpose: 'catalog_search' } });
    const receipt = await wing.upload({ organizationId, attemptId: attempt.attemptId, attemptToken: attempt.attemptToken,
      batch: { keyword: '초등 필통', maxPages: 1, purpose: 'catalog_search', items: empty ? [] : [{
        productId: 'product-1', itemId: null, vendorItemId: null, productName: '초등학생 대용량 필통', sourceKeyword: '초등 필통',
        itemName: null, brandName: null, manufacture: null, categoryHierarchy: null, imagePath, salePriceKrw: null,
        ratingAverage: null, ratingCount: null, viewsLast28d: null, salesLast28d: null, estimatedRevenue28d: null,
        conversionRate28d: null, deliveryInfo: null, capturedAt: new Date().toISOString(),
      }] } });
    await wing.complete({ organizationId, attemptId: attempt.attemptId, attemptToken: attempt.attemptToken,
      finalization: { purpose: 'catalog_search', receipts: [receipt], keywords: [{ keyword: '초등 필통', outcome: empty ? 'no_change' : 'complete',
        discovered: empty ? 0 : 1, accepted: empty ? 0 : 1, duplicate: 0, failed: 0 }] } });
  }
});
