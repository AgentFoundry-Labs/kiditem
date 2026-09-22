import { describe, expect, it, vi } from 'vitest';
import type { ChannelListingQueryPersistencePort } from '../../../port/out/persistence/channel-listing-query.persistence.port';
import type { ChannelListingSummary } from '../../../port/in/listing/channel-listing-query.port';
import { ChannelListingQueryService } from '../channel-listing-query.service';

const activeListing: ChannelListingSummary = {
  id: 'active-listing',
  listingName: 'Active item',
  thumbnailUrl: null,
  detailPageArtifactId: null,
  detailPageRevisionId: null,
  channel: 'coupang',
  channelAccountId: 'account-1',
  channelAccountName: 'Wing',
  externalId: 'active-external-id',
  channelName: 'Active item',
  category: null,
  brand: null,
  manufacturer: null,
  channelPrice: null,
  sourceCandidateId: null,
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
  };
}

describe('ChannelListingQueryService', () => {
  it('returns paged deleted listings using the deleted tab and existing page cap', async () => {
    const service = new ChannelListingQueryService(makePersistence());

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
    const service = new ChannelListingQueryService(makePersistence());

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
});
