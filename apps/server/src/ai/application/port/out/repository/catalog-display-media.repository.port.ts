export const CATALOG_DISPLAY_MEDIA_REPOSITORY_PORT = Symbol(
  'CATALOG_DISPLAY_MEDIA_REPOSITORY_PORT',
);

export type CatalogDisplayMediaCandidate = Readonly<{
  id: string;
  channel: string;
  channelListingId: string;
  url: string;
  role: 'primary' | 'option';
  sortOrder: number;
  externalOptionId: string | null;
}>;

export interface CatalogDisplayMediaRepositoryPort {
  findCandidates(input: {
    organizationId: string;
    channelListingIds: string[];
  }): Promise<CatalogDisplayMediaCandidate[]>;
}
