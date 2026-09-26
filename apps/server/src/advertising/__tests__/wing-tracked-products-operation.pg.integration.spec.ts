import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  WING_TRACKED_PRODUCTS_CHUNK_KIND,
  WING_TRACKED_PRODUCTS_KIND,
  type WingTrackedProductItem,
} from '@kiditem/shared/advertising-operations';
import { makeTestPrisma, OTHER_ORGANIZATION_ID, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { advertisingKeywordOperationsApp, seedCoupangAccount } from '../../test-helpers/advertising-operations';
import { WingTrackedProductRepositoryAdapter } from '../adapter/out/repository/wing-tracked-product.repository.adapter';

// 확장 수집기(advertising.wing_tracked_products)가 밟는 길을 서버에서 그대로: begin → 키워드마다 wing_tracked_search 청크
// → finish. 추적 스냅샷은 finish 트랜잭션에서만, 실행 ID와 함께 쓰인다(ADR-0025).
describe('advertising.wing_tracked_products owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof advertisingKeywordOperationsApp>>;
  let trackers: WingTrackedProductRepositoryAdapter;
  let account: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    harness = await advertisingKeywordOperationsApp(prisma);
    trackers = new WingTrackedProductRepositoryAdapter(prisma as never);
  });

  afterAll(async () => {
    await harness?.app.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    account = await seedCoupangAccount(prisma, ORG);
  });

  const metrics = (productId: string, price: number): WingTrackedProductItem => ({
    productId,
    salePriceKrw: price,
    ratingCount: 3,
    ratingAverage: 4.5,
    pvLast28Day: 10,
    salesLast28d: 2,
    estimatedRevenue28d: price * 2,
    conversionRate28d: 0.2,
  });

  async function track(productId: string, sourceKeyword: string | null) {
    return trackers.registerWithInitialSnapshot({
      productId,
      productName: `Tracked ${productId}`,
      sourceKeyword,
      salePriceKrw: 1_000,
      ratingCount: 1,
      ratingAverage: 4.5,
      pvLast28Day: 10,
      salesLast28d: 2,
      estimatedRevenue28d: 2_000,
      conversionRate28d: 0.2,
    }, ORG);
  }

  it('plan은 계정 잠금과 추적 대상을 고정하고, finish가 계획한 키워드 청크에서 상품마다 그 수집 키워드의 지표를 실행 ID와 함께 쓴다', async () => {
    await track('p-1', '연필');
    await track('p-2', null);
    const run = await harness.beginRun(WING_TRACKED_PRODUCTS_KIND, { channelAccountId: account, keywords: ['연필', ' 지우개 '] });
    expect(run.operation).toMatchObject({
      lockKeys: [`account:${account}`],
      plan: {
        channelAccountId: account,
        keywords: ['연필', '지우개'],
        maxPages: 5,
        products: [{ productId: 'p-1', sourceKeyword: '연필' }, { productId: 'p-2', sourceKeyword: null }],
      },
    });
    await harness.put(run, [
      { chunkKind: WING_TRACKED_PRODUCTS_CHUNK_KIND, payload: [{ keyword: '연필', items: [metrics('p-1', 5_000)] }] },
      // p-1은 연필에서만 받는다(지우개 결과의 p-1은 버린다), 수집 키워드가 없는 p-2는 처음 찾은 키워드로.
      { chunkKind: WING_TRACKED_PRODUCTS_CHUNK_KIND, payload: [{ keyword: '지우개', items: [metrics('p-1', 9_999), metrics('p-2', 7_000)] }] },
    ]);
    const done = await harness.finish(run).expect(200);
    expect(done.body.operation).toMatchObject({
      status: 'succeeded',
      lockKeys: [],
      result: { expectedProductCount: 2, capturedProductCount: 2 },
    });
    const rows = await prisma.coupangWingTrackedProductDailySnapshot.findMany({
      where: { organizationId: ORG, operationId: run.operation.id },
      include: { trackedProduct: { select: { productId: true } } },
      orderBy: { salePriceKrw: 'asc' },
    });
    expect(rows.map((row) => [row.trackedProduct.productId, row.salePriceKrw, row.sourceKeyword])).toEqual([
      ['p-1', 5_000, '연필'],
      ['p-2', 7_000, '지우개'],
    ]);
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('찾지 못한 추적 상품이 있으면 finalize가 거절하고, failed로 끝낸 실행은 이전 스냅샷을 그대로 둔다', async () => {
    await track('p-1', '연필');
    const run = await harness.beginRun(WING_TRACKED_PRODUCTS_KIND, { channelAccountId: account, keywords: ['연필'] });
    await harness.put(run, [{ chunkKind: WING_TRACKED_PRODUCTS_CHUNK_KIND, payload: [{ keyword: '연필', items: [] }] }]);
    const refused = await harness.finish(run).expect(409);
    expect(refused.body).toMatchObject({ code: 'ADVERTISING_TRACKED_PRODUCT_NOT_FOUND' });
    const failed = await harness.finish(run, { outcome: 'failed', errorCode: 'ADVERTISING_TRACKED_PRODUCT_NOT_FOUND' }).expect(200);
    expect(failed.body.operation).toMatchObject({ status: 'failed', lockKeys: [] });
    const rows = await prisma.coupangWingTrackedProductDailySnapshot.findMany({ where: { organizationId: ORG } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ salePriceKrw: 1_000, operationId: null });
    await expect(prisma.alert.findFirst({ where: { organizationId: ORG, dedupeKey: 'source:coupang-wing-tracked-products' } }))
      .resolves.toMatchObject({ status: 'OPEN', attemptId: run.operation.id });

    // 다음 성공이 같은 트랜잭션에서 알림을 닫는다.
    const retry = await harness.beginRun(WING_TRACKED_PRODUCTS_KIND, { channelAccountId: account, keywords: ['연필'] });
    await harness.put(retry, [{ chunkKind: WING_TRACKED_PRODUCTS_CHUNK_KIND, payload: [{ keyword: '연필', items: [metrics('p-1', 3_000)] }] }]);
    await harness.finish(retry).expect(200);
    await expect(prisma.alert.findFirst({ where: { organizationId: ORG, dedupeKey: 'source:coupang-wing-tracked-products' } }))
      .resolves.toMatchObject({ status: 'RESOLVED' });
  });

  it('키워드 청크가 모자라면 수집 미완, 실행 중 추적 대상이 바뀌면 ADVERTISING_TRACKED_TARGETS_CHANGED', async () => {
    await track('p-1', '연필');
    const partial = await harness.beginRun(WING_TRACKED_PRODUCTS_KIND, { channelAccountId: account, keywords: ['연필', '지우개'] });
    await harness.put(partial, [{ chunkKind: WING_TRACKED_PRODUCTS_CHUNK_KIND, payload: [{ keyword: '연필', items: [metrics('p-1', 5_000)] }] }]);
    expect((await harness.finish(partial).expect(409)).body).toMatchObject({ code: 'ADVERTISING_COLLECTION_INCOMPLETE' });
    await harness.finish(partial, { outcome: 'failed', errorCode: 'ADVERTISING_COLLECTION_INCOMPLETE' }).expect(200);

    const run = await harness.beginRun(WING_TRACKED_PRODUCTS_KIND, { channelAccountId: account, keywords: ['연필'] });
    await track('p-3', '연필');
    await harness.put(run, [{ chunkKind: WING_TRACKED_PRODUCTS_CHUNK_KIND, payload: [{ keyword: '연필', items: [metrics('p-1', 5_000), metrics('p-3', 6_000)] }] }]);
    expect((await harness.finish(run).expect(409)).body).toMatchObject({ code: 'ADVERTISING_TRACKED_TARGETS_CHANGED' });
  });

  it('계정이 조직의 쿠팡 계정이 아니거나, 추적 키워드가 요청에 빠졌거나, 같은 계정 실행이 돌면 begin을 거절한다', async () => {
    await track('p-1', '연필');
    const foreign = await seedCoupangAccount(prisma, OTHER_ORGANIZATION_ID);
    expect((await harness.begin(WING_TRACKED_PRODUCTS_KIND, { channelAccountId: foreign, keywords: ['연필'] }).expect(404)).body)
      .toMatchObject({ code: 'ADVERTISING_ACCOUNT_NOT_FOUND' });
    expect((await harness.begin(WING_TRACKED_PRODUCTS_KIND, { channelAccountId: account, keywords: ['지우개'] }).expect(400)).body)
      .toMatchObject({ code: 'ADVERTISING_TRACKED_KEYWORDS_INCOMPLETE' });
    const first = await harness.beginRun(WING_TRACKED_PRODUCTS_KIND, { channelAccountId: account, keywords: ['연필'] });
    expect((await harness.begin(WING_TRACKED_PRODUCTS_KIND, { channelAccountId: account, keywords: ['연필'] }).expect(409)).body)
      .toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: first.operation.id } });
  });
});
