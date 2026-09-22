import type {
  ChannelListingQuery,
  ChannelListingQueryPort,
  ChannelListingListResult,
  ChannelListingSummary,
} from '../../port/in/listing/channel-listing-query.port';
import type { ChannelListingQueryPersistencePort } from '../../port/out/persistence/channel-listing-query.persistence.port';

export class ChannelListingQueryService implements ChannelListingQueryPort {
  constructor(private readonly persistence: ChannelListingQueryPersistencePort) {}

  list(organizationId: string, query: ChannelListingQuery = {}): Promise<ChannelListingListResult> {
    const { tab, ...filters } = query;
    return this.persistence.list(organizationId, {
      ...filters,
      page: positiveInteger(query.page, 1),
      limit: Math.min(100, positiveInteger(query.limit, 20)),
      includeDeleted: query.includeDeleted ?? tab === 'deleted',
    });
  }

  getWorkspace(organizationId: string, listingId: string): Promise<ChannelListingSummary | null> {
    return this.persistence.getWorkspace(organizationId, listingId);
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : fallback;
}
