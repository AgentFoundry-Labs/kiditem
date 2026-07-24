export type ChannelCatalogMedia = Readonly<{
  sourceUrl: string;
  role: 'primary' | 'detail' | 'option';
  sortOrder: number;
  externalOptionId: string | null;
}>;

export interface CatalogMediaPublicationPort {
  publishProviderMedia(input: {
    transaction: unknown;
    organizationId: string;
    userId: string;
    publicationReference: {
      type: 'channel_scrape_run' | 'source_import_run';
      id: string;
    };
    listings: Array<{
      listingId: string;
      channel: string;
      displayName: string;
      media: ChannelCatalogMedia[];
    }>;
  }): Promise<{
    imageCount: number;
    inactivatedImageCount: number;
  }>;
}

export const CATALOG_MEDIA_PUBLICATION_PORT = Symbol(
  'CATALOG_MEDIA_PUBLICATION_PORT',
);
