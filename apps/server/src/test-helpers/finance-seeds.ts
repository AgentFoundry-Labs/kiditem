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
 * Seed one measured listing-day ad fact in the advertising target-day ledger
 * (`ChannelAdTargetDailySnapshot`, product grain). Every reader of listing-day
 * ad values goes through `common/ad-window-facts`, so a spec that seeds here
 * observes `getTrend(...).adCost` / `salesAnalysis.totalCost` and friends.
 *
 * A measured day is a row; an uncollected day is the absence of one. Pass
 * `collected: false` to remove any row seeded earlier for that listing-day,
 * which is the only way to express "the source never reported this day".
 *
 * Without `runId` the row is a legacy (pre-cutover) fact, which the reader
 * admits as measured. Pass the id from `seedCompletedAdSweepRun` to attach it
 * to a completed campaign-sweep generation.
 *
 * Returns the target row id, or `null` when `collected: false`.
 */
export async function seedAd(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    listingId: string;
    date: string;              // ISO date string (e.g. '2026-04-15')
    spend: number;
    revenue?: number;
    impressions?: number;
    clicks?: number;
    conversions?: number;
    orders?: number;
    collected?: boolean;
    runId?: string | null;
    /** Distinguishes several product rows of one listing on one day (options). */
    targetKey?: string;
  },
): Promise<string | null> {
  const listing = await prisma.channelListing.findFirstOrThrow({
    where: { id: opts.listingId, organizationId: opts.organizationId },
    select: {
      externalId: true,
      channelAccountId: true,
      channelAccount: { select: { channel: true } },
    },
  });
  const businessDate = new Date(`${opts.date}T00:00:00.000Z`);
  const targetKey = opts.targetKey ?? `product:${opts.listingId}`;
  if (opts.collected === false) {
    await prisma.channelAdTargetDailySnapshot.deleteMany({
      where: {
        organizationId: opts.organizationId,
        listingId: opts.listingId,
        businessDate,
        targetKey,
      },
    });
    return null;
  }
  const metrics = {
    spend: opts.spend,
    adSpend: opts.spend,
    revenue: opts.revenue ?? 0,
    adRevenue: opts.revenue ?? 0,
    impressions: opts.impressions ?? 0,
    clicks: opts.clicks ?? 0,
    conversions: opts.conversions ?? 0,
    orders: opts.orders ?? 0,
    lastObservedAt: businessDate,
  };
  const existing = await prisma.channelAdTargetDailySnapshot.findFirst({
    where: {
      organizationId: opts.organizationId,
      listingId: opts.listingId,
      businessDate,
      targetKey,
      sourceImportRunId: opts.runId ?? null,
    },
    select: { id: true },
  });
  if (existing) {
    await prisma.channelAdTargetDailySnapshot.update({ where: { id: existing.id }, data: metrics });
    return existing.id;
  }
  const row = await prisma.channelAdTargetDailySnapshot.create({
    data: {
      organizationId: opts.organizationId,
      channelAccountId: listing.channelAccountId,
      channel: listing.channelAccount.channel,
      businessDate,
      listingId: opts.listingId,
      externalId: listing.externalId,
      targetType: 'product',
      targetKey,
      sourceImportRunId: opts.runId ?? null,
      metaJson: { data: { granularity: 'product' } },
      firstObservedAt: businessDate,
      ...metrics,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Seed one completed campaign-sweep generation for the organization's Coupang
 * account, as `completeAdCampaignSourceIds` recognises it. Rows attached to it
 * through `seedAd({ runId })` are measured; a later generation supersedes an
 * earlier one for every date its window covers. Run-less rows already seeded
 * inside the declared window are adopted by the new run, the way a real sweep
 * publishes the rows it found, so a spec may seed rows first and declare the
 * window after.
 */
export async function seedCompletedAdSweepRun(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    generation: number;
    status?: 'completed' | 'running' | 'failed';
    /** The window the sweep declares it swept; every date in it is measured. */
    window?: { startDate: string; endDate: string };
  },
): Promise<string> {
  const account = await prisma.channelAccount.findFirstOrThrow({
    where: { organizationId: opts.organizationId, channel: 'coupang' },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  const run = await prisma.sourceImportRun.create({
    data: {
      organizationId: opts.organizationId,
      sourceType: 'coupang_ad_campaign',
      channelAccountId: account.id,
      status: opts.status ?? 'completed',
      parserVersion: 'ad-campaign-v1',
      plan: { captureMode: 'campaign_sweep', ...(opts.window ?? {}) },
      freshnessGeneration: BigInt(opts.generation),
      ...(opts.window
        ? {
            coverageStartDate: new Date(`${opts.window.startDate}T00:00:00.000Z`),
            coverageEndDate: new Date(`${opts.window.endDate}T00:00:00.000Z`),
          }
        : {}),
      importedAt: new Date(),
    },
    select: { id: true },
  });
  if (opts.window) {
    await prisma.channelAdTargetDailySnapshot.updateMany({
      where: {
        organizationId: opts.organizationId,
        channelAccountId: account.id,
        sourceImportRunId: null,
        businessDate: {
          gte: new Date(`${opts.window.startDate}T00:00:00.000Z`),
          lte: new Date(`${opts.window.endDate}T00:00:00.000Z`),
        },
      },
      data: { sourceImportRunId: run.id },
    });
  }
  return run.id;
}

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
