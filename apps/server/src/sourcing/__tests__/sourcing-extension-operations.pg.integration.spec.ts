import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OPERATION_TOKEN_HEADER, OperationBeginResponseSchema } from '@kiditem/shared/operation';
import { SOURCING_OPERATION_KINDS as KINDS } from '@kiditem/shared/sourcing-operation';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { OperationsController } from '../../common/operation/adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../../common/operation/adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from '../../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../common/operation/application/service/operation.service';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { realSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { SOURCING_EXTENSION_OPERATION_OWNERS } from '../adapter/in/operation/sourcing-extension-operation-owners';
import { LiveCommerceRepositoryAdapter } from '../adapter/out/repository/live-commerce.repository.adapter';
import { SourcingKeywordSuggestionRepositoryAdapter } from '../adapter/out/repository/sourcing-keyword-suggestion.repository.adapter';
import { SourcingOperationLedgerRepositoryAdapter } from '../adapter/out/repository/sourcing-operation-ledger.repository.adapter';
import { SourcingRecommendationSourceRepositoryAdapter } from '../adapter/out/repository/sourcing-recommendation-source.repository.adapter';
import { TrendCollectionRepositoryAdapter } from '../adapter/out/repository/trend-collection.repository.adapter';
import { SOURCING_EXTENSION_OPERATION_PORT } from '../application/port/in/sourcing-extension-operation.port';
import { SourcingExtensionOperationService } from '../application/service/sourcing-extension-operation.service';
import { TrendCollectService } from '../application/service/trend-collect.service';

/**
 * 확장 구동 소싱 kind 6종(KID-360)을 실행 계약 HTTP로 끝까지 돌린다: begin → 청크 → finish. 성공은 원장 행을
 * 실행 id로 쓰고 발행 이력의 현재 행을 바꿔 끼우며 옛 원장 행은 남는다. 범위를 다 채우지 못한 finish는 거절되고
 * 확장 runner가 보내는 finish(failed)로 끝나 원장 0·발행 그대로·원천 실패 알림 1이다.
 */
const product = JSON.parse(readFileSync(resolve(__dirname, '../../../../../extensions/tests/fixtures/1688-product-detail-v1.json'), 'utf8'));
const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const CAPTURED_AT = '2026-09-25T01:00:00.000Z';

describe('sourcing extension-driven operation kinds (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  let accountId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const db = prisma as unknown as PrismaService;
    const history = new TrendCollectionRepositoryAdapter(db);
    const trends = new TrendCollectService({} as never, {} as never, {} as never, {} as never, history, {} as never);
    const service = new SourcingExtensionOperationService(
      new SourcingOperationLedgerRepositoryAdapter(db, new SourceFailureAlerts(db), realSalesProductDraftPort(prisma)),
      // Channels 계정 capability 자리: 이 조직의 쿠팡 계정 행을 그대로 본다.
      { isActiveCoupangAccount: async (organizationId, id) =>
        (await prisma.channelAccount.count({ where: { id, organizationId, channel: 'coupang' } })) === 1 },
      trends,
    );
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OperationsController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(db) },
        { provide: SOURCING_EXTENSION_OPERATION_PORT, useValue: service },
        ...SOURCING_EXTENSION_OPERATION_OWNERS,
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: ORG };
      next();
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    accountId = (await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Wing', externalAccountId: 'A00000001' },
    })).id;
  });

  async function begin(kind: string, scope: Record<string, unknown>) {
    return OperationBeginResponseSchema.parse(
      (await request(url).post('/api/operations').send({ kind, scope }).expect(201)).body,
    );
  }

  async function put(begun: { operation: { id: string }; token: string }, chunkKind: string, sequence: number, payload: unknown[]) {
    await request(url)
      .put(`/api/operations/${begun.operation.id}/chunks/${chunkKind}/${sequence}`)
      .set(OPERATION_TOKEN_HEADER, begun.token)
      .send({ checksum: checksum(payload), payload })
      .expect(200);
  }

  function finish(begun: { operation: { id: string }; token: string }, body: Record<string, unknown> = { outcome: 'succeeded' }) {
    return request(url)
      .post(`/api/operations/${begun.operation.id}/finish`)
      .set(OPERATION_TOKEN_HEADER, begun.token)
      .send(body);
  }

  /** 확장 runner가 finish(succeeded) 거절 뒤에 하는 일: 그 코드로 finish(failed). */
  async function refuseThenFail(begun: { operation: { id: string }; token: string }, code: string) {
    const refused = await finish(begun).expect((response) => expect(response.status).toBeGreaterThanOrEqual(400));
    expect(refused.body.code).toBe(code);
    const failed = await finish(begun, { outcome: 'failed', errorCode: code, errorMessage: refused.body.message }).expect(200);
    expect(failed.body.operation).toMatchObject({ status: 'failed', errorCode: code });
  }

  const publications = (sourceKey: string) => prisma.sourcingSourcePublication.findMany({
    where: { organizationId: ORG, sourceKey },
    orderBy: { completedAt: 'asc' },
    select: { operationId: true, isCurrent: true, targetKey: true, collectorKey: true, acceptedCount: true },
  });

  describe(KINDS.wingCatalog, () => {
    const item = (keyword: string, productId: string) => ({
      sourceKeyword: keyword, productId, itemId: `${productId}-i`, vendorItemId: `${productId}-v`,
      productName: `${keyword} 상품`, itemName: null, brandName: null, manufacture: null, categoryHierarchy: null,
      imagePath: 'catalog/a.jpg', salePriceKrw: 1000, ratingAverage: 4.5, ratingCount: 10, viewsLast28d: 100,
      salesLast28d: 5, estimatedRevenue28d: null, conversionRate28d: null, deliveryInfo: null, capturedAt: CAPTURED_AT,
    });
    const scope = () => ({ channelAccountId: accountId, keywords: ['a pencil', 'eraser'], maxPages: 2, purpose: 'catalog_search' });
    const page = (keyword: string, items: unknown[]) => [{ keyword, maxPages: 2, purpose: 'catalog_search', items }];

    it('locks the Wing account, writes facts and the current publication at finish, and later replaces only the publication', async () => {
      const first = await begin(KINDS.wingCatalog, scope());
      expect(first.operation.lockKeys).toEqual([`account:${accountId}`, 'resource:coupang-wing:catalog']);
      expect(first.operation.plan).toMatchObject({ sourceKey: 'coupang.wing_catalog', targetKey: 'catalog', startedBy: USER });
      // 같은 계정의 두 번째 시작은 막힌다.
      const blocked = await request(url).post('/api/operations').send({ kind: KINDS.wingCatalog, scope: scope() }).expect(409);
      expect(blocked.body.code).toBe('OPERATION_IN_PROGRESS');

      await put(first, 'wing_search_page', 1, page('a pencil', [item('a pencil', 'p1'), item('a pencil', 'p1')]));
      await put(first, 'wing_search_page', 2, page('eraser', []));
      // 청크 시점에는 원장에 쓰지 않는다.
      expect(await prisma.sourcingWingCatalogProductSnapshot.count()).toBe(0);
      const done = await finish(first).expect(200);
      expect(done.body.operation).toMatchObject({ status: 'succeeded', result: {
        sourceKey: 'coupang.wing_catalog', discoveredCount: 2, acceptedCount: 1, duplicateCount: 1, rejectedCount: 0,
      } });
      expect(await prisma.sourcingWingCatalogProductSnapshot.findMany({ select: { operationId: true } }))
        .toEqual([{ operationId: first.operation.id }]);
      expect(await publications('coupang.wing_catalog')).toEqual([
        { operationId: first.operation.id, isCurrent: true, targetKey: 'catalog', collectorKey: KINDS.wingCatalog, acceptedCount: 1 },
      ]);
      const reader = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
      await expect(reader.listWingCatalogSnapshot({ organizationId: ORG, normalizedKeyword: 'a pencil', limit: 10 }))
        .resolves.toMatchObject({ items: [{ productId: 'p1' }], rejectedCount: 0 });

      const second = await begin(KINDS.wingCatalog, { ...scope(), keywords: ['eraser'] });
      await put(second, 'wing_search_page', 1, page('eraser', [item('eraser', 'p2')]));
      await finish(second).expect(200);
      expect((await publications('coupang.wing_catalog')).map((row) => [row.operationId, row.isCurrent])).toEqual([
        [first.operation.id, false],
        [second.operation.id, true],
      ]);
      // 옛 발행의 원장 행은 그대로이고, 키워드별 최신 발행은 두 발행을 가로질러 읽힌다.
      expect(await prisma.sourcingWingCatalogProductSnapshot.count()).toBe(2);
      await expect(reader.listWingCatalogSnapshot({ organizationId: ORG, normalizedKeyword: 'a pencil', limit: 10 }))
        .resolves.toMatchObject({ items: [{ productId: 'p1' }] });
      await expect(reader.listWingCatalogSnapshot({ organizationId: ORG, normalizedKeyword: 'eraser', limit: 10 }))
        .resolves.toMatchObject({ items: [{ productId: 'p2' }] });
    });

    it('refuses a finish that misses a planned keyword: no ledger rows, the publication stays, one source-failure alert', async () => {
      const prior = await begin(KINDS.wingCatalog, { ...scope(), keywords: ['eraser'] });
      await put(prior, 'wing_search_page', 1, page('eraser', [item('eraser', 'p2')]));
      await finish(prior).expect(200);

      const partial = await begin(KINDS.wingCatalog, scope());
      await put(partial, 'wing_search_page', 1, page('a pencil', [item('a pencil', 'p1')]));
      await refuseThenFail(partial, 'SOURCING_COLLECTION_INCOMPLETE');
      expect(await prisma.sourcingWingCatalogProductSnapshot.count({ where: { operationId: partial.operation.id } })).toBe(0);
      expect(await prisma.sourcingEvidenceObservation.count({ where: { operationId: partial.operation.id } })).toBe(0);
      expect(await publications('coupang.wing_catalog')).toMatchObject([{ operationId: prior.operation.id, isCurrent: true }]);
      await expect(prisma.alert.findMany({ select: { dedupeKey: true, status: true, attemptId: true } })).resolves.toEqual([
        { dedupeKey: 'source:coupang-wing-catalog', status: 'OPEN', attemptId: partial.operation.id },
      ]);
    });

    it('refuses an account that is not this organization’s Coupang account', async () => {
      const refused = await request(url).post('/api/operations')
        .send({ kind: KINDS.wingCatalog, scope: { ...scope(), channelAccountId: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f' } })
        .expect(404);
      expect(refused.body.code).toBe('SOURCING_ACCOUNT_NOT_FOUND');
    });
  });

  describe(KINDS.coupangKeywordSuggestion, () => {
    const document = (keyword: string, items = [{ rank: 1, keyword: `${keyword} 세트`, source: 'coupang-autocomplete' }]) => ({
      keyword, capturedAt: CAPTURED_AT, items, productNameTokens: [], warnings: [],
    });

    it('publishes one keyword target and the snapshot reader returns it; a second start on the same keyword is refused', async () => {
      const begun = await begin(KINDS.coupangKeywordSuggestion, { keyword: '필통', maxResults: 10 });
      expect(begun.operation.lockKeys).toEqual(['resource:coupang:keyword:필통']);
      const blocked = await request(url).post('/api/operations')
        .send({ kind: KINDS.coupangKeywordSuggestion, scope: { keyword: ' 필통 ', maxResults: 5 } }).expect(409);
      expect(blocked.body.code).toBe('OPERATION_IN_PROGRESS');
      await put(begun, 'keyword_suggestions', 1, [document('필통')]);
      await finish(begun).expect(200);
      expect(await publications('coupang.keyword_suggestion')).toMatchObject([
        { operationId: begun.operation.id, isCurrent: true, targetKey: 'keyword:필통' },
      ]);
      const latest = await new SourcingKeywordSuggestionRepositoryAdapter(prisma as never)
        .findLatest({ organizationId: ORG, normalizedKeyword: '필통' });
      expect(latest?.items).toEqual([{ rank: 1, keyword: '필통 세트', source: 'coupang-autocomplete' }]);
    });

    it('refuses a document for another keyword and writes nothing', async () => {
      const begun = await begin(KINDS.coupangKeywordSuggestion, { keyword: '필통', maxResults: 10 });
      await put(begun, 'keyword_suggestions', 1, [document('지우개')]);
      await refuseThenFail(begun, 'SOURCING_COLLECTION_INCOMPLETE');
      expect(await prisma.sourcingKeywordSuggestionSnapshot.count()).toBe(0);
      expect(await publications('coupang.keyword_suggestion')).toEqual([]);
    });
  });

  describe(KINDS.trend1688, () => {
    beforeEach(async () => {
      await prisma.trendSeedKeyword.create({ data: { organizationId: ORG, keyword: '필통', keywordCn: '笔袋', sources: ['1688'] } });
    });
    const offers = (keyword: string, offerId: string) => [{ keyword, items: [{ offerId, title: `${keyword} offer`, priceCny: 3.5, rank: 1 }] }];

    it('freezes the seed keywords, publishes the offers, and the 1688 history reader returns them', async () => {
      const begun = await begin(KINDS.trend1688, {});
      // 시드의 중국어 키워드가 먼저, 도우인 큐레이션 키워드가 뒤에 붙는다(옛 plan과 같다).
      const keywords = begun.operation.plan?.keywords as string[];
      expect(keywords[0]).toBe('笔袋');
      expect(begun.operation.lockKeys).toEqual(['resource:ali1688:all']);
      await put(begun, 'offers_1688', 1, offers('笔袋', 'o-1'));
      for (const [index, keyword] of keywords.slice(1).entries()) {
        await put(begun, 'offers_1688', index + 2, [{ keyword, items: [] }]);
      }
      await finish(begun).expect(200);
      const history = await new TrendCollectionRepositoryAdapter(prisma as never).find1688HotHistory({ organizationId: ORG, days: 7 });
      expect(history).toMatchObject([{ offerId: 'o-1', sourceKeyword: '笔袋' }]);
      expect(await publications('1688.hot_product')).toMatchObject([{ operationId: begun.operation.id, isCurrent: true, targetKey: 'all' }]);
    });

    it('refuses a finish without the frozen keyword', async () => {
      const begun = await begin(KINDS.trend1688, {});
      await refuseThenFail(begun, 'SOURCING_COLLECTION_INCOMPLETE');
      expect(await prisma.sourcing1688OfferKeywordObservation.count()).toBe(0);
    });
  });

  describe(KINDS.liveCommerce, () => {
    const pageUrl = 'https://live.douyin.com/123456';

    it('publishes the broadcast and its products for the room target', async () => {
      const begun = await begin(KINDS.liveCommerce, { platform: 'douyin', url: pageUrl });
      expect(begun.operation.plan).toMatchObject({ sourceKey: 'douyin.live_commerce', scopeKey: 'page-url' });
      expect(begun.operation.lockKeys[0]).toMatch(/^resource:douyin:room:[0-9a-f]{64}$/);
      await put(begun, 'live_broadcast', 1, [{ source: 'douyin', pageUrl, broadcast: { broadcastId: 'b-1', title: '방송' } }]);
      await put(begun, 'live_products', 1, [{ productId: 'p-1', title: '상품', rank: 1 }]);
      await finish(begun).expect(200);
      const reader = new LiveCommerceRepositoryAdapter(prisma as never);
      await expect(reader.findBroadcastSnapshots({ organizationId: ORG, days: 7 })).resolves.toMatchObject([{ broadcastId: 'b-1' }]);
      await expect(reader.findProductSnapshots({ organizationId: ORG, days: 7 })).resolves.toMatchObject([{ productId: 'p-1' }]);
    });

    it('refuses a scope whose platform does not match the URL', async () => {
      const refused = await request(url).post('/api/operations')
        .send({ kind: KINDS.liveCommerce, scope: { platform: '1688', url: pageUrl } }).expect(400);
      expect(refused.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe(KINDS.tiktokCreative, () => {
    beforeEach(async () => {
      await prisma.trendSeedKeyword.create({ data: { organizationId: ORG, keyword: 'school', sources: ['tiktok-cc'] } });
    });

    it('requires every planned target to be visited before it publishes', async () => {
      const begun = await begin(KINDS.tiktokCreative, { maxItems: 50 });
      expect(begun.operation.plan).toMatchObject({ targetIds: ['hashtag', 'product', 'keyword:school'] });
      await put(begun, 'creative_trends', 1, [{ targetId: 'hashtag', region: 'KR', items: [{ trendType: 'hashtag', entityKey: 'one' }] }]);
      await put(begun, 'creative_trends', 2, [{ targetId: 'product', region: 'KR', items: [{ trendType: 'product', entityKey: 'two' }] }]);
      await refuseThenFail(begun, 'SOURCING_COLLECTION_INCOMPLETE');
      expect(await prisma.tiktokCreativeTrendDailySnapshot.count()).toBe(0);

      const complete = await begin(KINDS.tiktokCreative, { maxItems: 50 });
      for (const [index, targetId] of ['hashtag', 'product', 'keyword:school'].entries()) {
        await put(complete, 'creative_trends', index + 1, [{ targetId, region: 'KR', items: [{ trendType: 'keyword', entityKey: `k-${index}` }] }]);
      }
      await finish(complete).expect(200);
      const history = await new TrendCollectionRepositoryAdapter(prisma as never).findTiktokCcHistory({ organizationId: ORG, days: 7 });
      expect(history.map((row) => row.entityKey).sort()).toEqual(['k-0', 'k-1', 'k-2']);
    });
  });

  describe(KINDS.productExtension, () => {
    it('admits the source record and its draft with the starting user, and refuses the same product twice', async () => {
      const begun = await begin(KINDS.productExtension, { platform: '1688', url: product.source_url });
      expect(begun.operation.plan).toMatchObject({ sourceUrl: product.source_url, startedBy: USER, scopeKey: 'current-tab' });
      await put(begun, 'product_document', 1, [{ product, hadDescription: false }]);
      const done = await finish(begun).expect(200);
      const record = await prisma.sourceRecord.findFirstOrThrow({ select: { id: true, triggeredByUserId: true } });
      expect(record.triggeredByUserId).toBe(USER);
      const draft = await prisma.salesProduct.findFirstOrThrow({ where: { sourceRecordId: record.id }, select: { id: true } });
      expect(done.body.operation.result.admitted).toEqual([{ sourceRecordId: record.id, salesProductId: draft.id }]);

      const again = await begin(KINDS.productExtension, { platform: '1688', url: product.source_url });
      await put(again, 'product_document', 1, [{ product, hadDescription: false }]);
      const refused = await finish(again).expect(409);
      expect(refused.body).toMatchObject({ code: 'SOURCING_DUPLICATE_RECORD', details: { reason: 'draft_exists' } });
      expect(await prisma.sourceRecord.count()).toBe(1);
    });
  });
});
