import type { CoupangCatalogMediaV1 } from '@kiditem/shared/coupang-catalog-snapshot';

export interface CatalogMediaPublicationPort {
  publishProviderMedia(input: {
    transaction: unknown;
    organizationId: string;
    userId: string;
    sourceImportRunId: string;
    listings: Array<{
      listingId: string;
      displayName: string;
      media: CoupangCatalogMediaV1[];
    }>;
  }): Promise<{
    imageCount: number;
    pendingImageCount: number;
    readyImageCount: number;
    failedImageCount: number;
    inactivatedImageCount: number;
  }>;
}

export const CATALOG_MEDIA_PUBLICATION_PORT = Symbol(
  'CATALOG_MEDIA_PUBLICATION_PORT',
);
