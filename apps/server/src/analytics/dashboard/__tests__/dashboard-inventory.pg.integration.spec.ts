import { randomUUID } from 'node:crypto';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD, PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH } from '@kiditem/shared/product-abc';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { snapshotPartialOf } from '../../../test-helpers/dashboard-basis-assertions';
import { ProfitabilityAdImportRepositoryAdapter } from '../../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { MasterProductProfitabilityReadService } from '../../../finance/application/service/master-product-profitability-read.service';
import { SellpiaProfitabilitySourceService } from '../../sellpia-product-sales/sellpia-profitability-source.service';
import { MASTER_PRODUCT_PROFITABILITY_READ_PORT } from '../../../finance/application/port/in/master-product-profitability-read.port';
import { MasterProductAbcRepositoryAdapter } from '../../../products/adapter/out/repository/master-product-abc.repository.adapter';
import { MASTER_PRODUCT_ABC_REPOSITORY_PORT } from '../../../products/application/port/out/repository/master-product-abc.repository.port';
import { PRODUCT_ABC_READ_PORT } from '../../../products/application/port/in/product-abc-read.port';
import { ProductAbcReadService } from '../../../products/application/service/product-abc-read.service';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { DashboardInventoryService } from '../application/service/dashboard-inventory.service';
import { buildDashboardContext } from '../domain/context';
import { businessDateText } from '../domain/period/dashboard-period';
import { kstMonthEnd } from '../../../common/kst';
import { DashboardInventoryRepositoryAdapter } from '../adapter/out/repository/dashboard-inventory.repository.adapter';
import { PrismaService } from '../../../prisma/prisma.service';
import { DASHBOARD_INVENTORY_REPOSITORY_PORT } from '../application/port/out/repository/dashboard-inventory.repository.port';
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
    const alerts = new SourceFailureAlerts(prisma as never);
    sellpiaSource = new SellpiaProfitabilitySourceService(prisma as never, alerts);
    advertisingSource = new ProfitabilityAdImportRepositoryAdapter(prisma as never, alerts);
    const evidence = new MasterProductProfitabilityReadService(
      sellpiaSource,
      advertisingSource,
      prisma as never,
    );
    const m = await Test.createTestingModule({
      providers: [
        DashboardInventoryService,
        { provide: MASTER_PRODUCT_PROFITABILITY_READ_PORT, useValue: evidence },
        MasterProductAbcRepositoryAdapter,
        { provide: MASTER_PRODUCT_ABC_REPOSITORY_PORT, useExisting: MasterProductAbcRepositoryAdapter },
        ProductAbcReadService,
        { provide: PRODUCT_ABC_READ_PORT, useExisting: ProductAbcReadService },
        DashboardInventoryRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
        // The panel's rows come from the alerts module, against the same Postgres.
        { provide: SourceFailureAlerts, useValue: alerts },
        // The real advertising owner, against the same Postgres. Whether the
        // account published anything for the window is a fact only rows can
        // hold, so a stub here would decide the very thing under test.
        { provide: DASHBOARD_INVENTORY_REPOSITORY_PORT, useExisting: DashboardInventoryRepositoryAdapter },
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
   * Publishes the inventory snapshot and declares the anchor month collected
   * by the Orders collection, which owns every order seeded before the read.
   * Per-listing profit reads only orders a completed collection published, so
   * the warning cases decide on advertising and cost evidence alone.
   */
  async function readSummary(
    ctx: ReturnType<typeof buildDashboardContext>,
    organizationId: string,
  ) {
    await seedCompletedInventorySnapshot(prisma, organizationId);
    const month = businessDateText(new Date()).slice(0, 7);
    await seedCompletedOrderCoverageRun(prisma, {
      organizationId,
      startDate: `${month}-01`,
      endDate: kstMonthEnd(month),
    });
    return service.getSummary(ctx, organizationId);
  }

  function midMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 15, 3, 0, 0);
  }

  /** A `YYYY-MM-DD` business date inside the anchor's KST month. */
  function adDay(dayOfMonth: number): string {
    return `${businessDateText(new Date()).slice(0, 7)}-${String(dayOfMonth).padStart(2, '0')}`;
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
  async function seedLossListingOnChannel(channel: string, tag: string): Promise<string> {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: `M-T-${tag}`, name: `Master ${tag}`, abcGrade: 'A',
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
      orderedAt: midMonth().toISOString(),
      shippingPrice: 5_000,
      lineItems: [{ quantity: 1, totalPrice: 50_000, optionId, listingOptionId }],
    });
    return listingId;
  }

  /**
   * The campaign sweep declared it swept the anchor month, up to `short` days
   * before its end. Every date in that window is measured, with the listing
   * rows' sums or a measured zero, so whether the window is fully covered is
   * what decides every listing's ad cost at once.
   */
  let sweepGeneration = 0;
  async function coverMonth(short = 0): Promise<void> {
    const month = businessDateText(new Date()).slice(0, 7);
    const lastDay = Number(kstMonthEnd(month).slice(8)) - short;
    await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: ++sweepGeneration,
      window: { startDate: `${month}-01`, endDate: adDay(lastDay) },
    });
  }

  /**
   * Seed a basic 2-operating-product + 1-alert layout for TEST,
   * and 5-operating-product + 3-alert for OTHER (no order data).
   * Used by T1/T2/T3 (IDOR cases that don't touch warnings).
   */
  async function seedBaseStructure() {
    const masterT1 = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-1', name: 'Master T1', abcGrade: 'A',
    });
    const masterT2 = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-2', name: 'Master T2', abcGrade: 'B',
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
        abcGrade: i <= 3 ? 'A' : 'B',
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

  it('separates active products from channel-linked products', async () => {
    const masterLinked = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-LINKED', name: 'Linked Master', abcGrade: 'A',
    });
    const optionLinked = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId: masterLinked.id, sku: 'SKU-T-LINKED',
    });
    await prisma.sellpiaInventorySku.update({
      where: { id: optionLinked.id },
      data: { masterProductId: masterLinked.id },
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
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-ONLY', name: 'Inventory Only Master', abcGrade: 'B',
    });
    const inactiveMaster = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-INACTIVE', name: 'Inactive Master', abcGrade: 'C',
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
    await prisma.masterProduct.update({
      where: { id: inactiveMaster.id },
      data: { isActive: false },
    });
    const otherMaster = await setupMaster(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, code: 'M-O-LINKED', name: 'Other Linked Master', abcGrade: 'A',
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

    expect(result.totalProducts).toBe(2);
    expect(result.channelLinkedProducts).toBe(1);
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
    await prisma.sellpiaInventorySku.update({
      where: { id: inventory.id },
      data: { masterProductId: master.id, currentStock: 0 },
    });
    const linkedListing = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      channel: 'coupang',
      externalId: 'EXT-T-CONFIG-LINK',
      optionId: inventory.id,
      externalOptionId: 'VI-T-CONFIG-LINK',
    });
    // The product↔listing identity is direct CONFIG. Recipe/inventory mapping
    // can be missing and is reported separately as mapping attention.
    await prisma.channelListingOptionInventoryComponent.deleteMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: linkedListing.listingOptionId,
      },
    });

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
      abcGrade: 'A',
    });
    const inventory = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      sku: 'SKU-T-SALE-STATUS',
    });
    await prisma.sellpiaInventorySku.update({
      where: { id: inventory.id },
      data: { masterProductId: master.id },
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
      abcGrade: 'A',
    });
    const inventory = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      sku: 'SKU-T-CONCURRENT-STATUS',
    });
    await prisma.sellpiaInventorySku.update({
      where: { id: inventory.id },
      data: { masterProductId: master.id },
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
      abcGrade: 'A',
    });
    await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-UNCLASSIFIED',
      name: 'Unclassified Master',
      abcGrade: null,
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

  it('counts low reviews from the official A publication when the grade cache is null or stale', async () => {
    const officialA = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-OFFICIAL-A',
      name: 'Official A',
      abcGrade: null,
    });
    const staleCacheA = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-STALE-A',
      name: 'Stale cache A',
      abcGrade: 'A',
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
      abcGrade: 'A',
    });
    const foreignMaster = await setupMaster(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      code: 'M-O-HISTORY',
      name: 'Foreign History Master',
      abcGrade: 'C',
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

    expect(result.gradeChanges).toEqual({ upgraded: 1, downgraded: 0, total: 1 });
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
    const sellpia = await sellpiaSource.beginAttempt(organizationId, randomUUID());
    await sellpiaSource.failAttempt(organizationId, sellpia.attemptId, {
      attemptToken: sellpia.attemptToken,
      errorCode: 'COLLECTION_FAILED',
      errorMessage: 'Historical publication retained by fixture',
    });
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
          publishedSellpiaSourceImportRunId: sellpia.attemptId,
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
          publishedSellpiaSourceImportRunId: sellpia.attemptId,
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
        sellpiaSourceImportRunId: sellpia.attemptId,
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
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-LOSS', name: 'Loss Master', abcGrade: 'A',
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

    const ctx = buildDashboardContext();
    const result = await readSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.warnings.minusProducts).toBe(1);
    expect(result.warnings.lowProfitProducts).toBe(0);
    expect(result.warnings.highAdProducts).toBe(0);
  });

  it('T5: 3 warnings — minus + lowProfit + highAd seeded on 3 listings', async () => {
    // Listing A: minus (cost > revenue)
    const a = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-A', name: 'A', abcGrade: 'A' });
    const aOpt = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: a.id, sku: 'SKU-T-A', costPrice: 80_000});
    const aList = await setupChannelListing(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: a.id, channel: 'coupang', externalId: 'EXT-T-A', optionId: aOpt.id, externalOptionId: 'VI-T-A' });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INV-T-A-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 50_000, optionId: aOpt.id, listingOptionId: aList.listingOptionId }],
    });

    // Listing B: lowProfit (profitRate 2%). A Rocket order carries no commission:
    //   netProfit = 100_000 - 98_000 - 0 shipping - 0 ad = 2_000 → 2.0% (lowProfit ✓, rate <= 3)
    const b = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-B', name: 'B', abcGrade: 'A' });
    const bOpt = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: b.id, sku: 'SKU-T-B', costPrice: 98_000});
    const bList = await setupChannelListing(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: b.id, channel: 'coupang', externalId: 'EXT-T-B', optionId: bOpt.id, externalOptionId: 'VI-T-B' });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INV-T-B-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 100_000, optionId: bOpt.id, listingOptionId: bList.listingOptionId }],
    });

    // Listing C: highAd (revenue>0, adCost > 15% of revenue)
    // revenue=100_000, adCost=20_000 → adRate=20% (>15)
    const c = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-C', name: 'C', abcGrade: 'A' });
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
    // The sweep measured the whole month, so listings A and B — which carry
    // no row — are genuinely unadvertised.
    await coverMonth();

    const ctx = buildDashboardContext();
    const result = await readSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.warnings.minusProducts).toBe(1);
    expect(result.warnings.lowProfitProducts).toBe(1);
    expect(result.warnings.highAdProducts).toBe(1);
    // Real seeded counts must arrive with a basis that lets the card display
    // them. `unavailable` is the one status that blanks a warning card.
    for (const key of [
      'warnings.minusProducts',
      'warnings.lowProfitProducts',
      'warnings.highAdProducts',
      'warnings.outOfStockSkus',
      'warnings.mappingAttentionSkus',
    ] as const) {
      expect(result.metricBasis?.[key], key).toMatchObject({
        kind: 'snapshot', measured: true, asOf: businessDateText(ctx.anchor), requiredAsOf: businessDateText(ctx.anchor),
      });
    }
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

      const ctx = buildDashboardContext();
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

      const result = await readSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

      // The sweep measured the whole month; a listing without a row on a
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

      const result = await readSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

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

      const result = await readSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

      // The account proved zero spend on every date the window asked about, so
      // the loss-making listing has a measured ad cost of 0 and a computed
      // profit. Blanking it would discard a fact the owner established.
      expect(result.warnings.minusProducts).toBe(1);
      expect(result.warnings.highAdProducts).toBe(0);
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: businessDateText(buildDashboardContext().anchor),
          measured: true,
          withheldCount: 0,
        });
      }
    });

    it('withholds when a confirmed-zero account covers only part of the window', async () => {
      // The same declared window, one date short. The sweep claims nothing
      // about the date it never reached, so that date is spend nobody looked
      // for.
      await seedLossListingOnChannel('coupang', 'ACCT-ZERO-PARTIAL');
      await coverMonth(1);

      const result = await readSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

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

      const result = await readSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

      expect(result.warnings.minusProducts).toBe(1);
      expect(result.warnings.highAdProducts).toBe(0);
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          measured: true,
          withheldCount: 0,
        });
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
