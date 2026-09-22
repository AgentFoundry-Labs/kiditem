import type {
  ChannelListingListResult,
  ChannelListingQuery,
  ChannelListingSummary,
} from '../../in/listing/channel-listing-query.port';

/** Pagination and active/deleted selection are resolved by the application. */
export type ChannelListingPersistenceQuery = Omit<
  ChannelListingQuery,
  'page' | 'limit' | 'includeDeleted' | 'tab'
> & {
  page: number;
  limit: number;
  includeDeleted: boolean;
};

export const CHANNEL_LISTING_QUERY_PERSISTENCE_PORT = Symbol(
  'CHANNEL_LISTING_QUERY_PERSISTENCE_PORT',
);

export interface ChannelListingQueryPersistencePort {
  list(
    organizationId: string,
    query: ChannelListingPersistenceQuery,
  ): Promise<ChannelListingListResult>;
  getWorkspace(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingSummary | null>;
}
