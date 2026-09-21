import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  buildPerListingMetrics,
  buildPerListingMetricsCoverage,
  buildPerListingProfit,
  readAdEvidenceFromLedger,
} from '../per-listing-profit';
import type { AccountAdEvidence } from '../per-listing-profit';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
  IDOR_SENTINEL,
} from '../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
  seedCompletedAdSweepRun,
  seedCompletedOrderCoverageRun,
} from '../../test-helpers/finance-seeds';
import { seedPublishedProductAbcGrades } from '../../products/__tests__/test-helpers/published-product-abc';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { kstMonthStart } from '../kst';

/**
 * Plan F1 T1 — buildPerListingMetrics (PG integration).
 *
 * Verifies the helper produces correct per-listing rollups from Order +
 * OrderLineItem + ChannelListing + ChannelListingOption + component mappings + daily ad facts,
 * with organizationId scoping and revenue-weighted shipping (R-1).
 */
/**
 * The account-level answer as `readAdEvidenceFromLedger` returns it. Coverage
 * is account-level: whether the sweep measured every date of the window is
 * what decides every listing's ad cost, so the cases default to a fully
 * measured window and say so explicitly when they mean a partial one.
 */
const accountEvidence = (
  answer: 'NOT_APPLIED' | 'MISSING' | 'CONFIRMED_ZERO' | 'OBSERVED',
  coversWindow = true,
): AccountAdEvidence => ({
  hasAdAccount: answer !== 'NOT_APPLIED',
  publishedDates: answer === 'NOT_APPLIED' || answer === 'MISSING' ? 0 : 1,
  accountSpend: answer === 'OBSERVED' ? 1 : 0,
  coversWindow,
});

describe('buildPerListingMetrics (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  // April 2026 KST window: [2026-04-01 00:00 KST, 2026-05-01 00:00 KST)
  const FROM = kstMonthStart(2026, 4);
  const TO = kstMonthStart(2026, 5);

  /**
   * The Orders collection declares it collected `[startDate, endDate]` and
   * owns every order seeded inside it so far. Orders seeded afterwards stay
   * outside any completed collection.
   */
  const coverOrders = (
    startDate = '2026-04-01',
    endDate = '2026-04-30',
    organizationId = TEST_ORGANIZATION_ID,
  ) => seedCompletedOrderCoverageRun(prisma, { organizationId, startDate, endDate });

  it('T1: single listing × 1 order × 1 lineItem → metrics math', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T1', name: 'Master T1', category: 'Toy',
    });
    await seedPublishedProductAbcGrades(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      grades: [{ masterProductId: masterId, abcGrade: 'A' }],
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: 'SKU-T1', costPrice: 50_000,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T1', channelName: '쿠팡',
      optionId, externalOptionId: 'VI-T1',
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-T-1',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 10_000,
      lineItems: [{ quantity: 1, totalPrice: 100_000, optionId, listingOptionId }],
    });

    await coverOrders();
    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO, accountEvidence('NOT_APPLIED'), new ProductTransactionalReadRepositoryAdapter());

    expect(result).toHaveLength(1);
    const m = result[0];
    expect(m.listingId).toBe(listingId);
    expect(m.channelName).toBe('쿠팡');
    expect(m.channel).toBe('coupang');
    expect(m.masterName).toBe('Master T1');
    expect(m.grade).toBe('A');
    expect(m.revenue).toBe(100_000);
    expect(m.costOfGoods).toBe(50_000);          // 50_000 × 1
    expect(m.commission).toBe(0);                // Rocket direct purchase: Not applied
    expect(m.shippingCost).toBe(10_000);         // sole lineItem → entire shipping
    expect(m.adCost).toBe(0);                    // no Ad seeded
    expect(m.otherCost).toBe(0);
    expect(m.netProfit).toBe(40_000);            // 100k - 50k - 0 - 10k - 0 - 0
    expect(m.profitRate).toBe(40.0);             // 40000/100000 * 100 = 40.0
    expect(m.orderCount).toBe(1);
  });

  it('T2: 2 orders × 1 listing → revenue-weighted shipping distribution', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T2', name: 'Master T2',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: 'SKU-T2', costPrice: 0,
    });
    const { listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T2',
      optionId, externalOptionId: 'VI-T2',
    });
    // Order 1: shipping 3000, single lineItem 9000 → entire ship = 3000
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-T-2a',
      orderedAt: '2026-04-10T03:00:00Z',
      shippingPrice: 3_000,
      lineItems: [{ quantity: 1, totalPrice: 9_000, optionId, listingOptionId }],
    });
    // Order 2: shipping 5000, single lineItem 1000 → entire ship = 5000 (single lineItem absorbs all)
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-T-2b',
      orderedAt: '2026-04-20T03:00:00Z',
      shippingPrice: 5_000,
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId, listingOptionId }],
    });

    await coverOrders();
    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO, accountEvidence('NOT_APPLIED'), new ProductTransactionalReadRepositoryAdapter());

    expect(result).toHaveLength(1);
    expect(result[0].revenue).toBe(10_000);             // 9000 + 1000
    expect(result[0].shippingCost).toBe(8_000);         // 3000 + 5000
    expect(result[0].orderCount).toBe(2);
  });

  it('T3: ad spend per listing rolls into adCost', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T3', name: 'Master T3',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: 'SKU-T3', costPrice: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T3',
      optionId, externalOptionId: 'VI-T3',
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-T-3',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 100_000, optionId, listingOptionId }],
    });
    // Two ads on different days → sum
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId, date: '2026-04-12', spend: 8_000 });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId, date: '2026-04-22', spend: 12_000 });

    await coverOrders();
    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO, accountEvidence('OBSERVED'), new ProductTransactionalReadRepositoryAdapter());

    expect(result).toHaveLength(1);
    expect(result[0].adCost).toBe(20_000);
    expect(result[0].netProfit).toBe(80_000);           // 100k - 0 - 0 - 0 - 20k - 0
  });

  it('includes the final KST business date when timestamp bounds cross a UTC calendar date', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-KST-MONTH-END',
      name: 'KST month-end product',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId,
      sku: 'SKU-KST-MONTH-END',
      costPrice: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId,
      channel: 'coupang',
      externalId: 'EXT-KST-MONTH-END',
      optionId,
      externalOptionId: 'VI-KST-MONTH-END',
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-KST-MONTH-END',
      orderedAt: '2026-07-31T14:59:59.000Z',
      shippingPrice: 0,
      lineItems: [
        { quantity: 1, totalPrice: 100_000, optionId, listingOptionId },
      ],
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId,
      date: '2026-07-31',
      spend: 20_000,
    });

    await coverOrders('2026-07-01', '2026-07-31');
    const result = await buildPerListingMetrics(
      prisma as unknown as PrismaService,
      TEST_ORGANIZATION_ID,
      new Date('2026-06-30T15:00:00.000Z'),
      new Date('2026-07-31T15:00:00.000Z'),
      accountEvidence('OBSERVED'),
     new ProductTransactionalReadRepositoryAdapter());

    expect(result).toEqual([
      expect.objectContaining({
        listingId,
        revenue: 100_000,
        adCost: 20_000,
        netProfit: 80_000,
      }),
    ]);
  });

  it('T5: EXCLUDED_ORDER_STATUSES filter — cancelled/returned/refunded orders are excluded', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T5', name: 'Master T5',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId, sku: 'SKU-T5', costPrice: 0,
    });
    const { listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T5',
      optionId, externalOptionId: 'VI-T5',
    });
    // 1 paid (included), 3 excluded statuses (each one a sentinel)
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'PERLIST-T-5-PAID',
      orderedAt: '2026-04-15T03:00:00Z', shippingPrice: 0, status: 'paid',
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId, listingOptionId }],
    });
    for (const status of ['cancelled', 'returned', 'refunded']) {
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID, externalOrderId: `PERLIST-T-5-${status.toUpperCase()}`,
        orderedAt: '2026-04-15T03:00:00Z', shippingPrice: 0, status,
        lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId, listingOptionId }],
      });
    }

    await coverOrders();
    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO, accountEvidence('NOT_APPLIED'), new ProductTransactionalReadRepositoryAdapter());
    expect(result).toHaveLength(1);
    expect(result[0].revenue).toBe(1_000);                    // only the paid order
    expect(result[0].revenue).not.toBe(IDOR_SENTINEL);        // excluded statuses' totalPrice never appears
    expect(result[0].orderCount).toBe(1);                     // 3 excluded orders dropped
  });

  it('T6: reports an imported listing without a component mapping, whose cost is unknown', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Active Wing account',
        externalAccountId: 'WING-ACCOUNT-T6',
        status: 'active',
      },
      select: { id: true },
    });
    const importRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: account.id,
        fileName: 'wing-products-t6.xlsx',
        fileHash: 'wing-products-t6',
        status: 'completed',
        rowCount: 1,
        importedAt: new Date('2026-04-14T00:00:00.000Z'),
      },
      select: { id: true },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'EXT-UNLINKED-T6',
        channelName: 'Wing import only',
        status: 'active',
        lastImportRunId: importRun.id,
      },
      select: { id: true },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'VI-UNLINKED-T6',
        lastImportRunId: importRun.id,
      },
      select: { id: true },
    });
    const order = await prisma.order.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalOrderId: 'PERLIST-T-6',
        orderedAt: new Date('2026-04-15T03:00:00.000Z'),
        status: 'accepted',
        shippingPrice: 0,
        totalPrice: 10_000,
      },
      select: { id: true },
    });
    await prisma.orderLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        orderId: order.id,
        listingOptionId: listingOption.id,
        productName: 'Wing import only',
        quantity: 1,
        unitPrice: 10_000,
        totalPrice: 10_000,
        externalLineId: 'LI-UNLINKED-T6',
      },
    });

    await coverOrders();
    const result = await buildPerListingProfit(
      prisma as unknown as PrismaService,
      TEST_ORGANIZATION_ID,
      FROM,
      TO,
      accountEvidence('NOT_APPLIED'),
     new ProductTransactionalReadRepositoryAdapter());

    // Neither a cost override nor a mapped Sellpia component exists, so the
    // purchase cost was never measured: it is unavailable, not zero.
    expect(result).toEqual([
      expect.objectContaining({
        listingId: listing.id,
        externalId: 'EXT-UNLINKED-T6',
        masterId: listing.id,
        masterCode: 'EXT-UNLINKED-T6',
        masterName: 'Wing import only',
        revenue: 10_000,
        costOfGoods: null,
        netProfit: null,
        profitRate: null,
      }),
    ]);
  });

  /**
   * ADR-0003 — ad coverage decides whether a per-listing profit exists.
   *
   * These live against PostgreSQL on purpose: `adSpend` is `Int @default(0)`,
   * so only a real row can hold the difference between a spend the ad source
   * measured as zero and a spend it never reported. A mocked aggregate cannot
   * express that difference at all.
   */
  describe('ad coverage (ADR-0006)', () => {
    /** One listing, one order, no costs: netProfit is revenue minus adCost. */
    async function seedListingWithOrder(
      code: string,
      orderedAt = '2026-04-15T03:00:00Z',
      channelAccountId?: string,
    ) {
      const { id: masterId } = await setupMaster(prisma, {
        organizationId: TEST_ORGANIZATION_ID, code: `M-${code}`, name: `Master ${code}`,
      });
      const { id: optionId } = await setupProductOption(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId,
        sku: `SKU-${code}`, costPrice: 0,
      });
      const { listingId, listingOptionId } = await setupChannelListing(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId,
        channel: 'coupang', externalId: `EXT-${code}`,
        optionId, externalOptionId: `VI-${code}`,
        channelAccountId,
      });
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: `PERLIST-${code}`,
        orderedAt,
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: 100_000, optionId, listingOptionId }],
      });
      return listingId;
    }

    const profitFor = async (
      listingId: string,
      accountAdEvidence: AccountAdEvidence = accountEvidence('OBSERVED'),
    ) => {
      await coverOrders();
      const rows = await buildPerListingProfit(
        prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO,
        accountAdEvidence,
       new ProductTransactionalReadRepositoryAdapter());
      return rows.find((row) => row.listingId === listingId);
    };

    it('keeps a computed profit when every measured day is a confirmed zero', async () => {
      const listingId = await seedListingWithOrder('COV-ZERO');
      // The ad source reported this listing on two measured days and reported
      // zero. A confirmed zero is a measurement, not an absence.
      await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId, date: '2026-04-12', spend: 0 });
      await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId, date: '2026-04-13', spend: 0 });

      const row = await profitFor(listingId);

      expect(row).toMatchObject({ adCost: 0, netProfit: 100_000, profitRate: 100 });
    });

    it('reads a listing without a row on a measured day as zero spend that day', async () => {
      const covered = await seedListingWithOrder('COV-FULL');
      const sparse = await seedListingWithOrder('COV-SPARSE');
      // The sweep measured both days for the whole account; `sparse` simply
      // was not advertised on 04-13.
      await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: covered, date: '2026-04-12', spend: 5_000 });
      await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: covered, date: '2026-04-13', spend: 5_000 });
      await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: sparse, date: '2026-04-12', spend: 5_000 });

      expect(await profitFor(covered)).toMatchObject({ adCost: 10_000, netProfit: 90_000 });
      expect(await profitFor(sparse)).toMatchObject({ adCost: 5_000, netProfit: 95_000 });
    });

    it('withholds every listing while the window is only partly measured', async () => {
      const listingId = await seedListingWithOrder('COV-PARTIAL');
      await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId, date: '2026-04-12', spend: 5_000 });

      // A sum over the measured part of the window proves nothing about the
      // rest, so it is not a cost: the partial sum this ADR exists to prevent.
      expect(await profitFor(listingId, accountEvidence('OBSERVED', false))).toMatchObject({
        adCost: null,
        netProfit: null,
        profitRate: null,
      });
    });

    it('treats a listing the ad source never reported as not applied', async () => {
      const advertised = await seedListingWithOrder('COV-APPLIED');
      const unadvertised = await seedListingWithOrder('COV-NOT-APPLIED');
      await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: advertised, date: '2026-04-12', spend: 5_000 });

      // The sweep measured the window and never reported this listing, so zero
      // is a satisfied input rather than a missing one — see
      // `apps/server/CONTEXT.md`, "Not applied".
      expect(await profitFor(unadvertised)).toMatchObject({
        adCost: 0,
        netProfit: 100_000,
      });
    });

    it('withholds the whole population from the measured projection while the window is partly measured', async () => {
      const first = await seedListingWithOrder('COV-KEEP');
      const second = await seedListingWithOrder('COV-DROP');
      await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: first, date: '2026-04-12', spend: 5_000 });
      await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: second, date: '2026-04-12', spend: 5_000 });

      // Counts and stored rollups cannot express "unavailable", so they withhold
      // instead — the same rule ABC applies to a product whose advertising
      // evidence is not ready. Coverage is account-level, so it withholds all.
      await coverOrders();
      const partial = await buildPerListingMetricsCoverage(
        prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO, accountEvidence('OBSERVED', false),
       undefined, new ProductTransactionalReadRepositoryAdapter());
      expect(partial).toEqual({ metrics: [], withheldListings: 2, orderWindowComplete: true });

      const measured = await buildPerListingMetrics(
        prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO, accountEvidence('OBSERVED'),
       new ProductTransactionalReadRepositoryAdapter());
      expect(measured.map((row) => row.listingId).sort()).toEqual([first, second].sort());
    });

    /**
     * KID-45 — the listing-level calendar alone cannot separate "this
     * organization runs no ads" from "ad collection failed for the whole
     * window": both leave it empty. Only the account-level word Advertising
     * publishes tells them apart, so it decides before the calendar does.
     */
    describe('account-level evidence', () => {
      it('withholds profit when only an unproven legacy row exists for the account day', async () => {
        const advertised = await seedListingWithOrder('ACC-LEGACY-A', '2026-04-10T03:00:00Z');
        const absent = await seedListingWithOrder('ACC-LEGACY-B', '2026-04-10T03:00:00Z');
        await seedAd(prisma, {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: advertised,
          date: '2026-04-10',
          spend: 5_000,
          runId: null,
        });
        await coverOrders();
        const from = new Date('2026-04-09T15:00:00Z');
        const to = new Date('2026-04-10T15:00:00Z');
        const evidence = await readAdEvidenceFromLedger(prisma, TEST_ORGANIZATION_ID, from, to);

        const rows = await buildPerListingProfit(
          prisma as unknown as PrismaService,
          TEST_ORGANIZATION_ID,
          from,
          to,
          evidence,
         new ProductTransactionalReadRepositoryAdapter());

        expect(evidence).toMatchObject({ publishedDates: 0, coversWindow: false });
        for (const listingId of [advertised, absent]) {
          expect(rows.find((row) => row.listingId === listingId)).toMatchObject({
            adCost: null,
            netProfit: null,
            profitRate: null,
          });
        }
      });

      it('does not publish zero profit evidence for an active account that was not swept', async () => {
        const measured = await seedListingWithOrder('ACC-MEASURED', '2026-04-10T03:00:00Z');
        const measuredAccount = await prisma.channelListing.findUniqueOrThrow({
          where: { id: measured },
          select: { channelAccountId: true },
        });
        const unmeasuredAccount = await prisma.channelAccount.create({
          data: {
            organizationId: TEST_ORGANIZATION_ID,
            channel: 'coupang',
            externalAccountId: 'ACC-UNMEASURED',
            name: 'Unmeasured account',
            status: 'active',
          },
          select: { id: true },
        });
        const unmeasured = await seedListingWithOrder(
          'ACC-UNMEASURED',
          '2026-04-10T03:00:00Z',
          unmeasuredAccount.id,
        );
        const run = await seedCompletedAdSweepRun(prisma, {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: measuredAccount.channelAccountId,
          generation: 1,
          window: { startDate: '2026-04-10', endDate: '2026-04-10' },
        });
        await seedAd(prisma, {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: measured,
          date: '2026-04-10',
          spend: 5_000,
          runId: run,
        });
        await coverOrders();
        const from = new Date('2026-04-09T15:00:00Z');
        const to = new Date('2026-04-10T15:00:00Z');
        const evidence = await readAdEvidenceFromLedger(prisma, TEST_ORGANIZATION_ID, from, to);

        const rows = await buildPerListingProfit(
          prisma as unknown as PrismaService,
          TEST_ORGANIZATION_ID,
          from,
          to,
          evidence,
         new ProductTransactionalReadRepositoryAdapter());

        expect(evidence).toMatchObject({ publishedDates: 0, coversWindow: false });
        for (const listingId of [measured, unmeasured]) {
          expect(rows.find((row) => row.listingId === listingId)).toMatchObject({
            adCost: null,
            netProfit: null,
            profitRate: null,
          });
        }
      });

      it('withholds every listing when the account published nothing for the window', async () => {
        const listingId = await seedListingWithOrder('ACC-MISSING');
        // Listing rows exist and carry ad provenance, so the per-listing
        // calendar looks complete. The account still published no complete
        // row for the window, which is absent evidence, not a cost of zero.
        await seedAd(prisma, {
          organizationId: TEST_ORGANIZATION_ID, listingId, date: '2026-04-12', spend: 5_000,
        });

        expect(await profitFor(listingId, accountEvidence('MISSING'))).toMatchObject({
          adCost: null,
          netProfit: null,
          profitRate: null,
        });
        // The withheld count is what a snapshot basis publishes, so an
        // account-wide miss must show up there rather than as a counted zero.
        await expect(buildPerListingMetricsCoverage(
          prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO, accountEvidence('MISSING'),
         undefined, new ProductTransactionalReadRepositoryAdapter())).resolves.toEqual({ metrics: [], withheldListings: 1, orderWindowComplete: true });
      });

      it('does not read an empty listing calendar as a measured zero once the source published', async () => {
        const listingId = await seedListingWithOrder('ACC-EMPTY-CALENDAR');
        // No listing-level ad row exists at all. Neither answer licenses a
        // zero here while the window is only partly measured: the dates the
        // sweep never reached stay unproven.
        for (const evidence of [accountEvidence('OBSERVED', false), accountEvidence('CONFIRMED_ZERO', false)] as const) {
          expect(await profitFor(listingId, evidence)).toMatchObject({
            adCost: null,
            netProfit: null,
            profitRate: null,
          });
        }
      });

      it('keeps a measured zero when advertising does not apply to the organization', async () => {
        const listingId = await seedListingWithOrder('ACC-NOT-APPLIED');

        // No advertising account exists, so no collection can exist either:
        // zero is a satisfied input and the profit is publishable.
        expect(await profitFor(listingId, accountEvidence('NOT_APPLIED'))).toMatchObject({
          adCost: 0,
          netProfit: 100_000,
          profitRate: 100,
        });
      });
    });
  });

  /**
   * KID-85 — the cost side carries the same gate as advertising. A purchase
   * price, commission rate or other cost that was never recorded is not a
   * cost of zero, so a listing with any such line has no measured profit.
   */
  describe('cost evidence (KID-85)', () => {
    /** A listing with one fully priced option, sold on `orderedAt`. */
    async function seedPricedListing(code: string, channel = 'naver') {
      const { id: masterId } = await setupMaster(prisma, {
        organizationId: TEST_ORGANIZATION_ID, code: `M-${code}`, name: `Master ${code}`,
      });
      const { id: optionId } = await setupProductOption(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId,
        sku: `SKU-${code}`, costPrice: 5_000,
      });
      const listing = await setupChannelListing(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId,
        channel, externalId: `EXT-${code}`,
        optionId, externalOptionId: `VI-${code}`,
      });
      return { ...listing, optionId };
    }

    const rowFor = async (listingId: string, evidence = accountEvidence('NOT_APPLIED')) =>
      (await buildPerListingProfit(
        prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO, evidence,
       new ProductTransactionalReadRepositoryAdapter())).find((row) => row.listingId === listingId);

    it('publishes no profit for a listing when one of its lines lacks a purchase price', async () => {
      const priced = await seedPricedListing('COST-PRICE');
      // Inventory publishes SKUs; the fixture goes through its test seed, with
      // no purchase price recorded.
      const unpricedSku = { id: randomUUID() };
      await seedSourceProduct(prisma, {
        id: unpricedSku.id,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SKU-COST-PRICE-UNKNOWN',
        name: 'Unpriced component',
      });
      const unpricedOption = await prisma.channelListingOption.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: priced.listingId,
          externalOptionId: 'VI-COST-PRICE-UNKNOWN',
        },
        select: { id: true },
      });
      await prisma.channelListingOptionInventoryComponent.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: unpricedOption.id,
          masterProductId: unpricedSku.id,
          quantity: 1,
        },
      });
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'PERLIST-COST-PRICE',
        orderedAt: '2026-04-15T03:00:00Z',
        shippingPrice: 0,
        lineItems: [
          { quantity: 1, totalPrice: 10_000, optionId: priced.optionId, listingOptionId: priced.listingOptionId },
          { quantity: 1, totalPrice: 20_000, optionId: unpricedSku.id, listingOptionId: unpricedOption.id },
        ],
      });
      await coverOrders();

      expect(await rowFor(priced.listingId)).toMatchObject({
        revenue: 30_000,
        costOfGoods: null,
        commission: 0,
        otherCost: 0,
        adCost: 0,
        netProfit: null,
        profitRate: null,
      });
      await expect(buildPerListingMetricsCoverage(
        prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO, accountEvidence('NOT_APPLIED'),
       undefined, new ProductTransactionalReadRepositoryAdapter())).resolves.toEqual({ metrics: [], withheldListings: 1, orderWindowComplete: true });
    });

    it('leaves the profit rate unavailable for a listing that earned no revenue', async () => {
      const listing = await seedPricedListing('COST-ZERO-REVENUE');
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'PERLIST-COST-ZERO-REVENUE',
        orderedAt: '2026-04-15T03:00:00Z',
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: 0, optionId: listing.optionId, listingOptionId: listing.listingOptionId }],
      });
      await coverOrders();

      // The loss is measured; a margin over zero revenue is not a number.
      expect(await rowFor(listing.listingId)).toMatchObject({
        revenue: 0,
        costOfGoods: 5_000,
        netProfit: -5_000,
        profitRate: null,
      });
    });

    it('reads only orders that a completed Orders collection published', async () => {
      const listing = await seedPricedListing('COST-UNPUBLISHED');
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'PERLIST-PUBLISHED',
        orderedAt: '2026-04-15T03:00:00Z',
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: 10_000, optionId: listing.optionId, listingOptionId: listing.listingOptionId }],
      });
      await coverOrders();
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'PERLIST-UNPUBLISHED',
        orderedAt: '2026-04-16T03:00:00Z',
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: listing.optionId, listingOptionId: listing.listingOptionId }],
      });

      expect(await rowFor(listing.listingId)).toMatchObject({ revenue: 10_000, orderCount: 1 });
    });

    it('withholds profit while advertising applies and the orders cover only part of the window', async () => {
      const listing = await seedPricedListing('COST-PARTIAL-ORDERS-ADS', 'coupang');
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'PERLIST-PARTIAL-ORDERS-ADS',
        orderedAt: '2026-04-15T03:00:00Z',
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: 10_000, optionId: listing.optionId, listingOptionId: listing.listingOptionId }],
      });
      await coverOrders('2026-04-01', '2026-04-20');

      // A whole-month ad cost against twenty days of orders is not a profit.
      expect(await rowFor(listing.listingId, accountEvidence('CONFIRMED_ZERO'))).toMatchObject({
        revenue: 10_000,
        netProfit: null,
        profitRate: null,
      });
    });

    /**
     * KID-85 follow-up P3-5 — the target-day ledger only sweeps active Coupang
     * accounts, so advertising is Not applied to a listing sold elsewhere: an
     * incomplete Coupang sweep or a partly collected month does not withhold it.
     */
    it('keeps the profit of a listing on a channel the Coupang ad sweep cannot cover', async () => {
      const naver = await seedPricedListing('ADS-CHANNEL-NAVER');
      const coupang = await seedPricedListing('ADS-CHANNEL-COUPANG', 'coupang');
      for (const [code, listing] of [['NAVER', naver], ['COUPANG', coupang]] as const) {
        await seedOrderWithLineItems(prisma, {
          orderChannel: 'rocket',
          organizationId: TEST_ORGANIZATION_ID,
          externalOrderId: `PERLIST-ADS-CHANNEL-${code}`,
          orderedAt: '2026-04-15T03:00:00Z',
          shippingPrice: 0,
          lineItems: [{ quantity: 1, totalPrice: 10_000, optionId: listing.optionId, listingOptionId: listing.listingOptionId }],
        });
      }
      await coverOrders('2026-04-01', '2026-04-20');
      const partlySwept = accountEvidence('OBSERVED', false);

      expect(await rowFor(naver.listingId, partlySwept)).toMatchObject({
        adCost: 0,
        netProfit: 5_000,
        profitRate: 50,
      });
      expect(await rowFor(coupang.listingId, partlySwept)).toMatchObject({
        adCost: null,
        netProfit: null,
      });
    });

    /**
     * KID-114 — cost is the recipe priced at the Sellpia purchase price, and
     * whether a sales commission or other per-sale cost applies is decided by
     * the order's channel account (`channelAccountSalesCosts`), never by an
     * option column nobody writes.
     */
    it('publishes the net profit of a Rocket direct-purchase line from its purchase cost alone', async () => {
      const listing = await seedPricedListing('RULE-ROCKET');
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'PERLIST-RULE-ROCKET',
        orderedAt: '2026-04-15T03:00:00Z',
        shippingPrice: 1_000,
        orderChannel: 'rocket',
        lineItems: [{ quantity: 1, totalPrice: 10_000, optionId: listing.optionId, listingOptionId: listing.listingOptionId }],
      });
      await coverOrders();

      // Coupang buys the goods outright: no sales commission and no other
      // per-sale cost apply, so both are 0 by rule.
      expect(await rowFor(listing.listingId)).toMatchObject({
        revenue: 10_000,
        costOfGoods: 5_000,
        commission: 0,
        otherCost: 0,
        shippingCost: 1_000,
        netProfit: 4_000,
        profitRate: 40,
      });
    });

    it('publishes no net profit for a Rocket line whose purchase cost is unknown', async () => {
      const { id: masterId } = await setupMaster(prisma, {
        organizationId: TEST_ORGANIZATION_ID, code: 'M-RULE-UNPRICED', name: 'Master RULE-UNPRICED',
      });
      const sku = { id: randomUUID() };
      await seedSourceProduct(prisma, {
        id: sku.id,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SKU-RULE-UNPRICED',
        name: 'Unpriced component',
      });
      const listing = await setupChannelListing(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId,
        channel: 'naver', externalId: 'EXT-RULE-UNPRICED',
        optionId: sku.id, externalOptionId: 'VI-RULE-UNPRICED',
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'PERLIST-RULE-UNPRICED',
        orderedAt: '2026-04-15T03:00:00Z',
        shippingPrice: 0,
        orderChannel: 'rocket',
        lineItems: [{ quantity: 1, totalPrice: 10_000, optionId: sku.id, listingOptionId: listing.listingOptionId }],
      });
      await coverOrders();

      expect(await rowFor(listing.listingId)).toMatchObject({
        revenue: 10_000,
        costOfGoods: null,
        commission: 0,
        otherCost: 0,
        netProfit: null,
        profitRate: null,
      });
    });

    it('publishes no net profit for a line sold through an account whose commission has no source', async () => {
      const listing = await seedPricedListing('RULE-NAVER');
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'PERLIST-RULE-NAVER',
        orderedAt: '2026-04-15T03:00:00Z',
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: 10_000, optionId: listing.optionId, listingOptionId: listing.listingOptionId }],
      });
      await coverOrders();

      expect(await rowFor(listing.listingId)).toMatchObject({
        revenue: 10_000,
        costOfGoods: 5_000,
        commission: null,
        otherCost: null,
        netProfit: null,
        profitRate: null,
      });
    });

    it('keeps the profit of the collected dates when advertising does not apply', async () => {
      const listing = await seedPricedListing('COST-PARTIAL-ORDERS');
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'PERLIST-PARTIAL-ORDERS',
        orderedAt: '2026-04-15T03:00:00Z',
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: 10_000, optionId: listing.optionId, listingOptionId: listing.listingOptionId }],
      });
      await coverOrders('2026-04-01', '2026-04-20');

      // Revenue and every cost come from the same collected lines.
      expect(await rowFor(listing.listingId)).toMatchObject({
        revenue: 10_000,
        netProfit: 5_000,
        profitRate: 50,
      });
    });
  });

  it('T4: cross-organization isolation — OTHER sentinel never leaks into TEST', async () => {
    // TEST: 1 small order
    const tMaster = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T4', name: 'Master T4' });
    const tOption = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId: tMaster.id, sku: 'SKU-T4', costPrice: 0,
    });
    const tListing = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId: tMaster.id,
      channel: 'coupang', externalId: 'EXT-T4',
      optionId: tOption.id, externalOptionId: 'VI-T4',
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-T-4',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId: tOption.id, listingOptionId: tListing.listingOptionId }],
    });

    // OTHER: sentinel order + sentinel ad
    const oMaster = await setupMaster(prisma, { organizationId: OTHER_ORGANIZATION_ID, code: 'M-O4', name: 'Master O4' });
    const oOption = await setupProductOption(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oMaster.id, sku: 'SKU-O4', costPrice: 0,
    });
    const oListing = await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oMaster.id,
      channel: 'coupang', externalId: 'EXT-O4',
      optionId: oOption.id, externalOptionId: 'VI-O4',
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: OTHER_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-O-4',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oOption.id, listingOptionId: oListing.listingOptionId }],
    });
    await seedAd(prisma, { organizationId: OTHER_ORGANIZATION_ID, listingId: oListing.listingId, date: '2026-04-15', spend: IDOR_SENTINEL });

    await coverOrders();
    await coverOrders(undefined, undefined, OTHER_ORGANIZATION_ID);
    const testResult = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO, accountEvidence('NOT_APPLIED'), new ProductTransactionalReadRepositoryAdapter());
    expect(testResult).toHaveLength(1);
    expect(testResult[0].revenue).toBe(1_000);
    expect(testResult[0].adCost).toBe(0);
    for (const m of testResult) {
      expect(m.revenue).not.toBe(IDOR_SENTINEL);
      expect(m.adCost).not.toBe(IDOR_SENTINEL);
    }

    const otherResult = await buildPerListingMetrics(prisma as unknown as PrismaService, OTHER_ORGANIZATION_ID, FROM, TO, accountEvidence('OBSERVED'), new ProductTransactionalReadRepositoryAdapter());
    expect(otherResult).toHaveLength(1);
    expect(otherResult[0].revenue).toBe(IDOR_SENTINEL);
    expect(otherResult[0].adCost).toBe(IDOR_SENTINEL);
  });
});
