import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD, PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH } from '@kiditem/shared/product-abc';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ProfitabilityAdImportRepositoryAdapter } from '../../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { AdAccountDailyKpiSourceRepository } from '../../../advertising/adapter/out/repository/ad-account-daily-kpi-source.repository';
import { AD_ACCOUNT_DAILY_KPI_READ_PORT } from '../../../advertising/application/port/in/ad-account-daily-kpi-source.port';
import { MasterProductProfitabilityReadService } from '../../../finance/application/service/master-product-profitability-read.service';
import { SellpiaProfitabilitySourceService } from '../../sellpia-product-sales/sellpia-profitability-source.service';
import { MASTER_PRODUCT_PROFITABILITY_READ_PORT } from '../../../finance/application/port/in/master-product-profitability-read.port';
import { MasterProductAbcRepositoryAdapter } from '../../../products/adapter/out/repository/master-product-abc.repository.adapter';
import { MASTER_PRODUCT_ABC_REPOSITORY_PORT } from '../../../products/application/port/out/repository/master-product-abc.repository.port';
import { PRODUCT_ABC_READ_PORT } from '../../../products/application/port/in/product-abc-read.port';
import { ProductAbcReadService } from '../../../products/application/service/product-abc-read.service';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { AlertsRepository } from '../../../alerts/alerts.repository';
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
  seedPublishedAdAccountDay,
} from '../../../test-helpers/finance-seeds';
import type { PrismaClient } from '@prisma/client';

describe('DashboardInventoryService.getSummary (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardInventoryService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const alerts = new SourceFailureAlerts(new AlertsRepository(prisma as never));
    const evidence = new MasterProductProfitabilityReadService(
      new SellpiaProfitabilitySourceService(prisma as never, alerts),
      new ProfitabilityAdImportRepositoryAdapter(prisma as never, alerts), prisma as never,
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
        // The real advertising owner, against the same Postgres. Whether the
        // account published anything for the window is a fact only rows can
        // hold, so a stub here would decide the very thing under test.
        {
          provide: AD_ACCOUNT_DAILY_KPI_READ_PORT,
          useValue: new AdAccountDailyKpiSourceRepository(prisma as never, alerts),
        },
        { provide: DASHBOARD_INVENTORY_REPOSITORY_PORT, useExisting: DashboardInventoryRepositoryAdapter },
      ],
    }).compile();
    service = m.get(DashboardInventoryService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

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
      sku: `SKU-T-${tag}`, costPrice: 80_000, commissionRate: 0.1, otherCost: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel, externalId: `EXT-T-${tag}`,
      optionId, externalOptionId: `VI-T-${tag}`,
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: `INV-T-${tag}-1`,
      orderedAt: midMonth().toISOString(),
      shippingPrice: 5_000,
      lineItems: [{ quantity: 1, totalPrice: 50_000, optionId, listingOptionId }],
    });
    return listingId;
  }

  /**
   * Advertising published a complete account day inside the window, so the
   * per-listing calendar — rather than an account that published nothing —
   * decides each listing's coverage. Without this, the owner answers `MISSING`
   * and every listing is withheld no matter what its own rows say.
   */
  async function publishAdAccountDay(date: string, adSpend: number): Promise<void> {
    await seedPublishedAdAccountDay(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      date,
      adSpend,
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
    await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-2', name: 'Master T2', abcGrade: 'B',
    });
    await prisma.alert.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID, type: 'inventory', severity: 'medium',
        title: 'Test alert', message: 'test',
        targetType: 'master', targetId: masterT1.id, isRead: false,
      },
    });

    for (let i = 1; i <= 5; i++) {
      await setupMaster(prisma, {
        organizationId: OTHER_ORGANIZATION_ID, code: `M-O-${i}`, name: `Master O${i}`,
        abcGrade: i <= 3 ? 'A' : 'B',
      });
    }
    for (let i = 1; i <= 3; i++) {
      await prisma.alert.create({
        data: {
          organizationId: OTHER_ORGANIZATION_ID, type: 'inventory', severity: 'high',
          title: `OTHER alert ${i}`, message: 'other',
          targetType: 'master', targetId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', isRead: false,
        },
      });
    }
  }

  it('T1: TEST sees only TEST listings, alerts, and grades', async () => {
    await seedBaseStructure();
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

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
    await setupMaster(prisma, {
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

    const result = await service.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

    expect(result.totalProducts).toBe(2);
    expect(result.channelLinkedProducts).toBe(1);
    expect(result.channelUnlinkedProducts).toBe(1);
    expect(result.gradeCount.A).toBe(1);
    expect(result.gradeCount.B).toBe(1);
  });

  it('T2: OTHER sees only OTHER — TEST does not leak', async () => {
    await seedBaseStructure();
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, OTHER_ORGANIZATION_ID);

    expect(result.totalProducts).toBe(5);
    expect(result.channelLinkedProducts).toBe(0);
    expect(result.channelUnlinkedProducts).toBe(5);
    expect(result.gradeCount.A).toBe(3);
    expect(result.gradeCount.B).toBe(2);
    expect(result.alerts.length).toBe(3);
  });

  it('T3: fresh organization → zero-valued summary', async () => {
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);
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
    await setupMaster(prisma, {
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

    const result = await service.getSummary(
      buildDashboardContext(),
      TEST_ORGANIZATION_ID,
    );

    expect(result.gradeCount).toEqual({ A: 1, B: 0, C: 0 });
    expect(result.classifiedProductCount).toBe(1);
    expect(result.unclassifiedProductCount).toBe(1);
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
    const [ownFormula, foreignFormula] = await Promise.all([
      createFormula(TEST_ORGANIZATION_ID),
      createFormula(OTHER_ORGANIZATION_ID),
    ]);
    await prisma.masterProductAbcGradeHistory.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId: ownMaster.id,
          formulaVersionId: ownFormula.id,
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
          formulaVersionId: foreignFormula.id,
          formulaRevision: 1, publicationRevision: 1,
          oldGrade: 'A',
          newGrade: 'C',
          economicScore: 20,
          sourceCutoffDate: new Date('2026-07-31T00:00:00.000Z'),
          reason: 'automatic_profitability_evaluation',
        },
      ],
    });

    const result = await service.getSummary(
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

  it('T4: minusProduct — seeded loss order surfaces in warnings.minusProducts', async () => {
    // Loss order: revenue 50_000, costPrice 80_000, commission 10%, shipping 5_000
    // netProfit = 50_000 - 80_000 - 5_000 - 5_000 - 0 - 0 = -40_000  → minus
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-LOSS', name: 'Loss Master', abcGrade: 'A',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: 'SKU-T-LOSS', costPrice: 80_000, commissionRate: 0.1, otherCost: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T-LOSS',
      optionId, externalOptionId: 'VI-T-LOSS',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'INV-T-LOSS-1',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 5_000,
      lineItems: [{ quantity: 1, totalPrice: 50_000, optionId, listingOptionId }],
    });
    // The listing is loss-making at any ad cost, but it only reaches the count
    // once its ad cost is measured: the account published an explicit zero for
    // the day and the listing carries the matching confirmed-zero row.
    const lossDay = midMonth().toISOString().slice(0, 10);
    await publishAdAccountDay(lossDay, 0);
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId, date: lossDay, spend: 0,
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.warnings.minusProducts).toBe(1);
    expect(result.warnings.lowProfitProducts).toBe(0);
    expect(result.warnings.highAdProducts).toBe(0);
  });

  it('T5: 3 warnings — minus + lowProfit + highAd seeded on 3 listings', async () => {
    // Listing A: minus (cost > revenue)
    const a = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-A', name: 'A', abcGrade: 'A' });
    const aOpt = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: a.id, sku: 'SKU-T-A', costPrice: 80_000, commissionRate: 0.1 });
    const aList = await setupChannelListing(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: a.id, channel: 'coupang', externalId: 'EXT-T-A', optionId: aOpt.id, externalOptionId: 'VI-T-A' });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INV-T-A-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 50_000, optionId: aOpt.id, listingOptionId: aList.listingOptionId }],
    });

    // Listing B: lowProfit (profitRate ≈ 2%)
    // Aim: revenue=100_000, costPrice=85_000, commission 0.10×100_000=10_000, shipping 0, ad 0, other 0
    //   netProfit = 100_000 - 85_000 - 10_000 - 0 - 0 - 0 = 5_000 → 5.0% (NOT lowProfit; rate must be <=3)
    // Adjust: costPrice=88_000 → netProfit = 100_000 - 88_000 - 10_000 = 2_000 → 2.0% (lowProfit ✓)
    const b = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-B', name: 'B', abcGrade: 'A' });
    const bOpt = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: b.id, sku: 'SKU-T-B', costPrice: 88_000, commissionRate: 0.1 });
    const bList = await setupChannelListing(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: b.id, channel: 'coupang', externalId: 'EXT-T-B', optionId: bOpt.id, externalOptionId: 'VI-T-B' });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INV-T-B-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 100_000, optionId: bOpt.id, listingOptionId: bList.listingOptionId }],
    });

    // Listing C: highAd (revenue>0, adCost > 15% of revenue)
    // revenue=100_000, adCost=20_000 → adRate=20% (>15)
    const c = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-C', name: 'C', abcGrade: 'A' });
    const cOpt = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: c.id, sku: 'SKU-T-C', costPrice: 0, commissionRate: 0 });
    const cList = await setupChannelListing(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: c.id, channel: 'coupang', externalId: 'EXT-T-C', optionId: cOpt.id, externalOptionId: 'VI-T-C' });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INV-T-C-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 100_000, optionId: cOpt.id, listingOptionId: cList.listingOptionId }],
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId: cList.listingId,
      date: midMonth().toISOString().slice(0, 10), spend: 20_000,
    });
    // The account published that day, so listings A and B — which the
    // listing-level source never reported — are genuinely unadvertised.
    await publishAdAccountDay(midMonth().toISOString().slice(0, 10), 20_000);

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

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
        kind: 'snapshot', asOf: businessDateText(ctx.anchor), status: 'current',
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
  describe('warning counts over a partly measurable population', () => {
    const AD_DAYS = [5, 6] as const;

    const seedLossListing = (tag: string) => seedLossListingOnChannel('coupang', tag);

    /**
     * Record ad evidence for a listing on each named day of the month, and
     * publish the matching account day. A hole in the per-listing calendar
     * only means anything once the account itself published something.
     */
    async function seedAdDays(listingId: string, days: readonly number[]): Promise<void> {
      for (const day of days) {
        await seedAd(prisma, {
          organizationId: TEST_ORGANIZATION_ID, listingId, date: adDay(day), spend: 1_000,
        });
        await publishAdAccountDay(adDay(day), 1_000);
      }
    }

    it('T6: counts the listings it could measure and says how many it withheld', async () => {
      const covered = await seedLossListing('COVERED');
      const holed = await seedLossListing('HOLED');
      await seedAdDays(covered, AD_DAYS);
      await seedAdDays(holed, [AD_DAYS[0]]);

      const ctx = buildDashboardContext();
      const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

      // A real count over the listings that could be measured — one of the two
      // loss-making listings, because the other's ad evidence has a hole.
      expect(result.warnings.minusProducts).toBe(1);
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: businessDateText(ctx.anchor),
          // Partial coverage is not staleness: the read is still as-of today.
          status: 'current',
          partial: true,
          withheldCount: 1,
        });
      }
      // Out-of-stock and mapping attention have no advertising input, so they
      // never inherit another value's incomplete population.
      for (const key of AD_FREE_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          status: 'current', partial: false, withheldCount: 0,
        });
      }
    });

    it('T7: a fully covered population counts every listing with no partial signal', async () => {
      const first = await seedLossListing('FULL-A');
      const second = await seedLossListing('FULL-B');
      await seedAdDays(first, AD_DAYS);
      await seedAdDays(second, AD_DAYS);

      const result = await service.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

      expect(result.warnings.minusProducts).toBe(2);
      for (const key of [...PER_LISTING_KEYS, ...AD_FREE_KEYS]) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          status: 'current', partial: false, withheldCount: 0,
        });
      }
    });

    it('T8: an empty measurable subset publishes no value rather than a counted zero', async () => {
      // Each listing covers a date the other does not, so the window's ad
      // calendar has two dates and neither listing covers both.
      const first = await seedLossListing('HOLE-A');
      const second = await seedLossListing('HOLE-B');
      await seedAdDays(first, [AD_DAYS[0]]);
      await seedAdDays(second, [AD_DAYS[1]]);

      const result = await service.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

      expect(result.warnings.minusProducts).toBe(0);
      for (const key of PER_LISTING_KEYS) {
        // Nothing was measurable, so this zero is an absence rather than a
        // count. `unavailable` is what makes the card blank instead of
        // claiming no listing is loss-making.
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: null,
          status: 'unavailable',
          partial: false,
          withheldCount: 2,
        });
      }
      for (const key of AD_FREE_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          status: 'current', partial: false, withheldCount: 0,
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

      const result = await service.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

      // Absent evidence, not an ad cost of zero: the loss-making listing is
      // withheld and the cards blank rather than reporting a computed profit.
      expect(result.warnings.minusProducts).toBe(0);
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: null,
          status: 'unavailable',
          partial: false,
          withheldCount: 1,
        });
      }
      for (const key of AD_FREE_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          status: 'current', partial: false, withheldCount: 0,
        });
      }
    });

    /**
     * Every business date in the dashboard's month window. `ctx.monthStart` /
     * `ctx.monthEnd` are the whole KST calendar month, so "covers the window"
     * means an account row on each of these dates.
     */
    function everyWindowDay(): string[] {
      const month = businessDateText(new Date()).slice(0, 7);
      const dayCount = Number(kstMonthEnd(month).slice(8));
      return Array.from({ length: dayCount }, (_, index) => adDay(index + 1));
    }

    it('counts a measured zero when a confirmed-zero account covers every date in the window', async () => {
      // An organization with an advertising account that ran no campaigns.
      // The ad report is empty on every date, so `flushListingAdMetrics` writes
      // no listing rows at all and the per-listing calendar is empty — the
      // same shape a total collection failure leaves behind.
      await seedLossListingOnChannel('coupang', 'ACCT-ZERO-FULL');
      for (const day of everyWindowDay()) {
        await publishAdAccountDay(day, 0);
      }

      const result = await service.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

      // The account proved zero spend on every date the window asked about, so
      // the loss-making listing has a measured ad cost of 0 and a computed
      // profit. Blanking it would discard a fact the owner established.
      expect(result.warnings.minusProducts).toBe(1);
      expect(result.warnings.highAdProducts).toBe(0);
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: businessDateText(buildDashboardContext().anchor),
          status: 'current',
          partial: false,
          withheldCount: 0,
        });
      }
    });

    it('withholds when a confirmed-zero account covers only part of the window', async () => {
      // The same all-zero rows, one date short. `CONFIRMED_ZERO` describes the
      // rows the owner returned and claims nothing about the dates it never
      // reached, so the missing date is spend nobody looked for.
      await seedLossListingOnChannel('coupang', 'ACCT-ZERO-PARTIAL');
      for (const day of everyWindowDay().slice(0, -1)) {
        await publishAdAccountDay(day, 0);
      }

      const result = await service.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

      expect(result.warnings.minusProducts).toBe(0);
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          asOf: null,
          status: 'unavailable',
          partial: false,
          withheldCount: 1,
        });
      }
      for (const key of AD_FREE_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          status: 'current', partial: false, withheldCount: 0,
        });
      }
    });

    it('counts a measured zero when the organization has no advertising account', async () => {
      // The same fixture on a channel with no Coupang advertising account:
      // no collection can exist, so zero is a satisfied input.
      await seedLossListingOnChannel('naver', 'ACCT-NOT-APPLIED');

      const result = await service.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

      expect(result.warnings.minusProducts).toBe(1);
      expect(result.warnings.highAdProducts).toBe(0);
      for (const key of PER_LISTING_KEYS) {
        expect(result.metricBasis?.[key], key).toMatchObject({
          kind: 'snapshot',
          status: 'current',
          partial: false,
          withheldCount: 0,
        });
      }
    });
  });
});
