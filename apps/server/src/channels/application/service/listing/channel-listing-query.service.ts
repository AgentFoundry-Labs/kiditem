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
import type { RegistrationStatePort, SalesProductRegistrationView } from '../../port/in/registration-state.port';

export class ChannelListingQueryService implements ChannelListingQueryPort {
  constructor(
    private readonly persistence: ChannelListingQueryPersistencePort,
    private readonly content: ChannelListingContentPort,
    /** 판매 상품이 있는 리스팅의 계정별 등록 상태(KID-320). 쪽마다 한 번 읽는다. */
    private readonly registrationStates: RegistrationStatePort,
  ) {}

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
    const [content, registrations] = await Promise.all([
      this.content.findForListings({ organizationId, listings: result.items.map(item => ({ id: item.id, channel: item.channel, salesProductId: item.salesProductId })) }),
      this.readRegistrations(organizationId, result.items),
    ]);
    const byListing = new Map(content.map(item => [item.listingId, item]));
    return { ...result, items: result.items.map(item => withRegistration(withContent(item, byListing.get(item.id)), registrations)) };
  }

  async getWorkspace(organizationId: string, listingId: string): Promise<ChannelListingSummary | null> {
    const item = await this.persistence.getWorkspace(organizationId, listingId);
    if (!item) return null;
    const [content, registrations] = await Promise.all([
      this.content.findForListings({ organizationId, listings: [{ id: item.id, channel: item.channel, salesProductId: item.salesProductId }], includeProviderMedia: true }),
      this.readRegistrations(organizationId, [item]),
    ]);
    return withRegistration(withContent(item, content.find(row => row.listingId === item.id)), registrations);
  }

  private async readRegistrations(organizationId: string, items: readonly ChannelListingSummary[]) {
    const salesProductIds = [...new Set(items.flatMap(item => item.salesProductId ? [item.salesProductId] : []))];
    if (salesProductIds.length === 0) return new Map<string, SalesProductRegistrationView>();
    return this.registrationStates.readForSalesProducts(organizationId, salesProductIds);
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : fallback;
}

/** 리스팅의 판매 상품 × 이 계정 줄. 판매 상품이 없거나 그 계정 줄이 없으면 null. */
function withRegistration(item: ChannelListingSummary, registrations: ReadonlyMap<string, SalesProductRegistrationView>): ChannelListingSummary {
  const accounts = item.salesProductId ? registrations.get(item.salesProductId)?.accounts : undefined;
  const registration = accounts?.find(account => account.channelAccountId === item.channelAccountId) ?? null;
  return { ...item, registration };
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
