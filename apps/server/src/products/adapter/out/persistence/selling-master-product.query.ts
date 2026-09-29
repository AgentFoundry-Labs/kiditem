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
 * 재고와 무관하다. 재고 조건은 상품 허브 거르기에서만 쓴다(`listInStockMasterProductIds`, KID-333 Q2).
 */
export async function listSellingMasterProductIds(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  candidateIds: readonly string[] | undefined,
  listings: SellingListingReader,
): Promise<string[]> {
  if (candidateIds && candidateIds.length === 0) return [];
  const candidateIdSet = candidateIds ? new Set(candidateIds) : null;
  const selling = (await listings.readSellingListings(ownerTransaction(transaction), {
    organizationId,
    usableAccountsOnly: true,
  })).filter((listing) => listing.saleState === 'on_sale');
  const masterProductIds = new Set(selling.flatMap((listing) =>
    listing.options.flatMap((option) => option.components.map((component) => component.masterProductId))));
  return [...masterProductIds].filter((id) => !candidateIdSet || candidateIdSet.has(id)).sort();
}

/** 재고 있는(`currentStock > 0`) 상품만 — 상품 허브 `selling_in_stock` 거르기와 카드 칸(KID-333 Q2). */
export async function listInStockMasterProductIds(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  masterProductIds: readonly string[],
  inventory: ProductTransactionalReadPort,
): Promise<string[]> {
  if (masterProductIds.length === 0) return [];
  const availability = await readInventoryAvailabilityThroughPort(transaction, organizationId, [...masterProductIds], inventory);
  return availability.items.filter((item) => item.currentStock > 0).map((item) => item.masterProductId).sort();
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
