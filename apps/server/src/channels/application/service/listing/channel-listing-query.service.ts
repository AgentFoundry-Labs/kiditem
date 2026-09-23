import type { ChannelListingContentPort, ListingContentView } from '../../port/out/content/listing-content.port';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { ChannelListingFactQueries } from '../../port/in/listing/channel-listing-query.port';
import type {
  ChannelListingQuery,
  ChannelListingQueryPort,
  ChannelListingListResult,
  ChannelListingSummary,
} from '../../port/in/listing/channel-listing-query.port';
import type { ChannelListingQueryPersistencePort } from '../../port/out/persistence/channel-listing-query.persistence.port';

export class ChannelListingQueryService implements ChannelListingQueryPort {
  constructor(private readonly persistence: ChannelListingQueryPersistencePort, private readonly content: ChannelListingContentPort) {}

  readOptionCandidates(transaction: OwnerTransaction, input: Parameters<ChannelListingFactQueries['readOptionCandidates']>[1]) {
    return this.persistence.readOptionCandidates(transaction, input);
  }

  readCatalogFacts(transaction: OwnerTransaction, input: Parameters<ChannelListingFactQueries['readCatalogFacts']>[1]) {
    return this.persistence.readCatalogFacts(transaction, input);
  }

  readRegistrationFailureCounts(transaction: OwnerTransaction, input: Parameters<ChannelListingFactQueries['readRegistrationFailureCounts']>[1]) {
    return this.persistence.readRegistrationFailureCounts(transaction, input);
  }

  readExternalIdentities(transaction: OwnerTransaction, input: Parameters<ChannelListingFactQueries['readExternalIdentities']>[1]) {
    return this.persistence.readExternalIdentities(transaction, input);
  }

  readOptionIdentities(transaction: OwnerTransaction, input: Parameters<ChannelListingFactQueries['readOptionIdentities']>[1]) {
    return this.persistence.readOptionIdentities(transaction, input);
  }

  readDisplayFacts(transaction: OwnerTransaction, input: Parameters<ChannelListingFactQueries['readDisplayFacts']>[1]) {
    return this.persistence.readDisplayFacts(transaction, input);
  }

  readTrafficWindow(transaction: OwnerTransaction, input: Parameters<ChannelListingFactQueries['readTrafficWindow']>[1]) {
    return this.persistence.readTrafficWindow(transaction, input);
  }

  readLatestState(transaction: OwnerTransaction, input: Parameters<ChannelListingFactQueries['readLatestState']>[1]) {
    return this.persistence.readLatestState(transaction, input);
  }

  readLatestSaleStatus(transaction: OwnerTransaction, input: Parameters<ChannelListingFactQueries['readLatestSaleStatus']>[1]) {
    return this.persistence.readLatestSaleStatus(transaction, input);
  }

  lockActiveOwner(transaction: OwnerTransaction, input: Parameters<ChannelListingFactQueries['lockActiveOwner']>[1]) {
    return this.persistence.lockActiveOwner(transaction, input);
  }

  assertOwnedIds(transaction: OwnerTransaction, input: Parameters<ChannelListingFactQueries['assertOwnedIds']>[1]) {
    return this.persistence.assertOwnedIds(transaction, input);
  }

  async list(organizationId: string, query: ChannelListingQuery = {}): Promise<ChannelListingListResult> {
    const { tab, ...filters } = query;
    const result = await this.persistence.list(organizationId, {
      ...filters,
      page: positiveInteger(query.page, 1),
      limit: Math.min(100, positiveInteger(query.limit, 20)),
      includeDeleted: query.includeDeleted ?? tab === 'deleted',
    });
    const content = await this.content.findForListings({ organizationId, listings: result.items.map(item => ({ id: item.id, channel: item.channel, salesProductId: item.salesProductId })) });
    const byListing = new Map(content.map(item => [item.listingId, item]));
    return { ...result, items: result.items.map(item => withContent(item, byListing.get(item.id))) };
  }

  async getWorkspace(organizationId: string, listingId: string): Promise<ChannelListingSummary | null> {
    const item = await this.persistence.getWorkspace(organizationId, listingId);
    if (!item) return null;
    const content = await this.content.findForListings({ organizationId, listings: [{ id: item.id, channel: item.channel, salesProductId: item.salesProductId }], includeProviderMedia: true });
    return withContent(item, content.find(row => row.listingId === item.id));
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : fallback;
}

function withContent(item: ChannelListingSummary, content: ListingContentView | undefined): ChannelListingSummary {
  if (!content) return item;
  return {
    ...item,
    contentWorkspaceId: content.workspaceId,
    detailPageRevisionId: content.detailPageRevisionId,
    thumbnailUrl: content.thumbnailUrl,
    ...(item.providerDetail ? { providerDetail: { ...item.providerDetail, media: content.providerMedia } } : {}),
  };
}
