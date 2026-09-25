import { unusedSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { sourcingExtensionOperations } from '../../test-helpers/sourcing-extension-operations';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, TEST_USER_ID } from '../../test-helpers/real-prisma';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { SourcingRecommendationSourceRepositoryAdapter } from '../adapter/out/repository/sourcing-recommendation-source.repository.adapter';
import { Sourcing1688SearchResultRepositoryAdapter } from '../adapter/out/repository/sourcing-1688-search-result.repository.adapter';
import { SourcingWingCatalogIngestService } from '../application/service/sourcing-wing-catalog-ingest.service';
import { SourcingWorkspaceController } from '../adapter/in/http/sourcing-workspace.controller';
import type { PrismaClient } from '@prisma/client';
import type { SourcingWingCatalogObservation } from '@kiditem/shared/sourcing';

const organizationId = TEST_ORGANIZATION_ID;
const user = { id: TEST_USER_ID };
const item: SourcingWingCatalogObservation = { productId: '123', itemId: null, vendorItemId: null, productName: '연필',
  itemName: null, brandName: null, manufacture: null, categoryHierarchy: null, imagePath: null,
  salePriceKrw: 1000, ratingAverage: null, ratingCount: null, viewsLast28d: null,
  salesLast28d: null, estimatedRevenue28d: null, conversionRate28d: null, deliveryInfo: null,
  sourceKeyword: 'A Pencil', capturedAt: '2026-09-05T00:00:00.000Z' };

describe('Wing catalog source owner with disposable PostgreSQL (KID-360: sourcing.wing_catalog operations + manual ingest)', () => {
  let prisma: PrismaClient;
  let controller: SourcingWorkspaceController;
  let wing: ReturnType<typeof sourcingExtensionOperations>;
  let accountId: string;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const service = new SourcingWingCatalogIngestService(
      new SourcingBrowserSourceAttemptRepositoryAdapter(prisma as never,
        new SourceFailureAlerts(prisma as never), unusedSalesProductDraftPort),
      new SourcingRecommendationSourceRepositoryAdapter(prisma as never),
    );
    controller = new SourcingWorkspaceController(undefined as never, service,
      undefined as never, undefined as never);
    wing = sourcingExtensionOperations(prisma, unusedSalesProductDraftPort);
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    accountId = (await prisma.channelAccount.create({
      data: { organizationId, channel: 'coupang', name: 'Wing', externalAccountId: 'A00000001' },
    })).id;
  });

  it('selects latest complete coverage per keyword, including confirmed empty replacement', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    const read = async () => sources.listLatestCoupangObservations({ organizationId, cutoffAt: await databaseNow(), lookbackDays: 30, limit: 50 });
    await publish({ 'A Pencil': [item] });
    await expect(read()).resolves.toMatchObject({ items: [{ productId: '123' }] });

    const clayItem = { ...item, productId: '456', sourceKeyword: '클레이' };
    await publish({ '클레이': [clayItem] });
    await expect(read()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ productId: '123' }),
        expect.objectContaining({ productId: '456' }),
      ]),
    });
    await expect(controller.getWingCatalogSnapshot('A Pencil', organizationId))
      .resolves.toMatchObject({ items: [{ productId: '123' }] });

    // 계획한 키워드를 다 채우지 못한 실행은 거절돼 failed로 끝나고 아무것도 쓰지 않는다.
    const partial = await wing.run(organizationId, 'sourcing.wing_catalog',
      { channelAccountId: accountId, keywords: ['A Pencil', '클레이'], maxPages: 2, purpose: 'catalog_search' },
      [{ chunkKind: 'wing_search_page', payload: [{ keyword: 'A Pencil', maxPages: 2, purpose: 'catalog_search',
        items: [{ ...item, productId: 'staged' }] }] }]);
    expect(partial).toMatchObject({ refusedWith: 'SOURCING_COLLECTION_INCOMPLETE', operation: { status: 'failed' } });
    await expect(read()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ productId: '123' }),
        expect.objectContaining({ productId: '456' }),
      ]),
    });
    await publish({ 'A Pencil': [] });
    await expect(read()).resolves.toMatchObject({ items: [{ productId: '456' }] });
    // 원장은 finish 트랜잭션에서만 쓰인다(KID-360): 거절된 실행의 상품은 관측으로도 남지 않는다.
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(2);
  });

  it('excludes v1 evidence from both current Wing readers', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    await publish({ 'A Pencil': [item] });
    await prisma.sourcingEvidenceObservation.updateMany({ data: { schemaVersion: 'coupang-wing-catalog/v1' } });
    await expect(controller.getWingCatalogSnapshot('A Pencil', organizationId)).resolves.toMatchObject({ items: [] });
    await expect(sources.listLatestCoupangObservations({ organizationId, cutoffAt: await databaseNow(), lookbackDays: 30, limit: 50 }))
      .resolves.toEqual({ items: [], rejectedCount: 1 });
  });

  it('keeps typed Wing facts authoritative when the retained raw evidence payload changes', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    await publish({ 'A Pencil': [item] });
    await prisma.sourcingEvidenceObservation.updateMany({ data: { payload: {
      productId: item.productId, productName: item.productName,
      itemId: null, vendorItemId: null, salePriceKrw: 1000, ratingAverage: null,
      ratingCount: null, viewsLast28d: null, salesLast28d: null,
      sourceKeyword: item.sourceKeyword, capturedAt: item.capturedAt,
    } } });
    await expect(sources.listWingCatalogSnapshot({ organizationId, normalizedKeyword: 'a pencil', limit: 50 }))
      .resolves.toMatchObject({ items: [{ productId: '123' }], rejectedCount: 0 });
    await expect(sources.listLatestCoupangObservations({ organizationId, cutoffAt: await databaseNow(), lookbackDays: 30, limit: 50 }))
      .resolves.toMatchObject({ items: [{ productId: '123' }], rejectedCount: 0 });
  });

  it('treats legacy positive COMPLETE Wing evidence without receipts or typed publication as unavailable', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    await publish({ 'A Pencil': [{ ...item, productId: 'prior' }] });
    const attempt = { attemptId: (await publish({ 'A Pencil': [item] })).operationId };
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(2);
    await prisma.sourcingSourcePublication.updateMany({
      where: { operationId: attempt.attemptId },
      data: { qualityReport: { snapshots: [{ keyword: 'a pencil' }] } },
    });
    await prisma.sourcingWingCatalogProductSnapshot.deleteMany({
      where: { organizationId, operationId: attempt.attemptId },
    });

    await expect(sources.listWingCatalogSnapshot({ organizationId, normalizedKeyword: 'a pencil', limit: 50 }))
      .resolves.toEqual({ generatedAt: null, items: [], rejectedCount: 1 });
    await expect(sources.listLatestCoupangObservations({ organizationId, cutoffAt: await databaseNow(), lookbackDays: 30, limit: 50 }))
      .resolves.toEqual({ items: [], rejectedCount: 1 });
  });

  it('excludes an entire Wing publication when its typed fact count is partial', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    const attempt = { attemptId: (await publish({ 'A Pencil': [item] })).operationId };
    await prisma.sourcingSourcePublication.updateMany({
      where: { operationId: attempt.attemptId },
      data: {
        acceptedCount: 2,
        qualityReport: {
          snapshots: [{ keyword: 'a pencil' }],
          wingReceipts: [{ count: 2, duplicateCount: 0 }],
        },
      },
    });

    await expect(sources.listLatestCoupangObservations({
      organizationId,
      cutoffAt: await databaseNow(),
      lookbackDays: 30,
      limit: 50,
    })).resolves.toEqual({ items: [], rejectedCount: 2 });

    await prisma.sourcingSourcePublication.updateMany({
      where: { operationId: attempt.attemptId },
      data: {
        qualityReport: {
          snapshots: [{ keyword: 'a pencil' }],
          wingReceipts: [{ count: 2, duplicateCount: 1 }],
        },
      },
    });
    await expect(sources.listLatestCoupangObservations({
      organizationId,
      cutoffAt: await databaseNow(),
      lookbackDays: 30,
      limit: 50,
    })).resolves.toMatchObject({ items: [{ productId: '123' }], rejectedCount: 0 });
  });

  it('publishes one accepted fact for duplicate discoveries to both public readers', async () => {
    const recommendationSources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    const imageTargets = new Sourcing1688SearchResultRepositoryAdapter(prisma as never);
    const duplicateItem = { ...item, imagePath: 'catalog/duplicate.jpg' };
    const done = await publish({ 'A Pencil': [duplicateItem, duplicateItem] });
    expect(done.result).toMatchObject({ discoveredCount: 2, acceptedCount: 1, duplicateCount: 1 });
    expect((await prisma.sourcingSourcePublication.findFirstOrThrow({ where: { operationId: done.operationId } })).qualityReport)
      .toMatchObject({ wingReceipts: [{ count: 2, acceptedCount: 1, duplicateCount: 1 }] });

    await expect(recommendationSources.listLatestCoupangObservations({
      organizationId,
      cutoffAt: await databaseNow(),
      lookbackDays: 30,
      limit: 50,
    })).resolves.toMatchObject({ items: [{ productId: '123' }], rejectedCount: 0 });
    await expect(imageTargets.resolveImageTargets({
      organizationId,
      targetIds: ['123::'],
    })).resolves.toMatchObject({
      targets: [{ targetId: '123::' }],
      missingTargetIds: [],
    });
  });

  it('preserves a legacy owner-confirmed zero-count Wing publication as measured empty', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    const attempt = { attemptId: (await publish({ 'A Pencil': [] })).operationId };
    await prisma.sourcingSourcePublication.updateMany({
      where: { operationId: attempt.attemptId },
      data: { qualityReport: { snapshots: [{ keyword: 'a pencil' }] } },
    });

    await expect(sources.listWingCatalogSnapshot({
      organizationId,
      normalizedKeyword: 'a pencil',
      limit: 50,
    })).resolves.toEqual({ generatedAt: expect.any(Date), items: [], rejectedCount: 0 });
  });

  it('preserves the separate bounded manual-ingestion contract on the same owner path without implicit recommendation work', async () => {
    const command = { idempotencyKey: randomUUID(), items: Array.from({ length: 13 }, (_, index) => ({
      productId: String(index), productName: '연필', sourceKeyword: `manual ${index}`,
      capturedAt: '2026-09-05T00:00:00.000Z',
    })) };
    const first = await controller.ingestCoupangObservations(command as never, organizationId, user as never);
    expect(first.state).toBe('COMPLETE');
    expect(first).not.toHaveProperty('attemptToken');
    expect(await controller.ingestCoupangObservations(command as never, organizationId, user as never)).toEqual(first);
    await expect(controller.getWingCatalogSnapshot('manual 12', organizationId)).resolves.toMatchObject({
      items: [{ productId: '12', productName: '연필', itemName: null }],
    });
    expect(await prisma.sourcingEvidenceIngestionRun.count()).toBe(1);
    expect(await prisma.sourcingRecommendationRun.count()).toBe(0);
  });

  it('deduplicates identical manual observations before publishing exact reader coverage', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    const manualItem = {
      productId: 'manual-duplicate',
      productName: '중복 수동 관측',
      sourceKeyword: '수동 중복',
      capturedAt: '2026-09-05T00:00:00.000Z',
    };
    const terminal = await controller.ingestCoupangObservations({
      idempotencyKey: randomUUID(),
      items: [manualItem, manualItem],
    } as never, organizationId, user as never);

    expect(terminal).toMatchObject({
      state: 'COMPLETE',
      acceptedCount: 1,
    });
    await expect(controller.getWingCatalogSnapshot('수동 중복', organizationId))
      .resolves.toMatchObject({ items: [{ productId: 'manual-duplicate' }], rejectedCount: 0 });
    await expect(sources.listLatestCoupangObservations({
      organizationId,
      cutoffAt: await databaseNow(),
      lookbackDays: 30,
      limit: 50,
    })).resolves.toMatchObject({
      items: [{ productId: 'manual-duplicate' }],
      rejectedCount: 0,
    });
    const run = await prisma.sourcingEvidenceIngestionRun.findFirstOrThrow({
      where: { organizationId, sourceKey: 'coupang.wing_catalog' },
    });
    expect(run).toMatchObject({ discoveredCount: 1, acceptedCount: 1, duplicateCount: 0 });
    expect(run.qualityReport).toMatchObject({
      wingReceipts: [{ count: 1, acceptedCount: 1, duplicateCount: 0 }],
    });
  });

  /**
   * 발행 시각은 DB 시계로 찍힌다. 호스트 시계(`new Date()`)는 컨테이너보다 늦을 수 있어 방금 발행한 것을
   * 잘라 버린다(전체 실행에서 간헐 실패). 읽기의 기준 시각도 같은 DB 시계에서 읽는다.
   */
  async function databaseNow(): Promise<Date> {
    const [row] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    return row!.now;
  }
  /** 끝난 Wing 검색 소싱 실행 하나. 키워드마다 청크 한 장(빈 결과도 한 장). */
  async function publish(pages: Record<string, typeof item[]>) {
    const done = await wing.run(organizationId, 'sourcing.wing_catalog',
      { channelAccountId: accountId, keywords: Object.keys(pages), maxPages: 2, purpose: 'catalog_search' },
      Object.entries(pages).map(([keyword, items]) => ({
        chunkKind: 'wing_search_page', payload: [{ keyword, maxPages: 2, purpose: 'catalog_search', items }],
      })));
    return { operationId: done.operation.id, status: done.operation.status, refusedWith: done.refusedWith, result: done.operation.result };
  }
});
