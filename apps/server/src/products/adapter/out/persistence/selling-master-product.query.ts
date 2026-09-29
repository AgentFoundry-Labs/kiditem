import type { Prisma } from '@prisma/client';
import type { ChannelListingFactQueries } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import type { ProductTransactionalReadPort } from '../../../application/port/in/product-transactional-read.port';

export type SellingListingReader = Pick<ChannelListingFactQueries, 'readSellingListings'>;

/**
 * MasterProducts that can actually sell now. This predicate is shared by ABC
 * publication and the product-operation selling filter so their populations
 * cannot diverge.
 *
 * 판매중은 Channels 정본 판정(`readSellingListings`, KID-333 ②)을 읽는다 — 전 채널, 쓸 수 있는 계정.
 */
export async function listSellingMasterProductIds(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  candidateIds: readonly string[] | undefined,
  inventory: ProductTransactionalReadPort,
  listings: SellingListingReader,
): Promise<string[]> {
  if (candidateIds && candidateIds.length === 0) return [];
  const candidateIdSet = candidateIds ? new Set(candidateIds) : null;
  const selling = (await listings.readSellingListings(ownerTransaction(transaction), {
    organizationId,
    usableAccountsOnly: true,
  })).filter((listing) => listing.saleState === 'on_sale');
  const masterProductIdsToRead = [...new Set(selling.flatMap((listing) =>
    listing.options.flatMap((option) => option.components.map((component) => component.masterProductId))))];
  const availability = masterProductIdsToRead.length === 0
    ? []
    : (await readInventoryAvailabilityThroughPort(
      transaction,
      organizationId,
      masterProductIdsToRead,
      inventory,
    )).items;
  const availabilityBySkuId = new Map(availability.map((item) => [
    item.masterProductId,
    item,
  ]));
  const masterProductIds = new Set<string>();
  for (const listing of selling) {
    for (const option of listing.options) {
      for (const component of option.components) {
        const masterProductId = component.masterProductId;
        const stock = availabilityBySkuId.get(masterProductId);
        if (
          stock !== undefined
          && stock.currentStock > 0
          && (!candidateIdSet || candidateIdSet.has(masterProductId))
        ) {
          masterProductIds.add(masterProductId);
        }
      }
    }
  }
  return [...masterProductIds].sort();
}

async function readInventoryAvailabilityThroughPort(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  masterProductIdsToRead: string[],
  inventory: ProductTransactionalReadPort,
) {
  const context = { client: transaction };
  const lock = await inventory.lock(context, organizationId);
  return inventory.readAvailability(context, lock, {
    organizationId,
    masterProductIds: masterProductIdsToRead,
  });
}
