import { channelFactTestPorts, channelFactTestProviders } from '../../../test-helpers/channel-fact-ports';
import { ProductTransactionalReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ProductSourceReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-source-read.repository.adapter';
import { randomUUID } from 'node:crypto';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD, PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH } from '@kiditem/shared/product-abc';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { snapshotPartialOf } from '../../../test-helpers/dashboard-basis-assertions';
import { ProfitabilityAdImportRepositoryAdapter } from '../../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { MasterProductProfitabilityReadService } from '../../../finance/application/service/master-product-profitability-read.service';
import { SellpiaProfitabilitySourceService } from '../../sellpia-product-sales/sellpia-profitability-source.service';
import { publishSellpiaProfitability, seedSellpiaProfitabilityOperation } from '../../../test-helpers/__tests__/sellpia-profitability-operation';
import { MASTER_PRODUCT_PROFITABILITY_READ_PORT } from '../../../finance/application/port/in/master-product-profitability-read.port';
import { MasterProductAbcRepositoryAdapter } from '../../../products/adapter/out/persistence/master-product-abc.repository.adapter';
import { MASTER_PRODUCT_ABC_REPOSITORY_PORT } from '../../../products/application/port/out/persistence/master-product-abc.repository.port';
import { PRODUCT_ABC_READ_PORT } from '../../../products/application/port/in/product-abc-read.port';
import { ProductAbcReadUseCase } from '../../../products/application/service/product-abc-read.usecase';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { DashboardInventoryService } from '../../application/service/dashboard/dashboard-inventory.service';
import { buildDashboardContext } from '../../domain/dashboard/context';
import { businessDateText } from '../../domain/dashboard/period/dashboard-period';
import { shiftBusinessDateKey } from '../../../common/kst';
import { DashboardInventoryRepositoryAdapter } from '../../adapter/out/repository/dashboard/dashboard-inventory.repository.adapter';
import { PRODUCT_TRANSACTIONAL_READ_PORT } from '../../../products/application/port/in/product-transactional-read.port';
import { PRODUCT_SOURCE_READ_PORT } from '../../../products/application/port/in/product-source-read.port';
import { PrismaService } from '../../../prisma/prisma.service';
import { DASHBOARD_INVENTORY_REPOSITORY_PORT } from '../../application/port/out/repository/dashboard/dashboard-inventory.repository.port';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
  seedCompletedAdSweepRun,
  seedCompletedInventorySnapshot,
  seedCompletedOrderCoverageRun,
} from '../../../test-helpers/finance-seeds';
import type { PrismaClient } from '@prisma/client';

describe('DashboardInventoryService.getSummary (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardInventoryService;
  let sellpiaSource: SellpiaProfitabilitySourceService;
  let advertisingSource: ProfitabilityAdImportRepositoryAdapter;
  let repository: DashboardInventoryRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const inventoryTransactionalRead = new ProductTransactionalReadRepositoryAdapter();
    const alerts = new SourceFailureAlerts(prisma as never);
    sellpiaSource = new SellpiaProfitabilitySourceService(prisma as never);
    advertisingSource = new ProfitabilityAdImportRepositoryAdapter(channelFactTestPorts(prisma as never).accounts, channelFactTestPorts(prisma as never).recipes, channelFactTestPorts(prisma as never).listings, prisma as never, alerts);
    const evidence = new MasterProductProfitabilityReadService(
      sellpiaSource,
      advertisingSource,
      prisma as never,
      new ProductTransactionalReadRepositoryAdapter());
    const m = await Test.createTestingModule({
      providers: [
        ...channelFactTestProviders,
        DashboardInventoryService,
        { provide: MASTER_PRODUCT_PROFITABILITY_READ_PORT, useValue: evidence },
        MasterProductAbcRepositoryAdapter,
        { provide: MASTER_PRODUCT_ABC_REPOSITORY_PORT, useExisting: MasterProductAbcRepositoryAdapter },
        ProductAbcReadUseCase,
        { provide: PRODUCT_ABC_READ_PORT, useExisting: ProductAbcReadUseCase },
        DashboardInventoryRepositoryAdapter,
        ProductSourceReadRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
        // The panel's rows come from the alerts module, against the same Postgres.
        { provide: SourceFailureAlerts, useValue: alerts },
        // The real advertising owner, against the same Postgres. Whether the
        // account published anything for the window is a fact only rows can
        // hold, so a stub here would decide the very thing under test.
        { provide: DASHBOARD_INVENTORY_REPOSITORY_PORT, useExisting: DashboardInventoryRepositoryAdapter },
        { provide: PRODUCT_TRANSACTIONAL_READ_PORT, useValue: inventoryTransactionalRead },
        { provide: PRODUCT_SOURCE_READ_PORT, useExisting: ProductSourceReadRepositoryAdapter },
      ],
    }).compile();
    service = m.get(DashboardInventoryService);
    repository = m.get(DashboardInventoryRepositoryAdapter);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * The anchor every warning case reads at. The per-listing warnings evaluate
   * the anchor's month clipped to closed KST days (ADR-0001), so an anchor on
   * the wall clock would move that window under the fixtures and, on the 1st,
   * leave no closed day to seed. 12:00 KST on 20 September 2026 closes 1–19
   * September.
   */
  const WARNING_ANCHOR = new Date('2026-09-20T03:00:00.000Z');

  function warningContext(): ReturnType<typeof buildDashboardContext> {
    return buildDashboardContext(undefined, undefined, undefined, WARNING_ANCHOR);
  }

  /** The last KST business date the anchor closed inside its month; `null` on the 1st. */
  function lastClosedDate(ctx: ReturnType<typeof buildDashboardContext>): string | null {
    const today = businessDateText(ctx.anchor);
    return today.endsWith('-01') ? null : shiftBusinessDateKey(today, -1);
  }

  /**
   * Publishes the inventory snapshot, declares the Orders collection covered
   * the anchor's month from the 1st through `ordersThrough`, and reads the
   * summary. By default the collection reaches the last closed day, the most a
   * real one can; `null` declares no collection. Per-listing profit reads only
   * orders a completed collection published.
   */
  async function readSummary(
    ctx: ReturnType<typeof buildDashboardContext>,
    organizationId: string,
    ordersThrough: string | null = lastClosedDate(ctx),
  ) {
    await seedCompletedInventorySnapshot(prisma, organizationId);
    if (ordersThrough !== null) {
      await seedCompletedOrderCoverageRun(prisma, {
        organizationId,
        startDate: `${businessDateText(ctx.anchor).slice(0, 7)}-01`,
        endDate: ordersThrough,
      });
    }
    return service.getSummary(ctx, organizationId);
  }

  /** A `YYYY-MM-DD` business date inside the warning anchor's KST month. */
  function adDay(dayOfMonth: number): string {
    return `${businessDateText(WARNING_ANCHOR).slice(0, 7)}-${String(dayOfMonth).padStart(2, '0')}`;
  }

  /** Noon KST on a day of the warning anchor's month. */
  function saleAt(dayOfMonth: number): Date {
    return new Date(`${adDay(dayOfMonth)}T12:00:00+09:00`);
  }

  /** The 15th, a closed day of the warning anchor's month. */
  function midMonth(): Date {
    return saleAt(15);
  }

  /** The three warning counts drawn from per-listing profit. */
  const PER_LISTING_KEYS = [
    'warnings.minusProducts',
    'warnings.lowProfitProducts',
    'warnings.highAdProducts',
  ] as const;

  /** The two that read no advertising evidence at all. */
  const AD_FREE_KEYS = [
    'warnings.outOfStockSkus',
    'warnings.mappingAttentionSkus',
  ] as const;

  /**
   * A listing that sold at a loss this month: revenue 50_000 against an 80_000
   * cost, 10% commission and 5_000 shipping. It is loss-making for any ad
   * cost, so whether it reaches `minusProducts` depends only on whether its ad
   * cost is a measurement.
   */
  async function seedLossListingOnChannel(
    channel: string,
    tag: string,
    soldAt: Date = midMonth(),
  ): Promise<string> {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: `M-T-${tag}`, name: `Master ${tag}`,
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: `SKU-T-${tag}`, costPrice: 80_000,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel, externalId: `EXT-T-${tag}`,
      optionId, externalOptionId: `VI-T-${tag}`,
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: `INV-T-${tag}-1`,
      orderedAt: soldAt.toISOString(),
      shippingPrice: 5_000,
      lineItems: [{ quantity: 1, totalPrice: 50_000, optionId, listingOptionId }],
    });
    return listingId;
  }

  /**
   * The campaign sweep declared it swept the warning anchor's month through its
   * last closed day, or `short` days before it; a sweep cannot reach a day that
   * has not closed. Every date in that window is measured, with the listing
   * rows' sums or a measured zero, so whether the window is fully covered is
   * what decides every listing's ad cost at once.
   */
  let sweepGeneration = 0;
  async function coverMonth(short = 0): Promise<void> {
    await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: ++sweepGeneration,
      window: {
        startDate: adDay(1),
        endDate: shiftBusinessDateKey(lastClosedDate(warningContext())!, -short),
      },
    });
  }

  /**
   * Seed a basic 2-operating-product + 1-alert layout for TEST,
   * and 5-operating-product + 3-alert for OTHER (no order data).
   * Used by T1/T2/T3 (IDOR cases that don't touch warnings).
   */
  async function seedBaseStructure() {
    const masterT1 = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-1', name: 'Master T1',
    });
    const masterT2 = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-2', name: 'Master T2',
    });
    await prisma.alert.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID, type: 'source_failure',
        title: 'Test alert', message: 'test',
        targetType: 'master', targetId: masterT1.id,
      },
    });

    const otherGrades: Array<{ masterProductId: string; abcGrade: 'A' | 'B' }> = [];
    for (let i = 1; i <= 5; i++) {
      const product = await setupMaster(prisma, {
        organizationId: OTHER_ORGANIZATION_ID, code: `M-O-${i}`, name: `Master O${i}`,
      });
      otherGrades.push({ masterProductId: product.id, abcGrade: i <= 3 ? 'A' : 'B' });
    }
    for (let i = 1; i <= 3; i++) {
      await prisma.alert.create({
        data: {
          organizationId: OTHER_ORGANIZATION_ID, type: 'source_failure',
          title: `OTHER alert ${i}`, message: 'other',
          targetType: 'master', targetId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        },
      });
    }
    await seedPublishedGrades(TEST_ORGANIZATION_ID, [
      { masterProductId: masterT1.id, abcGrade: 'A' },
      { masterProductId: masterT2.id, abcGrade: 'B' },
    ]);
    await seedPublishedGrades(OTHER_ORGANIZATION_ID, otherGrades);
  }

  it('T1: TEST sees only TEST listings, alerts, and grades', async () => {
    await seedBaseStructure();
    const ctx = buildDashboardContext();
    const result = await readSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.totalProducts).toBe(2);
    expect(result.channelLinkedProducts).toBe(0);
    expect(result.channelUnlinkedProducts).toBe(2);
    expect(result.gradeCount.A).toBe(1);
    expect(result.gradeCount.B).toBe(1);
    expect(result.gradeCount.C).toBe(0);
    expect(result.classifiedProductCount).toBe(2);
    expect(result.unclassifiedProductCount).toBe(0);
    expect(result.alerts.length).toBe(1);
    expect(result.alerts[0].title).toBe('Test alert');
    expect(result.alerts[0]).not.toHaveProperty('severity');
  });

  it('counts current Products rows separately from channel-linked products', async () => {
    const masterLinked = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-LINKED', name: 'Linked Master',
    });
    const optionLinked = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId: masterLinked.id, sku: 'SKU-T-LINKED',
    });
    await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: masterLinked.id,
      channel: 'coupang',
      externalId: 'EXT-T-LINKED',
      optionId: optionLinked.id,
      externalOptionId: 'VI-T-LINKED',
    });
    const inventoryOnly = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-ONLY', name: 'Inventory Only Master',
    });
    const inactiveMaster = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-INACTIVE', name: 'Inactive Master',
    });
    const inactiveOption = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId: inactiveMaster.id, sku: 'SKU-T-INACTIVE',
    });
    await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: inactiveMaster.id,
      channel: 'coupang',
      externalId: 'EXT-T-INACTIVE',
      optionId: inactiveOption.id,
      externalOptionId: 'VI-T-INACTIVE',
    });
    const otherMaster = await setupMaster(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, code: 'M-O-LINKED', name: 'Other Linked Master',
    });
    const otherOption = await setupProductOption(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: otherMaster.id, sku: 'SKU-O-LINKED',
    });
    await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      masterId: otherMaster.id,
      channel: 'coupang',
      externalId: 'EXT-O-LINKED',
      optionId: otherOption.id,
      externalOptionId: 'VI-O-LINKED',
    });
    await seedPublishedGrades(TEST_ORGANIZATION_ID, [
      { masterProductId: masterLinked.id, abcGrade: 'A' },
      { masterProductId: inventoryOnly.id, abcGrade: 'B' },
    ]);

    const result = await readSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

    expect(result.totalProducts).toBe(3);
    expect(result.channelLinkedProducts).toBe(2);
    expect(result.channelUnlinkedProducts).toBe(1);
    expect(result.gradeCount.A).toBe(1);
    expect(result.gradeCount.B).toBe(1);
  });

  it('keeps CONFIG linkage measured when inventory is absent or stock is zero', async () => {
    const master = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-CONFIG-LINK',
      name: 'Config linked master',
    });
    const inventory = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      sku: 'SKU-T-CONFIG-LINK',
    });
    await prisma.masterProduct.update({
      where: { id: inventory.id },
      data: { currentStock: 0 },
    });
    await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      channel: 'coupang',
      externalId: 'EXT-T-CONFIG-LINK',
      optionId: inventory.id,
      externalOptionId: 'VI-T-CONFIG-LINK',
    });
    // The recipe is the CONFIG linkage. Inventory evidence and current stock
    // affect availability metrics, but do not remove a valid product link.

    const withoutInventory = await service.getSummary(
      buildDashboardContext(),
      TEST_ORGANIZATION_ID,
    );
    expect(withoutInventory).toMatchObject({
      channelLinkedProducts: 1,
      channelUnlinkedProducts: 0,
      warnings: { outOfStockSkus: null },
    });
    expect(withoutInventory.metricBasis?.channelLinkedProducts).toMatchObject({
      measured: true,
      sources: ['products', 'channel_listings'],
    });

    await seedCompletedInventorySnapshot(prisma, TEST_ORGANIZATION_ID);
    const withZeroStock = await service.getSummary(
      buildDashboardContext(),
      TEST_ORGANIZATION_ID,
    );
    expect(withZeroStock).toMatchObject({
      channelLinkedProducts: 1,
      channelUnlinkedProducts: 0,
      warnings: { outOfStockSkus: 1 },
    });
  });

  it('uses source-evidenced sale status for channel-linked products without a traffic gate', async () => {
    const master = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-SALE-STATUS',
      name: 'Sale Status Master',
    });
    const inventory = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      sku: 'SKU-T-SALE-STATUS',
    });
    const listing = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      channel: 'coupang',
      externalId: 'EXT-T-SALE-STATUS',
      optionId: inventory.id,
      externalOptionId: 'VI-T-SALE-STATUS',
    });
    const status = await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.listingId,
        channel: 'coupang',
        externalId: 'EXT-T-SALE-STATUS',
        businessDate: new Date('2026-09-01T00:00:00.000Z'),
        saleStatus: '판매중지',
        trafficObservedAt: null,
      },
    });

    await expect(readSummary(
      buildDashboardContext(),
      TEST_ORGANIZATION_ID,
    )).resolves.toMatchObject({ channelLinkedProducts: 0 });

    await prisma.channelListingDailySnapshot.update({
      where: { id: status.id },
      data: { saleStatus: '판매중' },
    });
    await expect(readSummary(
      buildDashboardContext(),
      TEST_ORGANIZATION_ID,
    )).resolves.toMatchObject({ channelLinkedProducts: 1 });
  });

  it('keeps mapping configuration and latest sale status on one repeatable-read snapshot', async () => {
    const publisher = makeTestPrisma();
    const observer = makeTestPrisma();
    await Promise.all([publisher.$connect(), observer.$connect()]);
    const master = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-CONCURRENT-STATUS',
      name: 'Concurrent Status Master',
    });
    const inventory = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      sku: 'SKU-T-CONCURRENT-STATUS',
    });
    const listing = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      channel: 'coupang',
      externalId: 'EXT-T-CONCURRENT-STATUS',
      optionId: inventory.id,
      externalOptionId: 'VI-T-CONCURRENT-STATUS',
    });
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.listingId,
        channel: 'coupang',
        externalId: 'EXT-T-CONCURRENT-STATUS',
        businessDate: new Date('2026-09-01T00:00:00.000Z'),
        saleStatus: '판매중',
      },
    });

    const publicationLocked = deferred<void>();
    const publish = deferred<void>();
    const publication = publisher.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'LOCK TABLE channel_listing_daily_snapshots IN ACCESS EXCLUSIVE MODE',
      );
      publicationLocked.resolve();
      await publish.promise;
      await tx.channelListingDailySnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.listingId,
          channel: 'coupang',
          externalId: 'EXT-T-CONCURRENT-STATUS',
          businessDate: new Date('2026-09-02T00:00:00.000Z'),
          saleStatus: '판매중지',
        },
      });
    }, { timeout: 15_000 });

    try {
      await publicationLocked.promise;
      const reading = repository.readInventoryAvailabilityFacts(TEST_ORGANIZATION_ID);
      await waitForBlockedListingStateRead(observer);
      publish.resolve();
      await publication;

      await expect(reading).resolves.toMatchObject({ linkedMasterProductCount: 1 });
    } finally {
      publish.resolve();
      await publication.catch(() => undefined);
      await Promise.all([publisher.$disconnect(), observer.$disconnect()]);
    }
  }, 20_000);

  it('T2: OTHER sees only OTHER — TEST does not leak', async () => {
    await seedBaseStructure();
    const ctx = buildDashboardContext();
    const result = await readSummary(ctx, OTHER_ORGANIZATION_ID);

    expect(result.totalProducts).toBe(5);
    expect(result.channelLinkedProducts).toBe(0);
    expect(result.channelUnlinkedProducts).toBe(5);
    expect(result.gradeCount.A).toBe(3);
    expect(result.gradeCount.B).toBe(2);
    expect(result.alerts.length).toBe(3);
  });

  it('T3: fresh organization → zero-valued summary', async () => {
    const ctx = buildDashboardContext();
    const result = await readSummary(ctx, TEST_ORGANIZATION_ID);
    expect(result.totalProducts).toBe(0);
    expect(result.alerts.length).toBe(0);
    expect(result.warnings.minusProducts).toBe(0);
    expect(result.warnings.lowProfitProducts).toBe(0);
    expect(result.warnings.highAdProducts).toBe(0);
    expect(result.warnings.outOfStockSkus).toBe(0);
    expect(result.warnings.mappingAttentionSkus).toBe(0);
    expect(result.gradeCount).toEqual({ A: 0, B: 0, C: 0 });
    expect(result.classifiedProductCount).toBe(0);
    expect(result.unclassifiedProductCount).toBe(0);
  });

  it('keeps active products without an automatic grade unclassified', async () => {
    const classified = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-CLASSIFIED',
      name: 'Classified Master',
    });
    await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-UNCLASSIFIED',
      name: 'Unclassified Master',
    });
    await seedPublishedGrades(TEST_ORGANIZATION_ID, [
      { masterProductId: classified.id, abcGrade: 'A' },
    ]);

    const result = await readSummary(
      buildDashboardContext(),
      TEST_ORGANIZATION_ID,
    );

    expect(result.gradeCount).toEqual({ A: 1, B: 0, C: 0 });
    expect(result.classifiedProductCount).toBe(1);
    expect(result.unclassifiedProductCount).toBe(1);
  });

  it('counts low reviews from the official A publication only', async () => {
    const officialA = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-OFFICIAL-A',
      name: 'Official A',
    });
    const staleCacheA = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-STALE-A',
      name: 'Stale cache A',
    });
    const officialOption = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: officialA.id,
      sku: 'SKU-T-OFFICIAL-A',
    });
    const staleOption = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: staleCacheA.id,
      sku: 'SKU-T-STALE-A',
    });
    const officialListing = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: officialA.id,
      channel: 'coupang',
      externalId: 'EXT-T-OFFICIAL-A',
      optionId: officialOption.id,
      externalOptionId: 'VI-T-OFFICIAL-A',
    });
    const staleListing = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: staleCacheA.id,
      channel: 'coupang',
      externalId: 'EXT-T-STALE-A',
      optionId: staleOption.id,
      externalOptionId: 'VI-T-STALE-A',
    });
    await seedPublishedGrades(TEST_ORGANIZATION_ID, [
      { masterProductId: officialA.id, abcGrade: 'A' },
      { masterProductId: staleCacheA.id, abcGrade: 'B' },
    ]);
    const reviewRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_reviews',
        status: 'completed',
        importedAt: new Date('2026-09-01T01:00:00.000Z'),
      },
    });
    await prisma.review.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: reviewRun.id,
          listingId: officialListing.listingId,
          externalReviewId: 'OFFICIAL-A-LOW-1',
          rating: 5,
        },
        ...Array.from({ length: 15 }, (_, index) => ({
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: reviewRun.id,
          listingId: staleListing.listingId,
          externalReviewId: `STALE-A-HIGH-${index}`,
          rating: 5,
        })),
      ],
    });

    const result = await readSummary(
      buildDashboardContext(),
      TEST_ORGANIZATION_ID,
    );

    expect(result.gradeCount).toEqual({ A: 1, B: 1, C: 0 });
    expect(result.warnings.lowReviewProducts).toBe(1);
  });

  it('counts only organization-scoped automatic MasterProduct grade history', async () => {
    const ownMaster = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-HISTORY',
      name: 'History Master',
    });
    const foreignMaster = await setupMaster(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      code: 'M-O-HISTORY',
      name: 'Foreign History Master',
    });
    await Promise.all([
      seedPublishedGrades(TEST_ORGANIZATION_ID, [
        { masterProductId: ownMaster.id, abcGrade: 'A' },
      ]),
      seedPublishedGrades(OTHER_ORGANIZATION_ID, [
        { masterProductId: foreignMaster.id, abcGrade: 'C' },
      ]),
    ]);
    const [ownState, foreignState] = await Promise.all([
      prisma.masterProductAbcFormulaState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
        select: { activeFormulaVersionId: true },
      }),
      prisma.masterProductAbcFormulaState.findUniqueOrThrow({
        where: { organizationId: OTHER_ORGANIZATION_ID },
        select: { activeFormulaVersionId: true },
      }),
    ]);
    await prisma.masterProductAbcGradeHistory.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId: ownMaster.id,
          formulaVersionId: ownState.activeFormulaVersionId!,
          formulaRevision: 1, publicationRevision: 1,
          oldGrade: null,
          newGrade: 'A',
          economicScore: 80,
          sourceCutoffDate: new Date('2026-07-31T00:00:00.000Z'),
          reason: 'automatic_profitability_evaluation',
        },
        {
          organizationId: OTHER_ORGANIZATION_ID,
          masterProductId: foreignMaster.id,
          formulaVersionId: foreignState.activeFormulaVersionId!,
          formulaRevision: 1, publicationRevision: 1,
          oldGrade: 'A',
          newGrade: 'C',
          economicScore: 20,
          sourceCutoffDate: new Date('2026-07-31T00:00:00.000Z'),
          reason: 'automatic_profitability_evaluation',
        },
      ],
    });

    const result = await readSummary(
      buildDashboardContext(),
      TEST_ORGANIZATION_ID,
    );

    expect(result.gradeChanges).toMatchObject({ upgraded: 1, downgraded: 0, total: 1 });
  });

  async function createFormula(organizationId: string) {
    return prisma.masterProductAbcFormulaVersion.create({
      data: {
        organizationId,
        formulaKey: 'PRODUCT_ABC_ABSOLUTE',
        version: 1,
        formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
        formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
      },
    });
  }

  async function seedPublishedGrades(
    organizationId: string,
    grades: readonly { masterProductId: string; abcGrade: 'A' | 'B' | 'C' }[],
  ): Promise<void> {
    const cutoff = new Date('2026-08-31T00:00:00.000Z');
    const calculatedAt = new Date('2026-09-01T00:00:00.000Z');
    const formula = await createFormula(organizationId);
    const state = await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      select: { mappingGeneration: true },
    });
    const mappingGeneration = state?.mappingGeneration ?? 0n;
    // 실패로 끝난 셀피아 상품 손익 실행 — 픽스처가 그 id를 옛 공식 발행으로 붙든다(KID-361 J3).
    const sellpiaOperation = await seedSellpiaProfitabilityOperation(prisma, { organizationId, status: 'failed' });
    const sellpia = { attemptId: sellpiaOperation.id };
    const advertising = await advertisingSource.beginAttempt({
      organizationId,
      idempotencyKey: randomUUID(),
    });
    await advertisingSource.failAttempt({
      organizationId,
      attemptId: advertising.attemptId,
      attemptToken: advertising.attemptToken,
      code: 'COLLECTION_FAILED',
      message: 'Historical publication retained by fixture',
    });
    await prisma.alert.updateMany({
      where: { organizationId, sourceType: { not: null } },
      data: { readAt: new Date() },
    });
    await prisma.$transaction(async (tx) => {
      await tx.masterProductAbcFormulaState.upsert({
        where: { organizationId },
        create: {
          organizationId,
          activeFormulaVersionId: formula.id,
          formulaRevision: 1,
          publicationRevision: 1,
          officialCutoffDate: cutoff,
          publishedAt: calculatedAt,
          publishedSellpiaOperationId: sellpia.attemptId,
          publishedAdvertisingSourceImportRunId: advertising.attemptId,
          publishedMappingGeneration: mappingGeneration,
          mappingGeneration,
        },
        update: {
          activeFormulaVersionId: formula.id,
          formulaRevision: 1,
          publicationRevision: 1,
          officialCutoffDate: cutoff,
          publishedAt: calculatedAt,
          publishedSellpiaOperationId: sellpia.attemptId,
          publishedAdvertisingSourceImportRunId: advertising.attemptId,
          publishedMappingGeneration: mappingGeneration,
        },
      });
      await tx.masterProductAbcEvaluation.createMany({ data: grades.map((grade) => ({
        organizationId,
        masterProductId: grade.masterProductId,
        formulaVersionId: formula.id,
        abcGrade: grade.abcGrade,
        weightedRevenue: 100,
        weightedOrderTimeSupplyCost: 20,
        weightedAdvertisingSpend: 10,
        weightedOperatingProfit: 70,
        operatingProfitVelocity30: 70,
        operatingMargin: 0.7,
        lossPersistence: 0,
        profitScore: 70,
        marginScore: 100,
        consistencyScore: 100,
        economicScore: grade.abcGrade === 'A' ? 85 : grade.abcGrade === 'B' ? 70 : 20,
        validObservationDays: 30,
        formulaRevision: 1,
        publicationRevision: 1,
        gradeBasisCutoffDate: cutoff,
        sellpiaOperationId: sellpia.attemptId,
        advertisingSourceImportRunId: advertising.attemptId,
        sellpiaGeneration: 1n,
        advertisingGeneration: 1n,
        mappingGeneration,
        calculatedAt,
      })) });
    });
  }

  it('T4: minusProduct — seeded loss order surfaces in warnings.minusProducts', async () => {
    // Loss order: revenue 50_000, costPrice 80_000, shipping 5_000; a Rocket
    // order carries no commission. netProfit = 50_000 - 80_000 - 5_000 = -35_000 → minus
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-LOSS', name: 'Loss Master',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: 'SKU-T-LOSS', costPrice: 80_000,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T-LOSS',
      optionId, externalOptionId: 'VI-T-LOSS',
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'INV-T-LOSS-1',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 5_000,
      lineItems: [{ quantity: 1, totalPrice: 50_000, optionId, listingOptionId }],
    });
    // The listing is loss-making at any ad cost, but it only reaches the count
    // once its ad cost is measured: the sweep declared it measured the month
    // and the listing carries a zero row on the order's day.
    const lossDay = midMonth().toISOString().slice(0, 10);
    await coverMonth();
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId, date: lossDay, spend: 0,
    });

    const ctx = warningContext();
    const result = await readSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.warnings.minusProducts).toBe(1);
    expect(result.warnings.lowProfitProducts).toBe(0);
    expect(result.warnings.highAdProducts).toBe(0);
  });

  it('T5: 3 warnings — minus + lowProfit + highAd seeded on 3 listings', async () => {
    // Listing A: minus (cost > revenue)
    const a = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-A', name: 'A' });
    const aOpt = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: a.id, sku: 'SKU-T-A', costPrice: 80_000});
    const aList = await setupChannelListing(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: a.id, channel: 'coupang', externalId: 'EXT-T-A', optionId: aOpt.id, externalOptionId: 'VI-T-A' });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INV-T-A-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 50_000, optionId: aOpt.id, listingOptionId: aList.listingOptionId }],
    });

    // Listing B: lowProfit (profitRate 2%). A Rocket order carries no commission:
    //   netProfit = 100_000 - 98_000 - 0 shipping - 0 ad = 2_000 → 2.0% (lowProfit ✓, rate <= 3)
    const b = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-B', name: 'B' });
    const bOpt = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: b.id, sku: 'SKU-T-B', costPrice: 98_000});
    const bList = await setupChannelListing(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: b.id, channel: 'coupang', externalId: 'EXT-T-B', optionId: bOpt.id, externalOptionId: 'VI-T-B' });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INV-T-B-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 100_000, optionId: bOpt.id, listingOptionId: bList.listingOptionId }],
    });

    // Listing C: highAd (revenue>0, adCost > 15% of revenue)
    // revenue=100_000, adCost=20_000 → adRate=20% (>15)
    const c = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-C', name: 'C' });
    const cOpt = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: c.id, sku: 'SKU-T-C', costPrice: 0});
    const cList = await setupChannelListing(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: c.id, channel: 'coupang', externalId: 'EXT-T-C', optionId: cOpt.id, externalOptionId: 'VI-T-C' });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INV-T-C-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 100_000, optionId: cOpt.id, listingOptionId: cList.listingOptionId }],
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId: cList.listingId,
      date: midMonth().toISOString().slice(0, 10), spend: 20_000,
    });
    // The sweep measured every closed day of the month, so listings A and B —
    // which carry no row — are genuinely unadvertised.
    await coverMonth();

    const ctx = warningContext();
    const result = await readSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.warnings.minusProducts).toBe(1);
    expect(result.warnings.lowProfitProducts).toBe(1);
    expect(result.warnings.highAdProducts).toBe(1);
    // Real seeded counts must arrive with a basis that lets the card display
    // them. `unavailable` is the one status that blanks a warning card.
    // The per-listing counts are as-of their window's last day, the anchor's
    // last closed day, and name every ledger they read: the listings sell on
    // a Coupang account, so the ad sweep stands behind them beside orders.
    for (const key of PER_LISTING_KEYS) {
      expect(result.metricBasis?.[key], key).toMatchObject({
        kind: 'snapshot',
        measured: true,
        asOf: lastClosedDate(ctx),
        requiredAsOf: lastClosedDate(ctx),
        sources: ['orders', 'channel_listings', 'coupang_ads'],
      });
    }
    // Stock and mapping are current-state reads, needed as-of the read's day.
    // The stock count is as-of its snapshot's own verification; mapping is
    // as-of the read.
    for (const key of AD_FREE_KEYS) {
      expect(result.metricBasis?.[key], key).toMatchObject({
        kind: 'snapshot', measured: true, requiredAsOf: businessDateText(ctx.anchor),
      });
    }
    expect(result.metricBasis?.['warnings.mappingAttentionSkus']).toMatchObject({
      asOf: businessDateText(ctx.anchor),
    });
  });

  /**
   * Advertising coverage decides whether a listing's profit is a measurement,
   * and that lives in `ChannelListingDailySnapshot` rows — so these seed the
   * coverage shape in Postgres rather than choosing a metrics list. Each case
   * uses the same two loss-making listings and only moves which business dates
   * carry ad evidence.
   *
   * The window's ad calendar is every business date the source reported on for
   * *any* listing; a listing short of that calendar has a hole in its own
   * evidence and is withheld from the counts.
   */
  describe('warning counts over a partly measurable window', () => {
    const AD_DAYS = [5, 6] as const;

    const seedLossListing = (tag: string) => seedLossListingOnChannel('coupang', tag);

    /** Record ad rows for a listing on each named day of the month. */
    async function seedAdDays(listingId: string, days: readonly number[]): Promise<void> {
      for (const day of days) {
        await seedAd(prisma, {
          organizationId: TEST_ORGANIZATION_ID, listingId, date: adDay(day), spend: 1_000,
        });
      }
    }

    it('T6: withholds every listing while the sweep has measured only part of the month', async () => {
      const first = await seedLossListing('PART-A');
      const second = await seedLossListing('PART-B');
      await seedAdDays(first, AD_DAYS);
      await seedAdDays(second, [AD_DAYS[0]]);
      // Rows on two dates measure two dates; the rest of the month is unmeasured.

      const ctx = warningContext();
      const result = await readSummary(ctx, TEST_ORGANIZATION_ID);

      // Coverage is account-level: a window the sweep measured only in part
      // gives no listing a measured ad cost, whatever its own rows say.
      expect(result.warnings.minusProducts).toBe(0);
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: null,
          measured: false,
          withheldCount: 2,
        });
      }
      // Out-of-stock and mapping attention have no advertising input, so they
      // never inherit another value's incomplete population.
      for (const key of AD_FREE_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          measured: true, withheldCount: 0,
        });
      }
    });

    it('T7: a fully measured month counts every listing with no partial signal', async () => {
      const first = await seedLossListing('FULL-A');
      const second = await seedLossListing('FULL-B');
      await seedAdDays(first, AD_DAYS);
      await seedAdDays(second, [AD_DAYS[0]]);
      await coverMonth();

      const result = await readSummary(warningContext(), TEST_ORGANIZATION_ID);

      // The sweep measured every closed day; a listing without a row on a
      // measured date spent nothing that day, not an unknown amount.
      expect(result.warnings.minusProducts).toBe(2);
      for (const key of [...PER_LISTING_KEYS, ...AD_FREE_KEYS]) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          measured: true, withheldCount: 0,
        });
      }
    });
  });

  /**
   * KID-45 — an empty per-listing ad calendar is produced both by an
   * organization that runs no ads and by a window whose ad collection failed
   * entirely. Only Advertising's account-level publication separates them, so
   * these read through its own repository against Postgres: no stub can hold
   * the difference between an account row that exists and one that does not.
   */
  describe('account-level advertising evidence', () => {
    it('withholds every listing when the advertising account published nothing', async () => {
      // An active Coupang account exists (the listing is on one) and the
      // window carries no published account day at all.
      await seedLossListingOnChannel('coupang', 'ACCT-MISSING');

      const result = await readSummary(warningContext(), TEST_ORGANIZATION_ID);

      // Absent evidence, not an ad cost of zero: the loss-making listing is
      // withheld and the cards blank rather than reporting a computed profit.
      expect(result.warnings.minusProducts).toBe(0);
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: null,
          measured: false,
          withheldCount: 1,
        });
      }
      for (const key of AD_FREE_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          measured: true, withheldCount: 0,
        });
      }
    });

    it('counts a measured zero when a confirmed-zero account covers every date in the window', async () => {
      // An organization with an advertising account that ran no campaigns.
      // The ad report is empty on every date, so the sweep publishes no
      // target rows at all — the same row shape a total collection failure
      // leaves behind. What separates them is the window the sweep declared.
      await seedLossListingOnChannel('coupang', 'ACCT-ZERO-FULL');
      await coverMonth();

      const result = await readSummary(warningContext(), TEST_ORGANIZATION_ID);

      // The account proved zero spend on every date the window asked about, so
      // the loss-making listing has a measured ad cost of 0 and a computed
      // profit. Blanking it would discard a fact the owner established.
      expect(result.warnings.minusProducts).toBe(1);
      expect(result.warnings.highAdProducts).toBe(0);
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: lastClosedDate(warningContext()),
          measured: true,
          withheldCount: 0,
          sources: ['orders', 'channel_listings', 'coupang_ads'],
        });
      }
    });

    it('withholds when a confirmed-zero account covers only part of the window', async () => {
      // The same declared window, one date short. The sweep claims nothing
      // about the date it never reached, so that date is spend nobody looked
      // for.
      await seedLossListingOnChannel('coupang', 'ACCT-ZERO-PARTIAL');
      await coverMonth(1);

      const result = await readSummary(warningContext(), TEST_ORGANIZATION_ID);

      expect(result.warnings.minusProducts).toBe(0);
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: null,
          measured: false,
          withheldCount: 1,
        });
      }
      for (const key of AD_FREE_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          measured: true, withheldCount: 0,
        });
      }
    });

    it('counts a measured zero when the organization has no advertising account', async () => {
      // The same fixture on a channel with no Coupang advertising account:
      // no collection can exist, so zero is a satisfied input.
      await seedLossListingOnChannel('naver', 'ACCT-NOT-APPLIED');

      const result = await readSummary(warningContext(), TEST_ORGANIZATION_ID);

      expect(result.warnings.minusProducts).toBe(1);
      expect(result.warnings.highAdProducts).toBe(0);
      // Advertising applies to no listing, so no ad ledger stands behind the
      // counts: the basis names orders and listings alone.
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          measured: true,
          withheldCount: 0,
          sources: ['orders', 'channel_listings'],
        });
      }
    });
  });

  /**
   * D2 — the per-listing warnings count listings over collected order rows, so
   * a count is a measurement only over a window the Orders collection covered.
   * That window is the anchor's month clipped to closed KST days (ADR-0001): a
   * collection can never cover a day still open, and the 1st has no closed day
   * at all. The sweep covers the same closed days in every case, so orders are
   * the only evidence that moves.
   */
  describe('per-listing warnings over the Orders collection window', () => {
    function expectPerListingUnavailable(
      result: Awaited<ReturnType<typeof readSummary>>,
    ): void {
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: null,
          measured: false,
          withheldCount: 0,
        });
      }
      for (const key of AD_FREE_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          measured: true, withheldCount: 0,
        });
      }
    }

    it('withholds the counts while no Orders collection covered the window', async () => {
      // A loss-making sale and a complete sweep, but nothing collected the
      // orders. Reading no row is not reading "no loss-making listing".
      await seedLossListingOnChannel('coupang', 'ORDERS-NONE');
      await coverMonth();

      expectPerListingUnavailable(
        await readSummary(warningContext(), TEST_ORGANIZATION_ID, null),
      );
    });

    it('withholds the counts while the Orders collection stops short of the last closed day', async () => {
      // The collection reached the 18th. The sale it has not collected yet,
      // on the 19th, is exactly the one the count would have found.
      await seedLossListingOnChannel('coupang', 'ORDERS-SHORT', saleAt(19));
      await coverMonth();

      expectPerListingUnavailable(
        await readSummary(warningContext(), TEST_ORGANIZATION_ID, adDay(18)),
      );
    });

    it('counts once orders and the sweep cover every closed day, requiring no open day', async () => {
      // Both sources stop at the 19th, the anchor's last closed day; the 20th
      // through the month's end cannot be collected yet and are not asked for.
      await seedLossListingOnChannel('coupang', 'ORDERS-CLOSED', saleAt(19));
      await coverMonth();

      const result = await readSummary(warningContext(), TEST_ORGANIZATION_ID, adDay(19));

      expect(result.warnings.minusProducts).toBe(1);
      // The count reaches the 19th, the as-of it needed: current, not stale
      // for want of the still-open 20th.
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: adDay(19),
          requiredAsOf: adDay(19),
          measured: true,
          withheldCount: 0,
        });
      }
    });

    it('leaves the counts unavailable on the 1st rather than borrowing the closed previous month', async () => {
      // August is fully collected and swept and holds a loss-making sale. On
      // 1 September the window has no closed day, so there is nothing to count.
      await seedLossListingOnChannel(
        'coupang', 'ORDERS-FIRST', new Date('2026-08-31T12:00:00+09:00'),
      );
      await seedCompletedOrderCoverageRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID, startDate: '2026-08-01', endDate: '2026-08-31',
      });
      await seedCompletedAdSweepRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        generation: ++sweepGeneration,
        window: { startDate: '2026-08-01', endDate: '2026-08-31' },
      });
      const firstOfMonth = buildDashboardContext(
        undefined, undefined, undefined, new Date('2026-09-01T03:00:00.000Z'),
      );

      const result = await readSummary(firstOfMonth, TEST_ORGANIZATION_ID);
      expectPerListingUnavailable(result);
      // The empty window reaches no as-of; the one it needed is still the last
      // closed day, 31 August, not the open 1st.
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({ requiredAsOf: '2026-08-31' });
      }
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForBlockedListingStateRead(prisma: PrismaClient): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [activity] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND query ILIKE '%channel_listing_daily_snapshots%'
      ) AS waiting
    `;
    if (activity?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for the dashboard listing-state read to block.');
}
