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
 * Create a minimal MasterProduct for a company.
 */
export async function setupMaster(
  prisma: PrismaClient,
  opts: {
    companyId: string;
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
      companyId: opts.companyId,
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
    companyId: string;
    masterId: string;
    sku: string;
    costPrice?: number;
    commissionRate?: number;
    otherCost?: number;
  },
): Promise<{ id: string }> {
  const option = await prisma.productOption.create({
    data: {
      companyId: opts.companyId,
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
    companyId: string;
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
      companyId: opts.companyId,
      masterId: opts.masterId,
      channel: opts.channel,
      externalId: opts.externalId,
      ...(opts.channelName !== undefined && { channelName: opts.channelName }),
    },
    select: { id: true },
  });

  const listingOption = await prisma.channelListingOption.create({
    data: {
      companyId: opts.companyId,
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
    companyId: string;
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
      companyId: opts.companyId,
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
        companyId: opts.companyId,
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
    companyId: string;
    orderId: string | null;
    requestedAt: string;       // ISO date string
    lineItems?: Array<{ orderLineItemId: string | null }>;
  },
): Promise<string> {
  const orderReturn = await prisma.orderReturn.create({
    data: {
      companyId: opts.companyId,
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
          companyId: opts.companyId,
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
// seedAd — Ad (daily ad spend record)
// ---------------------------------------------------------------------------

/**
 * Create an Ad record for a listing on a specific date.
 * Returns the created ad ID.
 */
export async function seedAd(
  prisma: PrismaClient,
  opts: {
    companyId: string;
    listingId: string;
    date: string;              // ISO date string (e.g. '2026-04-15')
    spend: number;
  },
): Promise<string> {
  const ad = await prisma.ad.create({
    data: {
      companyId: opts.companyId,
      listingId: opts.listingId,
      date: new Date(opts.date),
      spend: opts.spend,
    },
    select: { id: true },
  });
  return ad.id;
}
