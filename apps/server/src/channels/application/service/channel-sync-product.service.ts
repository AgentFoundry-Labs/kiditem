import { BadRequestException, type Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CoupangProviderPort } from '../port/out/coupang-provider.port';
import { isCoupangCredentialResolutionError } from './channel-account.service';
import type { SyncResult } from './types';

type SyncLogger = Pick<Logger, 'error' | 'log'>;

interface ProductSyncDeps {
  prisma: PrismaService;
  coupang: CoupangProviderPort;
  logger: SyncLogger;
  normalizeProductStatus(raw: string | null | undefined): string | undefined;
}

const PRODUCT_PAGE_SIZE = 50;
const MAX_PRODUCT_PAGES = 200;

/**
 * Coupang seller-product -> ChannelListing/ChannelListingOption refresh.
 *
 * This is refresh-only: it updates existing listings and intentionally skips
 * unknown sellerProductId values instead of auto-creating MasterProduct rows.
 */
export async function syncCoupangProducts(
  deps: ProductSyncDeps,
  organizationId: string,
): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, errors: 0, details: [] };
  let nextToken: string | undefined;
  let pages = 0;

  try {
    do {
      const listResponse = await deps.coupang.getSellerProducts(organizationId, {
        nextToken,
        maxPerPage: PRODUCT_PAGE_SIZE,
      });

      if (listResponse.code !== 'SUCCESS') {
        result.errors += 1;
        result.details?.push(
          `seller-products list ${listResponse.code}: ${listResponse.message || 'Unknown API error'}`,
        );
        break;
      }

      const items = listResponse.data?.content ?? [];
      for (const summary of items) {
        const sellerProductId = String(summary.sellerProductId);
        try {
          await syncSingleProductListing(deps, sellerProductId, organizationId, result);
        } catch (error: unknown) {
          result.errors += 1;
          const message = error instanceof Error ? error.message : 'Unknown error';
          result.details?.push(`Listing ${sellerProductId}: ${message}`);
          deps.logger.error(`Failed to sync listing ${sellerProductId}: ${message}`);
        }
      }

      nextToken = listResponse.data?.nextToken;
      pages += 1;
    } while (nextToken && pages < MAX_PRODUCT_PAGES);

    if (nextToken && pages >= MAX_PRODUCT_PAGES) {
      result.details?.push(
        `Stopped after ${MAX_PRODUCT_PAGES} pages of seller-products — re-run to continue`,
      );
    }
  } catch (error: unknown) {
    if (isCoupangCredentialResolutionError(error)) throw error;
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors += 1;
    result.details?.push(`Product sync failed: ${message}`);
    deps.logger.error(`Product sync failed: ${message}`);
  }

  deps.logger.log(
    `Product sync complete: ${result.synced} synced, ${result.errors} errors`,
  );
  return result;
}

async function syncSingleProductListing(
  deps: ProductSyncDeps,
  sellerProductId: string,
  organizationId: string,
  result: SyncResult,
): Promise<void> {
  const existing = await deps.prisma.channelListing.findFirst({
    where: {
      organizationId,
      channel: 'coupang',
      externalId: sellerProductId,
      isDeleted: false,
    },
    select: { id: true },
  });
  if (!existing) {
    result.details?.push(
      `Listing ${sellerProductId}: no matching ChannelListing — create via product import / admin UI first`,
    );
    return;
  }

  const detailResponse = await deps.coupang.getSellerProduct(organizationId, sellerProductId);
  if (detailResponse.code !== 'SUCCESS') {
    throw new Error(
      `detail ${detailResponse.code}: ${detailResponse.message || 'Unknown API error'}`,
    );
  }
  const detail = detailResponse.data;
  if (!detail) {
    throw new Error('detail returned no data');
  }

  await deps.prisma.$transaction(
    async (tx) => {
      const updated = await tx.channelListing.updateMany({
        where: {
          id: existing.id,
          organizationId,
          channel: 'coupang',
          externalId: sellerProductId,
          isDeleted: false,
        },
        data: {
          channelName: detail.sellerProductName ?? null,
          status: deps.normalizeProductStatus(detail.statusName),
          deliveryChargeType: detail.deliveryChargeType ?? null,
          freeShipOverAmount: detail.freeShipOverAmount ?? null,
          returnCharge: detail.returnCharge ?? null,
          deliveryInfo: detail.deliveryInfo === undefined
            ? Prisma.DbNull
            : (detail.deliveryInfo as Prisma.InputJsonValue),
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          `ChannelListing ${sellerProductId} is no longer active for this organization`,
        );
      }

      const items = Array.isArray(detail.items) ? detail.items : [];
      for (const item of items) {
        if (!item.vendorItemId) {
          throw new BadRequestException(
            `Coupang item missing vendorItemId — cannot upsert (sellerProductId=${sellerProductId})`,
          );
        }
        const externalOptionId = String(item.vendorItemId);

        await tx.channelListingOption.upsert({
          where: {
            listingId_externalOptionId: {
              listingId: existing.id,
              externalOptionId,
            },
          },
          update: {
            itemName: item.itemName ?? null,
            salePrice: item.salePrice ?? null,
            isActive: true,
          },
          create: {
            organizationId,
            listingId: existing.id,
            externalOptionId,
            itemName: item.itemName ?? null,
            salePrice: item.salePrice ?? null,
            isActive: true,
          },
        });
      }
    },
    { timeout: 15_000 },
  );

  result.synced += 1;
}
