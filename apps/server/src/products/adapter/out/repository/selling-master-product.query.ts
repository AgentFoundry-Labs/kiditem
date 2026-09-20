import { Prisma } from '@prisma/client';
import {
  isChannelListingOnSale,
  resolveChannelListingSaleStatus,
} from '@kiditem/shared/channel-listing';
import { readLatestListingSaleStatusFacts } from '../../../../channels/read/channel-listing-daily-facts';
import type { InventoryTransactionalReadPort } from '../../../../inventory/application/port/in/stock/inventory-transactional-read.port';

const SELLING_CHANNELS = ['coupang', 'rocket'];

/**
 * MasterProducts that can actually sell now. This predicate is shared by ABC
 * publication and the product-operation selling filter so their populations
 * cannot diverge.
 *
 * The selling decision is based on the same latest channel snapshot that the
 * channel matching workspace uses. A record-level `ChannelListing.status`
 * such as "승인완료" is not by itself a sale status.
 */
export async function listSellingMasterProductIds(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  candidateIds: readonly string[] | undefined,
  inventory: InventoryTransactionalReadPort,
): Promise<string[]> {
  if (candidateIds && candidateIds.length === 0) return [];
  const candidateIdSet = candidateIds ? new Set(candidateIds) : null;
  const listings = await transaction.channelListing.findMany({
    where: {
      organizationId,
      channelAccount: {
        is: {
          organizationId,
          status: 'active',
          channel: { in: SELLING_CHANNELS },
        },
      },
    },
    select: {
      id: true,
      isActive: true,
      status: true,
      rawJson: true,
      options: {
        where: { organizationId },
        select: {
          status: true,
          inventoryComponents: {
            where: { organizationId },
            select: {
              sellpiaInventorySkuId: true,
            },
          },
        },
      },
    },
  });
  const statusFacts = await readLatestListingSaleStatusFacts(transaction, {
    organizationId,
    listingIds: listings.map((listing) => listing.id),
  });
  const saleStatusByListing = new Map(statusFacts.map((fact) => [
    fact.listingId,
    fact.saleStatus,
  ]));
  const sellpiaInventorySkuIds = [...new Set(listings.flatMap((listing) =>
    listing.options.flatMap((option) => option.inventoryComponents.map(
      (component) => component.sellpiaInventorySkuId,
    ))))];
  const identities = sellpiaInventorySkuIds.length === 0
    ? []
    : await readInventorySkuIdentitiesThroughPort(
      transaction,
      organizationId,
      sellpiaInventorySkuIds,
      inventory,
    );
  const identityBySkuId = new Map(identities.map((identity) => [
    identity.sellpiaInventorySkuId,
    identity,
  ]));
  const masterProductIdentityIds = [...new Set(identities.flatMap((identity) =>
    identity.masterProductId ? [identity.masterProductId] : []))];
  const masterProducts = masterProductIdentityIds.length === 0
    ? []
    : await transaction.masterProduct.findMany({
      where: { organizationId, id: { in: masterProductIdentityIds } },
      select: { id: true, isActive: true },
    });
  const masterProductActiveById = new Map(masterProducts.map((product) => [
    product.id,
    product.isActive,
  ]));
  const availability = sellpiaInventorySkuIds.length === 0
    ? []
    : (await readInventoryAvailabilityThroughPort(
      transaction,
      organizationId,
      sellpiaInventorySkuIds,
      inventory,
    )).items;
  const availabilityBySkuId = new Map(availability.map((item) => [
    item.sellpiaInventorySkuId,
    item,
  ]));
  const masterProductIds = new Set<string>();
  for (const listing of listings) {
    const saleStatus = resolveChannelListingSaleStatus({
      latestSnapshotStatus: saleStatusByListing.get(listing.id) ?? null,
      rawStatus: rawSaleStatus(listing.rawJson),
      optionStatuses: listing.options.map((option) => option.status),
      listingStatus: listing.status,
      isActive: listing.isActive,
    });
    if (!isChannelListingOnSale(saleStatus)) continue;

    for (const option of listing.options) {
      for (const component of option.inventoryComponents) {
        const sku = identityBySkuId.get(component.sellpiaInventorySkuId);
        const masterProductId = sku?.masterProductId ?? null;
        const stock = availabilityBySkuId.get(component.sellpiaInventorySkuId);
        if (
          stock !== undefined
          && stock.currentStock > 0
          && masterProductId !== null
          && masterProductActiveById.get(masterProductId) === true
          && (!candidateIdSet || candidateIdSet.has(masterProductId))
        ) {
          masterProductIds.add(masterProductId);
        }
      }
    }
  }
  return [...masterProductIds].sort();
}

async function readInventorySkuIdentitiesThroughPort(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  sellpiaInventorySkuIds: string[],
  inventory: InventoryTransactionalReadPort,
) {
  return inventory.readSkuIdentities(
    { client: transaction },
    {
      organizationId,
      selector: { kind: 'ids', values: sellpiaInventorySkuIds },
    },
  );
}

async function readInventoryAvailabilityThroughPort(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  sellpiaInventorySkuIds: string[],
  inventory: InventoryTransactionalReadPort,
) {
  const context = { client: transaction };
  const lock = await inventory.lock(context, organizationId);
  return inventory.readAvailability(context, lock, {
    organizationId,
    sellpiaInventorySkuIds,
  });
}

function rawSaleStatus(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ['saleStatus', 'salesStatus', 'sale_status', '판매상태']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}
