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
      ...(opts.legacyCode !== undefined && { legacyCode: opts.legacyCode }),
      ...(opts.category !== undefined && { category: opts.category }),
      ...(opts.abcGrade !== undefined && { abcGrade: opts.abcGrade }),
      ...(opts.thumbnailUrl !== undefined && { thumbnailUrl: opts.thumbnailUrl }),
    },
    select: { id: true },
  });
  return { id: master.id };
}

// ---------------------------------------------------------------------------
// setupProductOption — ProductOption
// ---------------------------------------------------------------------------

/**
 * Create a ProductOption (SKU) linked to a MasterProduct.
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
  const option = await prisma.productOption.create({
    data: {
      organizationId: opts.organizationId,
      masterId: opts.masterId,
      sku: opts.sku,
      optionName: opts.sku,
      costPrice: opts.costPrice ?? 5000,
      commissionRate: opts.commissionRate ?? 0.1,
      otherCost: opts.otherCost ?? 0,
    },
    select: { id: true },
  });
  return { id: option.id };
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
  const listing = await prisma.channelListing.create({
    data: {
      organizationId: opts.organizationId,
      masterId: opts.masterId,
      channel: opts.channel,
      externalId: opts.externalId,
      ...(opts.channelName !== undefined && { channelName: opts.channelName }),
    },
    select: { id: true },
  });

  const listingOption = await prisma.channelListingOption.create({
    data: {
      organizationId: opts.organizationId,
      listingId: listing.id,
      optionId: opts.optionId,
      externalOptionId: opts.externalOptionId,
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
  const platform = opts.platform ?? 'coupang';
  const status = opts.status ?? 'accepted';
  const shippingPrice = opts.shippingPrice ?? 3000;
  const totalPrice = opts.lineItems.reduce((s, li) => s + li.totalPrice, 0);

  const order = await prisma.order.create({
    data: {
      organizationId: opts.organizationId,
      platform,
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
        optionId: li.optionId,
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
  const orderReturn = await prisma.orderReturn.create({
    data: {
      organizationId: opts.organizationId,
      orderId: opts.orderId,
      platform: 'coupang',
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
    select: { channel: true, externalId: true },
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
      channel: listing.channel,
      externalId: listing.externalId,
      businessDate,
      adSpend: opts.spend,
    },
    update: { adSpend: opts.spend },
    select: { id: true },
  });
  return row.id;
}
