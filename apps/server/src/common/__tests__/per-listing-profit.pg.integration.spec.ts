import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildPerListingMetrics } from '../per-listing-profit';
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
} from '../../test-helpers/finance-seeds';

/**
 * Plan F1 T1 — buildPerListingMetrics (PG integration).
 *
 * Verifies the helper produces correct per-listing rollups from Order +
 * OrderLineItem + ChannelListing + MasterProduct + ProductOption + Ad,
 * with organizationId scoping (ADR-0018) and revenue-weighted shipping (R-1).
 */
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

  // April 2026 window: from 2026-04-01 to 2026-05-01
  const FROM = new Date('2026-04-01T00:00:00Z');
  const TO = new Date('2026-05-01T00:00:00Z');

  it('T1: single listing × 1 order × 1 lineItem → metrics math', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T1', name: 'Master T1', abcGrade: 'A', category: 'Toy',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: 'SKU-T1', costPrice: 50_000, commissionRate: 0.1, otherCost: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T1', channelName: '쿠팡',
      optionId, externalOptionId: 'VI-T1',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-T-1',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 10_000,
      lineItems: [{ quantity: 1, totalPrice: 100_000, optionId, listingOptionId }],
    });

    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO);

    expect(result).toHaveLength(1);
    const m = result[0];
    expect(m.listingId).toBe(listingId);
    expect(m.channelName).toBe('쿠팡');
    expect(m.channel).toBe('coupang');
    expect(m.masterName).toBe('Master T1');
    expect(m.grade).toBe('A');
    expect(m.revenue).toBe(100_000);
    expect(m.costOfGoods).toBe(50_000);          // 50_000 × 1
    expect(m.commission).toBe(10_000);           // 100_000 × 0.1
    expect(m.shippingCost).toBe(10_000);         // sole lineItem → entire shipping
    expect(m.adCost).toBe(0);                    // no Ad seeded
    expect(m.otherCost).toBe(0);
    expect(m.netProfit).toBe(30_000);            // 100k - 50k - 10k - 10k - 0 - 0
    expect(m.profitRate).toBe(30.0);             // 30000/100000 * 100 = 30.0
    expect(m.orderCount).toBe(1);
  });

  it('T2: 2 orders × 1 listing → revenue-weighted shipping distribution', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T2', name: 'Master T2',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: 'SKU-T2', costPrice: 0, commissionRate: 0, otherCost: 0,
    });
    const { listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T2',
      optionId, externalOptionId: 'VI-T2',
    });
    // Order 1: shipping 3000, single lineItem 9000 → entire ship = 3000
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-T-2a',
      orderedAt: '2026-04-10T03:00:00Z',
      shippingPrice: 3_000,
      lineItems: [{ quantity: 1, totalPrice: 9_000, optionId, listingOptionId }],
    });
    // Order 2: shipping 5000, single lineItem 1000 → entire ship = 5000 (single lineItem absorbs all)
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-T-2b',
      orderedAt: '2026-04-20T03:00:00Z',
      shippingPrice: 5_000,
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId, listingOptionId }],
    });

    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO);

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
      sku: 'SKU-T3', costPrice: 0, commissionRate: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T3',
      optionId, externalOptionId: 'VI-T3',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-T-3',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 100_000, optionId, listingOptionId }],
    });
    // Two ads on different days → sum
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId, date: '2026-04-12', spend: 8_000 });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId, date: '2026-04-22', spend: 12_000 });

    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO);

    expect(result).toHaveLength(1);
    expect(result[0].adCost).toBe(20_000);
    expect(result[0].netProfit).toBe(80_000);           // 100k - 0 - 0 - 0 - 20k - 0
  });

  it('T5: EXCLUDED_ORDER_STATUSES filter — cancelled/returned/refunded orders are excluded', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T5', name: 'Master T5',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId, sku: 'SKU-T5', costPrice: 0, commissionRate: 0,
    });
    const { listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T5',
      optionId, externalOptionId: 'VI-T5',
    });
    // 1 paid (included), 3 excluded statuses (each one a sentinel)
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'PERLIST-T-5-PAID',
      orderedAt: '2026-04-15T03:00:00Z', shippingPrice: 0, status: 'paid',
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId, listingOptionId }],
    });
    for (const status of ['cancelled', 'returned', 'refunded']) {
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID, externalOrderId: `PERLIST-T-5-${status.toUpperCase()}`,
        orderedAt: '2026-04-15T03:00:00Z', shippingPrice: 0, status,
        lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId, listingOptionId }],
      });
    }

    const result = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO);
    expect(result).toHaveLength(1);
    expect(result[0].revenue).toBe(1_000);                    // only the paid order
    expect(result[0].revenue).not.toBe(IDOR_SENTINEL);        // excluded statuses' totalPrice never appears
    expect(result[0].orderCount).toBe(1);                     // 3 excluded orders dropped
  });

  it('T4: cross-organization isolation — OTHER sentinel never leaks into TEST', async () => {
    // TEST: 1 small order
    const tMaster = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T4', name: 'Master T4' });
    const tOption = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId: tMaster.id, sku: 'SKU-T4', costPrice: 0, commissionRate: 0,
    });
    const tListing = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId: tMaster.id,
      channel: 'coupang', externalId: 'EXT-T4',
      optionId: tOption.id, externalOptionId: 'VI-T4',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-T-4',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId: tOption.id, listingOptionId: tListing.listingOptionId }],
    });

    // OTHER: sentinel order + sentinel ad
    const oMaster = await setupMaster(prisma, { organizationId: OTHER_ORGANIZATION_ID, code: 'M-O4', name: 'Master O4' });
    const oOption = await setupProductOption(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oMaster.id, sku: 'SKU-O4', costPrice: 0, commissionRate: 0,
    });
    const oListing = await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oMaster.id,
      channel: 'coupang', externalId: 'EXT-O4',
      optionId: oOption.id, externalOptionId: 'VI-O4',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      externalOrderId: 'PERLIST-O-4',
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oOption.id, listingOptionId: oListing.listingOptionId }],
    });
    await seedAd(prisma, { organizationId: OTHER_ORGANIZATION_ID, listingId: oListing.listingId, date: '2026-04-15', spend: IDOR_SENTINEL });

    const testResult = await buildPerListingMetrics(prisma as unknown as PrismaService, TEST_ORGANIZATION_ID, FROM, TO);
    expect(testResult).toHaveLength(1);
    expect(testResult[0].revenue).toBe(1_000);
    expect(testResult[0].adCost).toBe(0);
    for (const m of testResult) {
      expect(m.revenue).not.toBe(IDOR_SENTINEL);
      expect(m.adCost).not.toBe(IDOR_SENTINEL);
    }

    const otherResult = await buildPerListingMetrics(prisma as unknown as PrismaService, OTHER_ORGANIZATION_ID, FROM, TO);
    expect(otherResult).toHaveLength(1);
    expect(otherResult[0].revenue).toBe(IDOR_SENTINEL);
    expect(otherResult[0].adCost).toBe(IDOR_SENTINEL);
  });
});
