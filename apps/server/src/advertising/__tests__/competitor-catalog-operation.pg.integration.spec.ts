import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { operationFailureAlerts } from '../../test-helpers/operation-failure-alerts';
import {
  COMPETITOR_CATALOG_CHUNK_KIND,
  COMPETITOR_CATALOG_KIND,
  COMPETITOR_SELLER_IDENTITY_CHUNK_KIND,
  COMPETITOR_SELLER_IDENTITY_KIND,
  KEYWORD_SERP_CHUNK_KIND,
  KEYWORD_SERP_KIND,
  type CompetitorCatalogItem,
  type CompetitorCatalogTarget,
  type CompetitorSellerIdentityTarget,
  type KeywordSerpItem,
} from '@kiditem/shared/advertising-operations';
import { OperationNextSchema } from '@kiditem/shared/operation';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { advertisingKeywordOperationsApp, seedCoupangAccount } from '../../test-helpers/advertising-operations';

// SERP 순위 → 판매자 확인 → 경쟁사 카탈로그 연쇄(옛 SERP batch의 afterBatch)를 서버 실행 계약으로 돈다. 확장 runner처럼
// 성공한 실행의 `result.next`를 같은 조직에서 이어서 begin한다. 카탈로그는 finish 트랜잭션에서만 SERP 행에 붙는다.
describe('advertising.competitor_catalog owner and the K3 → K4 → K5 chain over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof advertisingKeywordOperationsApp>>;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    harness = await advertisingKeywordOperationsApp(prisma);
  });

  afterAll(async () => {
    await harness?.app.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const account = await seedCoupangAccount(prisma, ORG);
    const listing = await prisma.channelListing.create({
      data: { organizationId: ORG, channelAccountId: account, externalId: 'OWN', channelName: '말랑 슬라임 세트' },
    });
    await prisma.channelListingOption.create({ data: { organizationId: ORG, listingId: listing.id, externalOptionId: 'OWN' } });
  });

  const competitor = (rank: number, productId: string): KeywordSerpItem => ({
    rank, page: 1, positionInPage: rank, isAd: false, productId, itemId: null, vendorItemId: `v-${productId}`,
    name: `말랑 슬라임 세트 경쟁 ${productId}`, priceKrw: 5_000, reviewCount: 10, ratingScore: 4.5, imageUrl: null,
    link: `https://www.coupang.com/vp/products/${productId}?vendorItemId=v-${productId}`,
  });

  const catalogOf = (target: CompetitorCatalogTarget, products = 2): CompetitorCatalogItem => ({
    keyword: target.keyword,
    sellerId: target.sellerId,
    sellerName: target.sellerName,
    sellerStoreUrl: target.sellerStoreUrl,
    totalProductCount: products,
    collectedProductCount: products,
    isTruncated: false,
    sort: 'newest',
    capturedAt: new Date().toISOString(),
    products: Array.from({ length: products }, (_, index) => ({
      sourceRank: index + 1, productId: `${target.sellerId}-${index}`, itemId: null, vendorItemId: null, name: `신상품 ${index}`,
      priceKrw: 1_000, reviewCount: 0, imageUrl: null, link: null,
    })),
  });

  /** 확장 runner처럼: 실행 하나를 begin → 청크 → finish 하고, 성공 결과의 `next`를 돌려준다. */
  async function run(kind: string, scope: Record<string, unknown>, chunks: (plan: Record<string, unknown>) => Array<{ chunkKind: string; payload: unknown[] }>) {
    const begun = await harness.beginRun(kind, scope);
    await harness.put(begun, chunks(begun.operation.plan ?? {}));
    const done = (await harness.finish(begun).expect(200)).body.operation;
    expect(done.status).toBe('succeeded');
    return { operation: done, next: done.result?.next ? OperationNextSchema.parse(done.result.next) : null };
  }

  it('SERP 순위 → 판매자 확인 → 경쟁사 카탈로그(보강, 상품 500개까지)가 result.next로 이어지고 카탈로그가 그 키워드의 SERP 행에 붙는다', async () => {
    const serp = await run(KEYWORD_SERP_KIND, { keywords: ['슬라임'] }, () => [{
      chunkKind: KEYWORD_SERP_CHUNK_KIND,
      payload: [{ keyword: '슬라임', capturedAt: new Date().toISOString(), pagesScanned: 1, stopReason: 'empty_page', items: [competitor(1, '101')] }],
    }]);
    expect(serp.next?.kind).toBe(COMPETITOR_SELLER_IDENTITY_KIND);

    const identity = await run(serp.next!.kind, serp.next!.scope, (plan) => [{
      chunkKind: COMPETITOR_SELLER_IDENTITY_CHUNK_KIND,
      payload: (plan.targets as CompetitorSellerIdentityTarget[]).map((target) => ({
        keyword: target.keyword, productKey: target.productKey, productId: target.productId, vendorItemId: target.vendorItemId, link: target.link,
        sellerName: '말랑상회', sellerId: 'A100', sellerStoreUrl: 'https://shop.coupang.com/vid/A100', capturedAt: new Date().toISOString(),
      })),
    }]);
    expect(identity.next).toEqual({ kind: COMPETITOR_CATALOG_KIND, scope: { rankEnrichment: true } });

    const begun = await harness.beginRun(identity.next!.kind, identity.next!.scope);
    expect(begun.operation.lockKeys).toEqual(['resource:competitor:serp-enrichment']);
    const targets = (begun.operation.plan as { targets: CompetitorCatalogTarget[]; productLimit: number });
    expect(targets.productLimit).toBe(500);
    expect(targets.targets.map((target) => [target.sellerId, target.keyword])).toContainEqual(['A100', '슬라임']);
    await harness.put(begun, [{ chunkKind: COMPETITOR_CATALOG_CHUNK_KIND, payload: targets.targets.map((target) => catalogOf(target, target.sellerId === 'A100' ? 120 : 1)) }]);
    const done = (await harness.finish(begun).expect(200)).body.operation;
    expect(done).toMatchObject({ status: 'succeeded', result: { targets: targets.targets.length } });
    expect(done.result.next).toBeUndefined();

    const snapshot = await prisma.coupangKeywordSerpDailySnapshot.findFirstOrThrow({ where: { organizationId: ORG, keyword: '슬라임' } });
    const catalogs = (snapshot.items as { sellerCatalogs: Array<{ sellerId: string; products: unknown[] }> }).sellerCatalogs;
    expect(catalogs.find((catalog) => catalog.sellerId === 'A100')?.products).toHaveLength(120);
  });

  it('판매자 하나 수집은 추적 판매자만(상품 100개), 계획한 판매자를 빠뜨리거나 상한을 넘기면 발행하지 않는다', async () => {
    const standalone = await harness.beginRun(COMPETITOR_CATALOG_KIND, {});
    const plan = standalone.operation.plan as { targets: CompetitorCatalogTarget[]; productLimit: number };
    expect(plan.productLimit).toBe(100);
    const [first] = plan.targets;
    expect(first).toBeDefined();
    await harness.put(standalone, [{ chunkKind: COMPETITOR_CATALOG_CHUNK_KIND, payload: [catalogOf(first!, 101)] }]);
    expect((await harness.finish(standalone).expect(400)).body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'catalog_product_limit' } });
    await harness.finish(standalone, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    await expect(operationFailureAlerts(prisma, ORG)).resolves.toMatchObject({
      rows: 0,
      items: [{ type: 'operation_failure', status: 'OPEN', attemptId: standalone.operation.id, sourceType: COMPETITOR_CATALOG_KIND }],
    });

    const one = await harness.beginRun(COMPETITOR_CATALOG_KIND, { sellerId: first!.sellerId });
    expect((one.operation.plan as { targets: CompetitorCatalogTarget[] }).targets.map((target) => target.sellerId)).toEqual([first!.sellerId]);
    await harness.put(one, [{ chunkKind: COMPETITOR_CATALOG_CHUNK_KIND, payload: [] }]);
    expect((await harness.finish(one).expect(409)).body).toMatchObject({ code: 'ADVERTISING_COLLECTION_INCOMPLETE' });
    await harness.finish(one, { outcome: 'failed', errorCode: 'ADVERTISING_COLLECTION_INCOMPLETE' }).expect(200);

    expect((await harness.begin(COMPETITOR_CATALOG_KIND, { sellerId: 'NOTTRACKED' }).expect(404)).body).toMatchObject({ code: 'ADVERTISING_COMPETITOR_SELLER_NOT_FOUND' });
  });
});
