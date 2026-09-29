import { advertisingLedgerTestReader } from '../../test-helpers/channel-fact-ports';
import { AdvertisingKeywordRankReadAdapter } from '../../advertising/adapter/out/repository/keyword-rank-read.adapter';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { ReadinessService } from '../readiness.service';
import { ChannelAccountService } from '../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../channels/adapter/out/credentials/channel-credentials.adapter';
import { ChannelsProductMappingGenerationAdapter } from "../../channels/adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";
import { ChannelCatalogFreshnessAdapter } from '../../channels/adapter/out/operation/channel-catalog-freshness.adapter';
import { makeWingCatalogOperations } from '../../test-helpers/wing-catalog-operations';


describe('Coupang catalog readiness count over PostgreSQL', () => {
  let prisma: PrismaClient;
  let accountId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    accountId = (await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Wing',
        isPrimary: true,
        status: 'active',
      },
    })).id;
  });

  function readiness() {
    return new ReadinessService(
      prisma as never,
      new ChannelAccountService(
        new ChannelAccountPersistenceAdapter(prisma as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
        new ChannelCredentialsAdapter(),
      ),
      new ChannelCatalogFreshnessAdapter(makeWingCatalogOperations(prisma).operations),
      new AdvertisingKeywordRankReadAdapter(prisma as never),
      advertisingLedgerTestReader(prisma as never),
    );
  }

  it('reads catalog freshness from the latest succeeded Wing details operation and counts operation-published listings (KID-354)', async () => {
    await prisma.channelAccount.update({ where: { id: accountId }, data: { vendorId: 'V1' } });
    const wing = makeWingCatalogOperations(prisma);
    const product = (id: string) => ({
      externalProductId: id, registeredName: id, displayName: id, category: null, manufacturer: null, brand: null,
      productStatus: 'APPROVED', media: [], raw: { modifiedOn: '2026-09-01T00:00:00' },
      options: [{
        externalOptionId: `${id}-O`, optionName: '기본', skuStatus: 'ONSALE', salePrice: 1000, sellerSku: null,
        modelNumber: null, barcode: null, attributes: [], media: [], raw: {},
      }],
    });
    const list = await wing.runList(accountId, [product('P1'), product('P2')]);
    // 목록만 끝났으면 아직 상세까지 반영한 적이 없다.
    const beforeDetails = (await readiness().getStatus(ORG)).checks.find((check) => check.key === 'coupang_products');
    expect(beforeDetails).toMatchObject({ count: 2 });
    expect(beforeDetails?.basis).toMatchObject({ observedAt: null });

    const scope = (list.result as { next: { scope: { channelAccountId: string; detailTargetProductIds: string[]; absentProductIds: string[] } } }).next.scope;
    expect(scope).toMatchObject({ via: 'list' });
    const detail = (id: string) => ({
      externalProductId: id, documents: [], media: [], raw: {},
      options: [{ externalOptionId: `${id}-O`, documentIds: [] }],
    });
    const details = await wing.runDetails(scope, [detail('P1'), detail('P2')]);
    const products = (await readiness().getStatus(ORG)).checks.find((check) => check.key === 'coupang_products');
    expect(products).toMatchObject({ count: 2, detail: '쿠팡 상품 2건 수집됨' });
    expect(products?.basis).toMatchObject({ observedAt: details.finishedAt });

    // 상품 하나 다시 받기(manual)는 동기화가 아니다 — 끝나도 신선도는 그대로다.
    const manual = await wing.runDetails({ channelAccountId: accountId, detailTargetProductIds: ['P1'], absentProductIds: [] }, []);
    expect(manual).toMatchObject({ status: 'succeeded', plan: { via: 'manual' } });
    const after = (await readiness().getStatus(ORG)).checks.find((check) => check.key === 'coupang_products');
    expect(after?.basis).toMatchObject({ observedAt: details.finishedAt });

    // 바뀐 게 없는 두 번째 동기화는 목록에서 끝난다(next: null) — 그 끝도 동기화의 끝이다.
    const second = await wing.runList(accountId, [product('P1'), product('P2')]);
    expect(second.result).toMatchObject({ next: null });
    const latest = (await readiness().getStatus(ORG)).checks.find((check) => check.key === 'coupang_products');
    expect(latest?.basis).toMatchObject({ observedAt: second.finishedAt });
  });

  it('counts only active listings an operation published — an old completed catalog run no longer counts', async () => {
    const completedLegacy = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        sourceType: 'coupang_wing_catalog',
        status: 'completed',
        importedAt: new Date('2026-09-12T01:00:00.000Z'),
      },
    });
    const listings = [
      { externalId: 'OPERATION', lastOperationId: '75000000-0000-4000-8000-000000000001', isActive: true },
      { externalId: 'OPERATION-INACTIVE', lastOperationId: '75000000-0000-4000-8000-000000000001', isActive: false },
      { externalId: 'COMPLETED-LEGACY', isActive: true },
      { externalId: 'UNSOURCED', isActive: true },
    ];
    for (const listing of listings) {
      await prisma.channelListing.create({
        data: { organizationId: ORG, channelAccountId: accountId, displayName: listing.externalId, ...listing },
      });
    }

    const status = await readiness().getStatus(ORG);
    const products = status.checks.find((check) => check.key === 'coupang_products');

    // 신선도는 옛 run이 아니라 상세 kind 실행이 정한다(KID-354) — 여기서는 셈만 본다.
    expect(products).toMatchObject({ count: 1 });
  });
});
