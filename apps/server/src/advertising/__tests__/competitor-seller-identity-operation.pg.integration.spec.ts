import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  COMPETITOR_SELLER_IDENTITY_CHUNK_KIND,
  COMPETITOR_SELLER_IDENTITY_KIND,
  KEYWORD_SERP_CHUNK_KIND,
  KEYWORD_SERP_KIND,
  type CompetitorSellerIdentityItem,
  type CompetitorSellerIdentityTarget,
  type KeywordSerpItem,
} from '@kiditem/shared/advertising-operations';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { advertisingKeywordOperationsApp, seedCoupangAccount } from '../../test-helpers/advertising-operations';

// SERP 순위 → 경쟁 판매자 확인 연쇄와 판매자 확인 실행(advertising.competitor_seller_identity)을 서버에서 그대로 돈다.
// 판매자 정보는 finish 트랜잭션에서만, 실행이 발행한 SERP 행에만 적힌다(ADR-0025).
describe('advertising.competitor_seller_identity owner over the operation contract + disposable PG', () => {
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

  /** SERP 순위 실행 하나를 끝까지 돌려 SERP 행을 발행한다. finish 응답을 돌려준다. */
  async function publishSerp(keyword: string, items: KeywordSerpItem[]) {
    const run = await harness.beginRun(KEYWORD_SERP_KIND, { keywords: [keyword] });
    await harness.put(run, [{ chunkKind: KEYWORD_SERP_CHUNK_KIND, payload: [{ keyword, capturedAt: new Date().toISOString(), pagesScanned: 1, stopReason: 'empty_page', items }] }]);
    return (await harness.finish(run).expect(200)).body.operation;
  }

  const identity = (target: CompetitorSellerIdentityTarget, sellerId: string): CompetitorSellerIdentityItem => ({
    keyword: target.keyword,
    productKey: target.productKey,
    productId: target.productId,
    vendorItemId: target.vendorItemId,
    link: target.link,
    sellerName: `판매자 ${sellerId}`,
    sellerId,
    sellerStoreUrl: `https://shop.coupang.com/vid/${sellerId}`,
    capturedAt: new Date().toISOString(),
  });

  it('SERP 순위가 끝나면 그 키워드의 판매자 확인을 잇고, 판매자 확인은 조직 잠금으로 판매자를 모르는 경쟁 상품을 계획해 SERP 행에 적는다', async () => {
    const serp = await publishSerp('슬라임', [competitor(1, '101'), competitor(2, '102')]);
    expect(serp.result.next).toEqual({ kind: COMPETITOR_SELLER_IDENTITY_KIND, scope: { keywords: ['슬라임'] } });

    const run = await harness.beginRun(COMPETITOR_SELLER_IDENTITY_KIND, serp.result.next.scope);
    expect(run.operation.lockKeys).toEqual(['org']);
    const targets = (run.operation.plan as { targets: CompetitorSellerIdentityTarget[] }).targets;
    expect(targets.map((target) => [target.keyword, target.productId])).toEqual([['슬라임', '101'], ['슬라임', '102']]);
    expect((await harness.begin(COMPETITOR_SELLER_IDENTITY_KIND, {}).expect(409)).body).toMatchObject({ code: 'OPERATION_IN_PROGRESS' });

    await harness.put(run, [{ chunkKind: COMPETITOR_SELLER_IDENTITY_CHUNK_KIND, payload: targets.map((target, index) => identity(target, `S${index + 1}`)) }]);
    const done = await harness.finish(run).expect(200);
    expect(done.body.operation).toMatchObject({ status: 'succeeded', lockKeys: [], result: { targets: 2, identities: 2, resolvedProductCount: 2 } });

    const snapshot = await prisma.coupangKeywordSerpDailySnapshot.findFirstOrThrow({ where: { organizationId: ORG, keyword: '슬라임' } });
    const serpItems = (snapshot.items as { serpItems: Array<Record<string, unknown>> }).serpItems;
    expect(serpItems.map((item) => [item.productId, item.sellerId, item.sellerIdentityOperationId])).toEqual([
      ['101', 'S1', run.operation.id],
      ['102', 'S2', run.operation.id],
    ]);
    // 판매자를 알게 된 상품은 다음 계획에서 빠진다.
    const again = await harness.beginRun(COMPETITOR_SELLER_IDENTITY_KIND, {});
    expect(again.operation.plan).toMatchObject({ targets: [] });
  });

  it('계획한 상품 하나라도 판매자를 못 읽으면 수집 미완, 계획 밖 상품이면 VALIDATION_FAILED — failed로 끝나면 SERP 행은 그대로다', async () => {
    await publishSerp('슬라임', [competitor(1, '101'), competitor(2, '102')]);
    const run = await harness.beginRun(COMPETITOR_SELLER_IDENTITY_KIND, {});
    const [first] = (run.operation.plan as { targets: CompetitorSellerIdentityTarget[] }).targets;
    await harness.put(run, [{ chunkKind: COMPETITOR_SELLER_IDENTITY_CHUNK_KIND, payload: [identity(first!, 'S1')] }]);
    expect((await harness.finish(run).expect(409)).body).toMatchObject({ code: 'ADVERTISING_COLLECTION_INCOMPLETE' });
    await harness.finish(run, { outcome: 'failed', errorCode: 'ADVERTISING_COLLECTION_INCOMPLETE' }).expect(200);

    const snapshot = await prisma.coupangKeywordSerpDailySnapshot.findFirstOrThrow({ where: { organizationId: ORG, keyword: '슬라임' } });
    expect((snapshot.items as { serpItems: Array<Record<string, unknown>> }).serpItems.every((item) => !item.sellerId && !item.sellerIdentityOperationId)).toBe(true);

    const foreign = await harness.beginRun(COMPETITOR_SELLER_IDENTITY_KIND, {});
    await harness.put(foreign, [{ chunkKind: COMPETITOR_SELLER_IDENTITY_CHUNK_KIND, payload: [identity({ ...first!, productKey: 'product:999' }, 'S9')] }]);
    expect((await harness.finish(foreign).expect(400)).body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'identity_target_mismatch' } });
  });
});
