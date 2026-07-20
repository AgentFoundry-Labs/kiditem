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
 * The final model has no inventory-side ProductOption. Create one reusable
 * ProductVariant backed by one physical SellpiaInventorySku and return the
 * variant ID. setupChannelListing links its channel option to that variant.
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
  const existingVariantCount = await prisma.productVariant.count({
    where: { organizationId: opts.organizationId, masterProductId: opts.masterId },
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
  const variant = await prisma.productVariant.create({
    data: {
      organizationId: opts.organizationId,
      masterProductId: opts.masterId,
      code: opts.sku,
      name: `${master.name} ${opts.sku}`,
      optionLabel: opts.sku,
      isDefault: existingVariantCount === 0,
    },
    select: { id: true },
  });
  await prisma.productVariantComponent.create({
    data: {
      organizationId: opts.organizationId,
      productVariantId: variant.id,
      sellpiaInventorySkuId: inventorySku.id,
      quantity: 1,
      source: 'deterministic',
    },
  });
  return variant;
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
  const variant = await prisma.productVariant.findFirstOrThrow({
    where: {
      id: opts.optionId,
      organizationId: opts.organizationId,
      masterProductId: opts.masterId,
    },
    select: {
      components: {
        select: {
          sellpiaInventorySku: { select: { rawJson: true } },
        },
        take: 1,
      },
    },
  });
  const rawPricing = variant.components[0]?.sellpiaInventorySku.rawJson;
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
      productVariantId: opts.optionId,
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
 * Returns the daily-fact row ID.
 */
export async function seedAd(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    listingId: string;
    date: string;              // ISO date string (e.g. '2026-04-15')
    spend: number;
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
    },
    update: { adSpend: opts.spend },
    select: { id: true },
  });
  return row.id;
}
