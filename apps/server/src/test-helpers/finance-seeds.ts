/**
 * Finance domain PG seed helpers — reusable across D.3+ integration specs.
 *
 * Extracted from Plan D.1 T6 (profit-loss.pg.integration.spec.ts) helpers.
 * All helpers are pure data seeders — no business logic.
 *
 * Usage:
 *   import { setupMaster, setupProductOption, setupChannelListing,
 *            seedOrderWithLineItems } from './finance-seeds';
 *
 * Ad facts are seeded in the ad report ledger by `ad-ledger-seeds.ts`.
 */
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { seedMallOrderCoverageOperation } from './__tests__/mall-order-coverage-operation';

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
    thumbnailUrl?: string | null;
    /** Retained for callers; channel category is supplied to setupChannelListing. */
    category?: string | null;
  },
): Promise<{ id: string }> {
  const [{ value }] = await prisma.$queryRaw<Array<{ value: bigint }>>`
    SELECT nextval('kid_item_code_seq'::regclass) AS value
  `;
  const master = await prisma.masterProduct.create({
    data: {
      id: randomUUID(),
      organizationId: opts.organizationId,
      code: `KID${value.toString().padStart(8, '0')}`,
      sourceAccountKey: 'kiditem',
      sourceProductCode: opts.code,
      sourceOptionCode: '',
      name: opts.name,
      optionName: null,
      currentStock: 0,
      purchasePrice: null,
      imageUrls: opts.thumbnailUrl ? [opts.thumbnailUrl] : [],
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
    select: { id: true },
  });
  await prisma.masterProduct.update({
    where: { id: master.id },
    data: {
      sourceOptionCode: opts.sku,
      optionName: opts.sku,
      currentStock: 100,
      purchasePrice: opts.costPrice ?? 5000,
    },
  });
  return { id: master.id };
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
    category?: string | null;
    /** 몰 원문 리스팅 상태. 판매중 판정(KID-333 ②)은 게시 상태만 판매중으로 친다. */
    status?: string | null;
    rawJson?: Record<string, string>;
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
      imageUrls: true,
    },
  });
  await prisma.masterProduct.findFirstOrThrow({
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
      externalId: opts.externalId,
      displayName: master.name,
      category: opts.category ?? null,
      ...(opts.channelName !== undefined && { channelName: opts.channelName }),
      ...(opts.status !== undefined && { status: opts.status }),
      ...(opts.rawJson !== undefined && { rawJson: opts.rawJson }),
    },
    select: { id: true },
  });

  if (master.imageUrls[0]) {
    // 리스팅 대표이미지 = 리스팅 작업공간의 현재 대표이미지 자산(KID-313 W3a).
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId: opts.organizationId, ownerType: 'channel_listing', channelListingId: listing.id },
      select: { id: true },
    });
    const asset = await prisma.contentAsset.create({
      data: {
        organizationId: opts.organizationId,
        contentWorkspaceId: workspace.id,
        source: 'catalog',
        assetKey: `seed-listing-thumbnail:${listing.id}`,
        url: master.imageUrls[0],
        role: 'primary',
      },
      select: { id: true },
    });
    await prisma.contentWorkspace.update({
      where: { id: workspace.id },
      data: { currentThumbnailAssetId: asset.id },
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
      masterProductId: opts.optionId,
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
 * Publish an explicit Order owner coverage window: one succeeded
 * `orders.mall_orders` operation whose result declares the range, and attach
 * the fixture rows inside that KST business-date range to it
 * (`Order.operationId`). Tests must call this deliberately: observing an order
 * row never proves that the collector exhausted the requested mall/window.
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
        channel: mallKey,
        externalAccountId: mallKey,
      },
    },
    create: {
      organizationId: opts.organizationId,
      channel: mallKey,
      name: mallKey,
      externalAccountId: mallKey,
      isPrimary: false,
    },
    update: {},
    select: { id: true },
  });
  const operationId = await seedMallOrderCoverageOperation(prisma, {
    organizationId: opts.organizationId,
    channelAccountId: account.id,
    mallKey,
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
  const from = new Date(`${opts.startDate}T00:00:00+09:00`);
  const through = new Date(`${opts.endDate}T00:00:00+09:00`);
  const to = new Date(through.getTime() + 86_400_000);
  await prisma.order.updateMany({
    where: {
      organizationId: opts.organizationId,
      orderedAt: { gte: from, lt: to },
    },
    data: { operationId },
  });
  return operationId;
}

/**
 * Publish every current fixture SKU as one verified Inventory generation.
 * The completion is keyed by an operation id (KID-361); no operation row is
 * needed because inventory reads only the state pointer.
 */
export async function seedCompletedInventorySnapshot(
  prisma: PrismaClient,
  organizationId: string,
): Promise<string> {
  const verifiedAt = new Date();
  const operationId = randomUUID();
  await prisma.sellpiaInventoryState.upsert({
    where: { organizationId },
    create: {
      organizationId,
      sourceAccountKey: 'dashboard-test',
      verifiedGeneration: 1n,
      lastVerifiedAt: verifiedAt,
      lastCompletedOperationId: operationId,
    },
    update: {
      verifiedGeneration: 1n,
      lastVerifiedAt: verifiedAt,
      lastCompletedOperationId: operationId,
    },
  });
  return operationId;
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
        channel: 'finance-fixture-mall',
        name: 'Measured finance order fixture',
        externalAccountId: 'finance-fixture-mall',
      },
    });
    const operationId = await seedMallOrderCoverageOperation(tx, {
      organizationId: opts.organizationId,
      channelAccountId: account.id,
      mallKey: 'finance-fixture-mall',
      startDate: opts.startDate,
      endDate: opts.endDate,
    });
    // The operation published the orders; each order keeps the channel
    // account it was sold through, which decides whether a sales commission
    // and other per-sale cost apply to its lines (KID-114).
    await tx.order.updateMany({
      where: { organizationId: opts.organizationId, id: { in: [...opts.orderIds] } },
      data: { operationId },
    });
    return operationId;
  });
}
