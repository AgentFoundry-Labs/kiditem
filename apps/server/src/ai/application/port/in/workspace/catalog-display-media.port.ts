export const CATALOG_DISPLAY_MEDIA_PORT = Symbol('CATALOG_DISPLAY_MEDIA_PORT');

export type CatalogDisplayMediaTarget = Readonly<{
  channelListingId: string;
  externalOptionId: string | null;
}>;

export type CatalogDisplayMediaRequest = Readonly<{
  key: string;
  candidates: CatalogDisplayMediaTarget[];
}>;

export type CatalogDisplayMedia = Readonly<{
  url: string;
  source: 'channel_catalog';
  channel: string;
  channelListingId: string;
  externalOptionId: string | null;
}>;

export interface CatalogDisplayMediaPort {
  findDisplayMedia(input: {
    organizationId: string;
    requests: CatalogDisplayMediaRequest[];
  }): Promise<Map<string, CatalogDisplayMedia>>;
}
