import { type Logger } from '@nestjs/common';
import type { CoupangProviderPort } from '../port/out/provider/coupang-provider.port';
import type { ChannelSyncRepositoryPort, SyncResult } from '../port/out/repository/channel-sync.repository.port';
import { isCoupangCredentialResolutionError } from './channel-account.service';

type SyncLogger = Pick<Logger, 'error' | 'log'>;

interface ProductSyncDeps {
  syncRepository: ChannelSyncRepositoryPort;
  coupang: CoupangProviderPort;
  logger: SyncLogger;
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
    const channelAccountId = await deps.syncRepository.getPrimaryCoupangAccountId(organizationId);

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
          const preflight = await deps.syncRepository.syncSingleProductListing({
            organizationId,
            sellerProductId,
            channelAccountId,
          });
          if (!preflight.synced) {
            if (preflight.detail) result.details?.push(preflight.detail);
            continue;
          }

          const detailResponse = await deps.coupang.getSellerProduct(
            organizationId,
            sellerProductId,
          );
          if (detailResponse.code !== 'SUCCESS') {
            throw new Error(
              `detail ${detailResponse.code}: ${detailResponse.message || 'Unknown API error'}`,
            );
          }
          if (!detailResponse.data) {
            throw new Error('detail returned no data');
          }

          await deps.syncRepository.updateSingleProductListing({
            organizationId,
            sellerProductId,
            channelAccountId,
            detail: detailResponse.data,
          });
          result.synced += 1;
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
