import { Prisma } from '@prisma/client';
import {
  isChannelListingOnSale,
  resolveChannelListingSaleStatus,
} from '@kiditem/shared/channel-listing';
import { PrismaService } from '../../../../prisma/prisma.service';

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
  prisma: PrismaService | Prisma.TransactionClient,
  organizationId: string,
  candidateIds?: readonly string[],
): Promise<string[]> {
  if (candidateIds && candidateIds.length === 0) return [];
  const candidateIdSet = candidateIds ? new Set(candidateIds) : null;
  const listings = await prisma.channelListing.findMany({
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
      isActive: true,
      status: true,
      rawJson: true,
      channelListingDailySnapshots: {
        where: { organizationId },
        orderBy: [{ businessDate: 'desc' }, { lastObservedAt: 'desc' }],
        take: 1,
        select: { saleStatus: true },
      },
      options: {
        where: { organizationId },
        select: {
          status: true,
          inventoryComponents: {
            where: { organizationId },
            select: {
              sellpiaInventorySku: {
                select: {
                  isActive: true,
                  currentStock: true,
                  masterProductId: true,
                  masterProduct: { select: { isActive: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const masterProductIds = new Set<string>();
  for (const listing of listings) {
    const saleStatus = resolveChannelListingSaleStatus({
      latestSnapshotStatus: listing.channelListingDailySnapshots[0]?.saleStatus,
      rawStatus: rawSaleStatus(listing.rawJson),
      optionStatuses: listing.options.map((option) => option.status),
      listingStatus: listing.status,
      isActive: listing.isActive,
    });
    if (!isChannelListingOnSale(saleStatus)) continue;

    for (const option of listing.options) {
      for (const component of option.inventoryComponents) {
        const sku = component.sellpiaInventorySku;
        if (
          sku.isActive
          && sku.currentStock > 0
          && sku.masterProduct?.isActive
          && sku.masterProductId
          && (!candidateIdSet || candidateIdSet.has(sku.masterProductId))
        ) {
          masterProductIds.add(sku.masterProductId);
        }
      }
    }
  }
  return [...masterProductIds].sort();
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
