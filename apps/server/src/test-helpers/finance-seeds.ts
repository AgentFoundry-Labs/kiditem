/**
 * Finance domain PG seed helpers — reusable across D.3+ integration specs.
 *
 * Extracted from Plan D.1 T6 (profit-loss.pg.integration.spec.ts) helpers.
 * All helpers are pure data seeders — no business logic.
 *
 * Usage:
 *   import { setupMaster, setupProductOption, setupChannelListing,
 *            seedOrderWithLineItems, seedAd } from '../test-helpers/finance-seeds';
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
    thumbnailUrl?: string | null;
  },
): Promise<{ id: string }> {
  const master = await prisma.masterProduct.create({
    data: {
      organizationId: opts.organizationId,
      code: opts.code,
      name: opts.name,
      category: opts.category ?? null,
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
 *
 * `costPrice` is the Sellpia purchase price, the only cost input a listing
 * option has (KID-114). A sales commission or other per-sale cost is decided
 * by the order's channel account, so no fixture writes one.
 */
export async function setupProductOption(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    masterId: string;
    sku: string;
    costPrice?: number;
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
    channelAccountId?: string;
  },
): Promise<{ listingId: string; listingOptionId: string }> {
  const channelAccount = opts.channelAccountId
    ? await prisma.channelAccount.findFirstOrThrow({
        where: {
          id: opts.channelAccountId,
          organizationId: opts.organizationId,
          channel: opts.channel,
        },
        select: { id: true },
      })
    : await prisma.channelAccount.upsert({
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
      },
    );
  const master = await prisma.masterProduct.findFirstOrThrow({
    where: { id: opts.masterId, organizationId: opts.organizationId },
    select: {
      name: true,
      category: true,
      imageUrls: true,
    },
  });
  await prisma.sellpiaInventorySku.findFirstOrThrow({
    where: {
      id: opts.optionId,
      organizationId: opts.organizationId,
    },
    select: { id: true },
  });
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
    /**
     * Channel of the account the order was collected from. Defaults to the
     * first line's listing account; `'rocket'` models a Rocket
     * direct-purchase order, whose sales carry no commission or other cost.
     */
    orderChannel?: string;
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

  const orderChannelAccountId = opts.orderChannel
    ? (await prisma.channelAccount.upsert({
        where: {
          organizationId_channel_externalAccountId: {
            organizationId: opts.organizationId,
            channel: opts.orderChannel,
            externalAccountId: `test-${opts.orderChannel}`,
          },
        },
        create: {
          organizationId: opts.organizationId,
          channel: opts.orderChannel,
          name: `${opts.orderChannel} test account`,
          externalAccountId: `test-${opts.orderChannel}`,
          isPrimary: true,
        },
        update: {},
        select: { id: true },
      })).id
    : firstListingOption.listing.channelAccountId;

  const order = await prisma.order.create({
    data: {
      organizationId: opts.organizationId,
      channelAccountId: orderChannelAccountId,
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

/**
 * Publish an explicit Order owner coverage window and attach the fixture rows
 * inside that KST business-date range to the completed run. Tests must call
 * this deliberately: observing an order row never proves that the collector
 * exhausted the requested mall/window.
 */
export async function seedCompletedOrderCoverageRun(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    startDate: string;
    endDate: string;
    mallKey?: string;
  },
): Promise<string> {
  const mallKey = opts.mallKey ?? 'dashboard-test-mall';
  const account = await prisma.channelAccount.upsert({
    where: {
      organizationId_channel_externalAccountId: {
        organizationId: opts.organizationId,
        channel: 'order_collection',
        externalAccountId: mallKey,
      },
    },
    create: {
      organizationId: opts.organizationId,
      channel: 'order_collection',
      name: mallKey,
      externalAccountId: mallKey,
      isPrimary: false,
    },
    update: {},
    select: { id: true },
  });
  const run = await prisma.sourceImportRun.create({
    data: {
      organizationId: opts.organizationId,
      sourceType: 'order_collection_mall',
      channelAccountId: account.id,
      status: 'completed',
      coverageStartDate: new Date(`${opts.startDate}T00:00:00.000Z`),
      coverageEndDate: new Date(`${opts.endDate}T00:00:00.000Z`),
      plan: { mallKey, testCoverage: true },
      importedAt: new Date(`${opts.endDate}T15:00:00.000Z`),
    },
    select: { id: true },
  });
  const from = new Date(`${opts.startDate}T00:00:00+09:00`);
  const through = new Date(`${opts.endDate}T00:00:00+09:00`);
  const to = new Date(through.getTime() + 86_400_000);
  const attached = await prisma.order.updateMany({
    where: {
      organizationId: opts.organizationId,
      orderedAt: { gte: from, lt: to },
    },
    data: { sourceImportRunId: run.id },
  });
  await prisma.sourceImportRun.update({
    where: { id: run.id },
    data: { providerBackedEmptyProof: attached.count === 0 },
  });
  return run.id;
}

/** Publish every current fixture SKU as one verified Inventory generation. */
export async function seedCompletedInventorySnapshot(
  prisma: PrismaClient,
  organizationId: string,
): Promise<string> {
  const verifiedAt = new Date();
  const run = await prisma.sourceImportRun.create({
    data: {
      organizationId,
      sourceType: 'sellpia_inventory',
      status: 'completed',
      freshnessGeneration: 1n,
      importedAt: verifiedAt,
      lastVerifiedAt: verifiedAt,
    },
    select: { id: true },
  });
  await prisma.sellpiaInventorySku.updateMany({
    where: { organizationId },
    data: { lastImportRunId: run.id },
  });
  await prisma.sellpiaInventoryState.upsert({
    where: { organizationId },
    create: {
      organizationId,
      sourceAccountKey: 'dashboard-test',
      verifiedGeneration: 1n,
      lastVerifiedAt: verifiedAt,
      lastCompletedImportRunId: run.id,
    },
    update: {
      verifiedGeneration: 1n,
      lastVerifiedAt: verifiedAt,
      lastCompletedImportRunId: run.id,
    },
  });
  return run.id;
}

// ---------------------------------------------------------------------------
// seedCompletedOrderCollection — explicit mall coverage for selected order fixtures
// ---------------------------------------------------------------------------

/** Declare measured order coverage independently from the order-row dates. */
export async function seedCompletedOrderCollection(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    startDate: string;
    endDate: string;
    orderIds: readonly string[];
  },
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const account = await tx.channelAccount.create({
      data: {
        organizationId: opts.organizationId,
        channel: 'order_collection',
        name: 'Measured finance order fixture',
        externalAccountId: 'finance-fixture-mall',
      },
    });
    const run = await tx.sourceImportRun.create({
      data: {
        organizationId: opts.organizationId,
        channelAccountId: account.id,
        sourceType: 'order_collection_mall',
        status: 'completed',
        importedAt: new Date(`${opts.endDate}T15:00:00.000Z`),
        coverageStartDate: new Date(`${opts.startDate}T00:00:00.000Z`),
        coverageEndDate: new Date(`${opts.endDate}T00:00:00.000Z`),
      },
    });
    // The run owns the orders it published; each order keeps the channel
    // account it was sold through, which decides whether a sales commission
    // and other per-sale cost apply to its lines (KID-114).
    await tx.order.updateMany({
      where: { organizationId: opts.organizationId, id: { in: [...opts.orderIds] } },
      data: { sourceImportRunId: run.id },
    });
    return run.id;
  });
}

// ---------------------------------------------------------------------------
// seedAd — daily ad spend record
// ---------------------------------------------------------------------------

/**
 * Seed one measured listing-day ad fact in the advertising target-day ledger
 * (`ChannelAdTargetDailySnapshot`, product grain). Every reader of listing-day
 * ad values goes through `advertising/read/ad-target-facts`, so a spec that seeds here
 * observes `getTrend(...).adCost` / `salesAnalysis.totalCost` and friends.
 *
 * A measured day needs both a row and a completed sweep declaration. By
 * default this helper creates or reuses a one-day completed test sweep. Pass
 * the id from `seedCompletedAdSweepRun` to attach the row to a wider declared
 * window, or pass `runId: null` explicitly to seed preserved legacy data that
 * has no completeness proof. Pass `collected: false` to remove rows seeded
 * earlier for that listing-day.
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
    /**
     * Whether the provider grid carried a conversion-count column. The owner
     * stamps this on every published target row; `false` stores the column's
     * 0 as unobserved.
     */
    conversionsObserved?: boolean;
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
  let runId = opts.runId;
  if (runId === undefined) {
    const candidates = await prisma.sourceImportRun.findMany({
      where: {
        organizationId: opts.organizationId,
        sourceType: 'coupang_ad_campaign',
        channelAccountId: listing.channelAccountId,
        status: 'completed',
        parserVersion: 'ad-campaign-v1',
        coverageStartDate: { lte: businessDate },
        coverageEndDate: { gte: businessDate },
      },
      select: { id: true, plan: true, freshnessGeneration: true },
    });
    const declared = candidates
      .filter((candidate) => {
        const plan = candidate.plan;
        return !!plan && typeof plan === 'object' && !Array.isArray(plan)
          && plan.captureMode === 'campaign_sweep';
      })
      .sort((left, right) => {
        const a = left.freshnessGeneration ?? -1n;
        const b = right.freshnessGeneration ?? -1n;
        return a === b ? 0 : a > b ? -1 : 1;
      })[0];
    runId = declared?.id ?? (
      await prisma.sourceImportRun.create({
        data: {
          organizationId: opts.organizationId,
          sourceType: 'coupang_ad_campaign',
          channelAccountId: listing.channelAccountId,
          status: 'completed',
          parserVersion: 'ad-campaign-v1',
          plan: {
            captureMode: 'campaign_sweep',
            startDate: opts.date,
            endDate: opts.date,
            businessDates: [opts.date],
            testSeedAdWindow: true,
          },
          coverageStartDate: businessDate,
          coverageEndDate: businessDate,
          importedAt: businessDate,
        },
        select: { id: true },
      })
    ).id;
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
      sourceImportRunId: runId,
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
      sourceImportRunId: runId,
      metaJson: {
        data: {
          granularity: 'product',
          conversionsObserved: opts.conversionsObserved ?? true,
        },
      },
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
 * earlier one for every date its window covers. Legacy rows and rows attached
 * to the one-day test sweeps created by `seedAd` are adopted inside the
 * declared window, so a spec may seed target rows first and declare the wider
 * window after.
 */
export async function seedCompletedAdSweepRun(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    channelAccountId?: string;
    generation: number;
    status?: 'completed' | 'running' | 'failed';
    /** The window the sweep declares it swept; every date in it is measured. */
    window?: { startDate: string; endDate: string };
    /** The last date the sweep requested, when it held back days after its window. */
    requestedEndDate?: string;
  },
): Promise<string> {
  const account = await prisma.channelAccount.findFirstOrThrow({
    where: {
      organizationId: opts.organizationId,
      channel: 'coupang',
      ...(opts.channelAccountId ? { id: opts.channelAccountId } : {}),
    },
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
      plan: {
        captureMode: 'campaign_sweep',
        ...(opts.window ?? {}),
        ...(opts.requestedEndDate ? { endDate: opts.requestedEndDate } : {}),
      },
      freshnessGeneration: BigInt(opts.generation),
      ...(opts.window && (opts.status ?? 'completed') === 'completed'
        ? {
            coverageStartDate: new Date(`${opts.window.startDate}T00:00:00.000Z`),
            coverageEndDate: new Date(`${opts.window.endDate}T00:00:00.000Z`),
          }
        : {}),
      importedAt: new Date(),
    },
    select: { id: true },
  });
  if (opts.window && (opts.status ?? 'completed') === 'completed') {
    const oneDayTestRuns = (
      await prisma.sourceImportRun.findMany({
        where: {
          organizationId: opts.organizationId,
          sourceType: 'coupang_ad_campaign',
          channelAccountId: account.id,
          status: 'completed',
        },
        select: { id: true, plan: true },
      })
    ).filter(({ id, plan }) => {
      if (id === run.id || !plan || typeof plan !== 'object' || Array.isArray(plan)) return false;
      return plan.testSeedAdWindow === true;
    }).map(({ id }) => id);
    await prisma.channelAdTargetDailySnapshot.updateMany({
      where: {
        organizationId: opts.organizationId,
        channelAccountId: account.id,
        OR: [
          { sourceImportRunId: null },
          ...(oneDayTestRuns.length > 0
            ? [{ sourceImportRunId: { in: oneDayTestRuns } }]
            : []),
        ],
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
