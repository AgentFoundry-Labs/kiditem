import { describe, expect, it, vi } from 'vitest';
import type { ChannelListingQueryPersistencePort } from '../../../port/out/persistence/channel-listing-query.persistence.port';
import type { ChannelListingSummary } from '../../../port/in/listing/channel-listing-query.port';
import type { ChannelListingContentPort } from '../../../port/out/content/listing-content.port';
import { ChannelListingQueryService } from '../channel-listing-query.service';
import type { RegistrationStatePort } from '../../../port/in/registration-state.port';

const activeListing: ChannelListingSummary = {
  id: 'active-listing',
  listingName: 'Active item',
  thumbnailUrl: null,
  imageUrl: null,
  detailPageRevisionId: null,
  registration: null,
  listingState: 'published',
  channel: 'coupang',
  channelAccountId: 'account-1',
  channelAccountName: 'Wing',
  externalId: 'active-external-id',
  channelName: 'Active item',
  category: null,
  brand: null,
  manufacturer: null,
  channelPrice: null,
  salesProductId: 'sales-product-1',
  sourceRecordId: null,
  contentWorkspaceId: null,
  status: 'active',
  exposureStatus: 'visible',
  optionCount: 1,
  mappingStatus: 'unmatched',
  createdAt: '2026-05-16T00:00:00.000Z',
  updatedAt: '2026-05-16T00:00:00.000Z',
};

const deletedListing: ChannelListingSummary = {
  ...activeListing,
  id: 'deleted-listing',
  listingName: 'Deleted item',
  externalId: 'deleted-external-id',
  channelName: 'Deleted item',
  status: 'deleted',
};

function makePersistence(): ChannelListingQueryPersistencePort {
  return {
    list: vi.fn(async (_organizationId, query) => ({
      items: query.includeDeleted ? [deletedListing] : [activeListing],
      total: 1,
      page: query.page,
      limit: query.limit,
      marketCounts: [],
    })),
    getWorkspace: vi.fn().mockResolvedValue(null),
  } as unknown as ChannelListingQueryPersistencePort;
}

function makeContent(): ChannelListingContentPort {
  return { findForListings: vi.fn().mockResolvedValue([]) };
}

function makeStates(accounts: unknown[] = []): RegistrationStatePort {
  return { readForSalesProducts: vi.fn().mockResolvedValue(new Map([['sales-product-1', { accounts }]])) } as unknown as RegistrationStatePort;
}

describe('ChannelListingQueryService', () => {
  it('returns paged deleted listings using the deleted tab and existing page cap', async () => {
    const service = new ChannelListingQueryService(makePersistence(), makeContent(), makeStates());

    const result = await service.list('org-1', {
      page: 2,
      limit: 101,
      tab: 'deleted',
    });

    expect(result).toEqual({
      items: [deletedListing],
      total: 1,
      page: 2,
      limit: 100,
      marketCounts: [],
    });
  });

  it('returns active listings when an explicit active override accompanies the deleted tab', async () => {
    const service = new ChannelListingQueryService(makePersistence(), makeContent(), makeStates());

    const result = await service.list('org-1', {
      page: 0,
      limit: 0,
      tab: 'deleted',
      includeDeleted: false,
    });

    expect(result).toEqual({
      items: [activeListing],
      total: 1,
      page: 1,
      limit: 20,
      marketCounts: [],
    });
  });

  it('carries the registration state of the listing\'s own account, read once for the page', async () => {
    const own = { channelAccountId: 'account-1', channelListingId: 'active-listing', state: 'registered' };
    const other = { channelAccountId: 'account-2', channelListingId: null, state: 'failed' };
    const states = makeStates([other, own]);
    const service = new ChannelListingQueryService(makePersistence(), makeContent(), states);

    const result = await service.list('org-1', {});

    expect(result.items[0]?.registration).toEqual(own);
    expect(states.readForSalesProducts).toHaveBeenCalledTimes(1);
    expect(states.readForSalesProducts).toHaveBeenCalledWith('org-1', ['sales-product-1']);
  });

  it('adds workspace and media projections from the AI content owner', async () => {
    const persistence = makePersistence();
    const listingWithProviderDetails: ChannelListingSummary = {
      ...activeListing,
      providerDetail: {
        category: null,
        brand: null,
        manufacturer: null,
        sourceDetail: null,
        options: [],
        media: [],
      },
    };
    vi.mocked(persistence.getWorkspace).mockResolvedValue(listingWithProviderDetails);
    const content: ChannelListingContentPort = {
      findForListings: vi.fn().mockResolvedValue([{
        listingId: activeListing.id,
        workspaceId: 'workspace-1',
        detailPageRevisionId: 'revision-1',
        thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
        providerMedia: [{
          sourceUrl: 'https://cdn.example.com/provider.png',
          role: 'primary',
          sortOrder: 0,
          externalOptionIds: ['option-1'],
        }],
      }]),
    };
    const service = new ChannelListingQueryService(persistence, content, makeStates());

    const result = await service.getWorkspace('org-1', activeListing.id);

    expect(result).toMatchObject({
      contentWorkspaceId: 'workspace-1',
      detailPageRevisionId: 'revision-1',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      providerDetail: { media: [{ sourceUrl: 'https://cdn.example.com/provider.png' }] },
    });
    expect(content.findForListings).toHaveBeenCalledWith({
      organizationId: 'org-1',
      listings: [{ id: activeListing.id, channel: 'coupang', salesProductId: 'sales-product-1' }],
      includeProviderMedia: true,
    });
  });
});
