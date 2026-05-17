import { describe, expect, it } from 'vitest';
import { registeredListingWorkspaceHref } from './registered-listing-navigation';
import type { RegisteredChannelListing } from './channel-listings-api';

function listingFixture(overrides: Partial<RegisteredChannelListing> = {}): RegisteredChannelListing {
  return {
    id: 'listing-1',
    masterId: 'master-1',
    masterCode: 'M-00000001',
    masterName: '자석 다트게임',
    thumbnailUrl: 'https://cdn.example.com/product.jpg',
    channel: 'coupang',
    channelAccountId: 'account-1',
    channelAccountName: '쿠팡 본계정',
    externalId: 'seller-product-1',
    channelName: '쿠팡 등록명',
    channelPrice: 12900,
    sourceCandidateId: 'candidate-1',
    contentWorkspaceId: 'workspace-1',
    status: 'active',
    exposureStatus: 'visible',
    optionCount: 2,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('registeredListingWorkspaceHref', () => {
  it('keeps registered listings inside the shared product workspace when possible', () => {
    expect(registeredListingWorkspaceHref(listingFixture())).toBe(
      '/product-pipeline/registered-products/workspace-1',
    );
  });

  it('falls back to the collected product workspace when only candidate lineage exists', () => {
    expect(registeredListingWorkspaceHref(listingFixture({
      contentWorkspaceId: null,
      sourceCandidateId: 'candidate-1',
    }))).toBe('/product-pipeline/collected-products/candidate-1');
  });

  it('uses a registered listing workspace when no preparation lineage exists', () => {
    expect(registeredListingWorkspaceHref(listingFixture({
      contentWorkspaceId: null,
      sourceCandidateId: null,
    }))).toBe('/product-pipeline/registered-products/listing-1?workspace=listing');
  });
});
