import type {
  ChannelListingListResult,
  ChannelListingQuery,
} from './listing/channel-listing-query.port';

/**
 * The minimum channel read needed by the fixed Finance report export.
 *
 * This deliberately exposes only paged listing reads. Mutating listing and
 * deletion capabilities stay behind their owner-specific ports.
 */
export const CHANNEL_LISTING_REPORT_READ_PORT = Symbol(
  'CHANNEL_LISTING_REPORT_READ_PORT',
);

export type ChannelListingReportReadQuery = Pick<
  ChannelListingQuery,
  'page' | 'limit' | 'sort' | 'tab'
>;

export interface ChannelListingReportReadPort {
  list(
    organizationId: string,
    query?: ChannelListingReportReadQuery,
  ): Promise<ChannelListingListResult>;
}
