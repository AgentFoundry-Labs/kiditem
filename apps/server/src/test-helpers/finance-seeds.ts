/**
 * Finance domain PG seed helpers — reusable across D.3+ integration specs.
 *
 * Extracted from Plan D.1 T6 (profit-loss.pg.integration.spec.ts) helpers.
 * All helpers are pure data seeders — no business logic.
 *
 * Usage:
 *   import { setupMaster, setupProductOption, setupChannelListing,
 *            seedOrderWithLineItems, seedReturn, seedAd } from '../test-helpers/finance-seeds';
 */
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// setupMaster — MasterProduct
// ---------------------------------------------------------------------------

/**
 * Create a minimal MasterProduct for a organization.
 */
export async function setupMaster(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    code: string;
    name: string;
    legacyCode?: string | null;
    category?: string | null;
    abcGrade?: string | null;
    thumbnailUrl?: string | null;
  },
): Promise<{ id: string }> {
  const master = await prisma.masterProduct.create({
    data: {
      organizationId: opts.organizationId,
      code: opts.code,
      name: opts.name,
      category: opts.category ?? null,
      abcGrade: opts.abcGrade ?? null,
      imageUrls: opts.thumbnailUrl ? [opts.thumbnailUrl] : [],
      tags: opts.legacyCode ? [`legacy:${opts.legacyCode}`] : [],
    },
    select: { id: true },
  });
  return { id: master.id };
}

// ---------------------------------------------------------------------------
// setupProductOption — legacy test helper compatibility
// ---------------------------------------------------------------------------

/**
 * Create one physical SellpiaInventorySku and return its ID. The channel
 * listing helper attaches it directly to the sellable channel option.
 */
export async function setupProductOption(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    masterId: string;
    sku: string;
    costPrice?: number;
    commissionRate?: number;
    otherCost?: number;
  },
): Promise<{ id: string }> {
  const master = await prisma.masterProduct.findFirstOrThrow({
    where: { id: opts.masterId, organizationId: opts.organizationId },
    select: { code: true, name: true },
  });
  const inventorySku = await prisma.sellpiaInventorySku.create({
    data: {
      organizationId: opts.organizationId,
      code: opts.sku,
      name: master.name,
      optionName: opts.sku,
      currentStock: 100,
      purchasePrice: opts.costPrice ?? 5000,
      rawJson: {
        testPricing: {
          commissionRate: opts.commissionRate ?? 0.1,
          otherCost: opts.otherCost ?? 0,
        },
      },
    },
    select: { id: true },
  });
  return inventorySku;
}

// ---------------------------------------------------------------------------
// setupChannelListing — ChannelListing + ChannelListingOption
// ---------------------------------------------------------------------------

/**
 * Create a ChannelListing with one ChannelListingOption.
 * Returns both IDs for use in order/ad seeding.
 */
export async function setupChannelListing(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    masterId: string;
    channel: string;
    externalId: string;
    channelName?: string | null;
    optionId: string;
    externalOptionId: string;
  },
): Promise<{ listingId: string; listingOptionId: string }> {
  const channelAccount = await prisma.channelAccount.upsert({
    where: {
      organizationId_channel_externalAccountId: {
        organizationId: opts.organizationId,
        channel: opts.channel,
        externalAccountId: `test-${opts.channel}`,
      },
    },
    create: {
      organizationId: opts.organizationId,
      channel: opts.channel,
      name: `${opts.channel} test account`,
      externalAccountId: `test-${opts.channel}`,
      isPrimary: true,
    },
    update: {},
    select: { id: true },
  });
  const master = await prisma.masterProduct.findFirstOrThrow({
    where: { id: opts.masterId, organizationId: opts.organizationId },
    select: {
      name: true,
      category: true,
      abcGrade: true,
      imageUrls: true,
    },
  });
  const inventorySku = await prisma.sellpiaInventorySku.findFirstOrThrow({
    where: {
      id: opts.optionId,
      organizationId: opts.organizationId,
    },
    select: { rawJson: true },
  });
  const rawPricing = inventorySku.rawJson;
  const pricing =
    rawPricing &&
    typeof rawPricing === 'object' &&
    !Array.isArray(rawPricing) &&
    'testPricing' in rawPricing &&
    rawPricing.testPricing &&
    typeof rawPricing.testPricing === 'object' &&
    !Array.isArray(rawPricing.testPricing)
      ? rawPricing.testPricing
      : {};
  const listing = await prisma.channelListing.create({
    data: {
      organizationId: opts.organizationId,
      channelAccountId: channelAccount.id,
      masterProductId: opts.masterId,
      externalId: opts.externalId,
      displayName: master.name,
      category: master.category,
      ...(opts.channelName !== undefined && { channelName: opts.channelName }),
    },
    select: { id: true },
  });

  if (master.imageUrls[0]) {
    await prisma.thumbnail.create({
      data: {
        organizationId: opts.organizationId,
        listingId: listing.id,
        imageUrl: master.imageUrls[0],
      },
    });
  }

  const listingOption = await prisma.channelListingOption.create({
    data: {
      organizationId: opts.organizationId,
      listingId: listing.id,
      externalOptionId: opts.externalOptionId,
      sellerSku: opts.externalOptionId,
      commissionRate:
        'commissionRate' in pricing
          ? Number(pricing.commissionRate)
          : 0.1,
      otherCost:
        'otherCost' in pricing ? Number(pricing.otherCost) : 0,
    },
    select: { id: true },
  });
  await prisma.channelListingOptionInventoryComponent.create({
    data: {
      organizationId: opts.organizationId,
      channelListingOptionId: listingOption.id,
      sellpiaInventorySkuId: opts.optionId,
      quantity: 1,
    },
  });

  return { listingId: listing.id, listingOptionId: listingOption.id };
}

// ---------------------------------------------------------------------------
// seedOrderWithLineItems — Order + N OrderLineItem
// ---------------------------------------------------------------------------

/**
 * Create an Order with nested OrderLineItems atomically.
 * Returns the created order ID.
 */
export async function seedOrderWithLineItems(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    externalOrderId: string;
    platform?: string;
    orderedAt: string;         // ISO date string
    shippingPrice?: number;
    status?: string;
    lineItems: Array<{
      quantity: number;
      totalPrice: number;
      optionId: string;
      listingOptionId: string;
    }>;
  },
): Promise<string> {
  const status = opts.status ?? 'accepted';
  const shippingPrice = opts.shippingPrice ?? 3000;
  const totalPrice = opts.lineItems.reduce((s, li) => s + li.totalPrice, 0);
  const firstListingOption = await prisma.channelListingOption.findFirstOrThrow({
    where: {
      id: opts.lineItems[0]?.listingOptionId,
      organizationId: opts.organizationId,
    },
    select: { listing: { select: { channelAccountId: true } } },
  });

  const order = await prisma.order.create({
    data: {
      organizationId: opts.organizationId,
      channelAccountId: firstListingOption.listing.channelAccountId,
      externalOrderId: opts.externalOrderId,
      orderedAt: new Date(opts.orderedAt),
      status,
      shippingPrice,
      totalPrice,
    },
    select: { id: true },
  });

  let lineIdx = 0;
  for (const li of opts.lineItems) {
    await prisma.orderLineItem.create({
      data: {
        organizationId: opts.organizationId,
        orderId: order.id,
        listingOptionId: li.listingOptionId,
        productName: li.optionId,
        quantity: li.quantity,
        unitPrice: li.totalPrice,
        totalPrice: li.totalPrice,
        externalLineId: `LI-${order.id}-${lineIdx++}`,
      },
    });
  }

  return order.id;
}

// ---------------------------------------------------------------------------
// seedReturn — OrderReturn (+ optional OrderReturnLineItem rows)
// ---------------------------------------------------------------------------

/**
 * Create an OrderReturn with optional ReturnLineItems.
 * `orderId: null` creates an orphan return.
 * Returns the created return ID.
 */
export async function seedReturn(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    orderId: string | null;
    requestedAt: string;       // ISO date string
    lineItems?: Array<{ orderLineItemId: string | null }>;
  },
): Promise<string> {
  const channelAccountId = opts.orderId
    ? (
        await prisma.order.findFirstOrThrow({
          where: { id: opts.orderId, organizationId: opts.organizationId },
          select: { channelAccountId: true },
        })
      ).channelAccountId
    : (
        await prisma.channelAccount.findFirstOrThrow({
          where: { organizationId: opts.organizationId, channel: 'coupang' },
          select: { id: true },
        })
      ).id;
  const orderReturn = await prisma.orderReturn.create({
    data: {
      organizationId: opts.organizationId,
      orderId: opts.orderId,
      channelAccountId,
      externalReturnId: `RET-${Date.now()}-${Math.random()}`,
      requestedAt: new Date(opts.requestedAt),
      status: 'requested',
      reason: 'test',
      type: 'RETURN',
      faultBy: 'CUSTOMER',
    },
    select: { id: true },
  });

  if (opts.lineItems && opts.lineItems.length > 0) {
    for (const li of opts.lineItems) {
      await prisma.orderReturnLineItem.create({
        data: {
          organizationId: opts.organizationId,
          returnId: orderReturn.id,
          orderLineItemId: li.orderLineItemId,
          productName: 'returned item',
          quantity: 1,
        },
      });
    }
  }

  return orderReturn.id;
}

// ---------------------------------------------------------------------------
// seedAd — daily ad spend record
// ---------------------------------------------------------------------------

/**
 * Seed a per-listing/per-day ad spend row. Writes
 * `ChannelListingDailySnapshot` (daily-fact source-of-truth). Read paths in
 * dashboard / finance / advertising aggregate the additive `adSpend` column,
 * so call sites observe `getTrend(...).adCost` /
 * `salesAnalysis.totalCost` numbers from this seed.
 *
 * The row carries ad provenance by default, matching what the real ingest
 * writer records: coverage-aware readers (ADR-0003) only count `adSpend` from a
 * row whose `adCoverageStatus`/`adObservedAt` say the source reported it. Pass
 * `collected: false` to seed the uncollected row an unfiltered `SUM(adSpend)`
 * cannot tell apart from a measured zero.
 *
 * Returns the daily-fact row ID.
 */
export async function seedAd(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    listingId: string;
    date: string;              // ISO date string (e.g. '2026-04-15')
    spend: number;
    collected?: boolean;
  },
): Promise<string> {
  const listing = await prisma.channelListing.findFirstOrThrow({
    where: { id: opts.listingId, organizationId: opts.organizationId },
    select: {
      externalId: true,
      channelAccount: { select: { channel: true } },
    },
  });
  const businessDate = new Date(opts.date);
  // Mirrors `ChannelListingDailyRepositoryAdapter`: a reported non-zero value is
  // OBSERVED, a reported zero is CONFIRMED_ZERO, and both carry an observation
  // timestamp. An uncollected row carries neither.
  const adProvenance = opts.collected === false
    ? { adCoverageStatus: null, adObservedAt: null }
    : {
        adCoverageStatus: opts.spend !== 0 ? 'OBSERVED' : 'CONFIRMED_ZERO',
        adObservedAt: businessDate,
      };
  const row = await prisma.channelListingDailySnapshot.upsert({
    where: {
      organizationId_listingId_businessDate: {
        organizationId: opts.organizationId,
        listingId: opts.listingId,
        businessDate,
      },
    },
    create: {
      organizationId: opts.organizationId,
      listingId: opts.listingId,
      channel: listing.channelAccount.channel,
      externalId: listing.externalId,
      businessDate,
      adSpend: opts.spend,
      ...adProvenance,
    },
    update: { adSpend: opts.spend, ...adProvenance },
    select: { id: true },
  });
  return row.id;
}

// ---------------------------------------------------------------------------
// seedPublishedAdAccountDay — Advertising's account-level publication
// ---------------------------------------------------------------------------

/**
 * Publish one complete account-level ad day the way the `coupang_ads_daily`
 * source owner does: a completed `SourceImportRun` for the organization's
 * active Coupang account plus a `coupang_ads` / `dashboard_daily`
 * `ChannelScrapeSnapshot` carrying full observed-metric evidence.
 *
 * Without one of these the owner answers `MISSING` — an advertising account
 * that published nothing — which is absent evidence, never an ad cost of zero.
 * `adSpend: 0` makes the day an explicit zero (`CONFIRMED_ZERO`); a non-zero
 * spend makes the window `OBSERVED`.
 */
export async function seedPublishedAdAccountDay(
  prisma: PrismaClient,
  opts: { organizationId: string; date: string; adSpend?: number },
): Promise<void> {
  const account = await prisma.channelAccount.findFirstOrThrow({
    where: {
      organizationId: opts.organizationId,
      channel: 'coupang',
      status: 'active',
    },
    select: { id: true },
  });
  const businessDate = new Date(`${opts.date}T00:00:00.000Z`);
  const parserVersion = 'ad-account-daily-kpi-v2';
  // One completed attempt publishes every day of its window, exactly as a real
  // collection does — and `(organization, sourceType, account, generation)` is
  // unique, so repeated days reuse it rather than inventing a second attempt.
  const sourceImportRun = await prisma.sourceImportRun.findFirst({
    where: {
      organizationId: opts.organizationId,
      sourceType: 'coupang_ads_daily',
      channelAccountId: account.id,
      status: 'completed',
    },
    select: { id: true },
  }) ?? await prisma.sourceImportRun.create({
    data: {
      organizationId: opts.organizationId,
      sourceType: 'coupang_ads_daily',
      channelAccountId: account.id,
      status: 'completed',
      rowCount: 1,
      freshnessGeneration: 1n,
      parserVersion,
      coverageStartDate: businessDate,
      coverageEndDate: businessDate,
      importedAt: new Date(`${opts.date}T12:00:00.000Z`),
    },
    select: { id: true },
  });
  const scrapeRun = await prisma.channelScrapeRun.create({
    data: {
      organizationId: opts.organizationId,
      channelAccountId: account.id,
      sourceImportRunId: sourceImportRun.id,
      channel: 'coupang',
      source: 'coupang_ads',
      pageType: 'dashboard_daily',
      businessDate,
      periodStart: businessDate,
      periodEnd: businessDate,
      status: 'completed',
      period: '1d',
      parserVersion,
    },
    select: { id: true },
  });
  const adSpend = opts.adSpend ?? 0;
  await prisma.channelScrapeSnapshot.create({
    data: {
      organizationId: opts.organizationId,
      sourceImportRunId: sourceImportRun.id,
      scrapeRunId: scrapeRun.id,
      channel: 'coupang',
      source: 'coupang_ads',
      pageType: 'dashboard_daily',
      businessDate,
      observedAt: new Date(`${opts.date}T12:00:00.000Z`),
      matchStatus: 'unmatched',
      rawJson: { date: opts.date },
      normalizedJson: {
        adSpend,
        adRevenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        orders: 0,
        providerRoas: null,
        providerCtr: null,
        providerConversionRate: null,
        observedMetrics: {
          adSpend: true,
          adRevenue: true,
          impressions: true,
          clicks: true,
          conversions: true,
          orders: true,
        },
      },
    },
  });
}
