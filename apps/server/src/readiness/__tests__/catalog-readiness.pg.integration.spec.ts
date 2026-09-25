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

const CATALOG_OWNER_PARSER = 'coupang-catalog-owner-v1';

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
    const details = await wing.runDetails(scope, []);
    const products = (await readiness().getStatus(ORG)).checks.find((check) => check.key === 'coupang_products');
    expect(products).toMatchObject({ count: 2, detail: '쿠팡 상품 2건 수집됨' });
    expect(products?.basis).toMatchObject({ observedAt: details.finishedAt });
  });

  function catalogRun(data: {
    sourceType: string;
    status: string;
    parserVersion?: string;
    rootAttemptId?: string;
  }) {
    const { rootAttemptId, ...run } = data;
    return prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        importedAt: run.status === 'completed' ? new Date('2026-09-12T01:00:00.000Z') : null,
        ...(rootAttemptId
          ? { plan: { stage: 'details', rootAttemptId, basicAttemptId: rootAttemptId } }
          : {}),
        ...run,
      },
    });
  }

  it('counts listings of completed catalog runs only', async () => {
    const completedBasics = await catalogRun({
      sourceType: 'coupang_wing_catalog_basics',
      status: 'completed',
      parserVersion: CATALOG_OWNER_PARSER,
    });
    const failedBasics = await catalogRun({
      sourceType: 'coupang_wing_catalog_basics',
      status: 'failed',
      parserVersion: CATALOG_OWNER_PARSER,
    });
    const detailsOf = (rootAttemptId: string, status: string) => catalogRun({
      sourceType: 'coupang_wing_catalog_details',
      status,
      parserVersion: CATALOG_OWNER_PARSER,
      rootAttemptId,
    });
    const counted = [
      ['COMPLETED-LEGACY', await catalogRun({ sourceType: 'coupang_wing_catalog', status: 'completed' })],
      ['COMPLETED-BASICS', completedBasics],
      ['COMPLETED-DETAILS', await detailsOf(completedBasics.id, 'completed')],
    ] as const;
    const notCounted = [
      ['RUNNING-LEGACY', await catalogRun({ sourceType: 'coupang_wing_catalog', status: 'running' })],
      ['FAILED-LEGACY', await catalogRun({ sourceType: 'coupang_wing_catalog', status: 'failed' })],
      ['RUNNING-BASICS', await catalogRun({
        sourceType: 'coupang_wing_catalog_basics',
        status: 'running',
        parserVersion: CATALOG_OWNER_PARSER,
      })],
      ['FAILED-BASICS', failedBasics],
      ['RUNNING-DETAILS-OF-FAILED-BASICS', await detailsOf(failedBasics.id, 'running')],
      // KID-348: 상세는 종료 트랜잭션에서만 리스팅에 쓴다. 끝나지 않은 상세 시도를 가리키는 리스팅은
      // 이 PR 이전에 청크 시점 반영이 남긴 행뿐이고, 다음 목록 단계가 완료 시도로 옮긴다.
      ['RUNNING-DETAILS-OF-COMPLETED-BASICS', await detailsOf(completedBasics.id, 'running')],
      ['FAILED-DETAILS-OF-COMPLETED-BASICS', await detailsOf(completedBasics.id, 'failed')],
    ] as const;
    for (const [externalId, run] of [...counted, ...notCounted]) {
      await prisma.channelListing.create({
        data: {
          organizationId: ORG,
          channelAccountId: accountId,
          externalId,
          displayName: externalId,
          lastImportRunId: run.id,
          isActive: true,
        },
      });
    }

    const status = await readiness().getStatus(ORG);
    const products = status.checks.find((check) => check.key === 'coupang_products');

    // 신선도는 옛 run이 아니라 상세 kind 실행이 정한다(KID-354) — 여기서는 셈만 본다.
    expect(products).toMatchObject({ count: counted.length });
  });
});
