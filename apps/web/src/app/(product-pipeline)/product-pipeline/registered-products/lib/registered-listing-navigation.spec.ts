import { describe, expect, it } from 'vitest';
import { registeredListingWorkspaceHref } from './registered-listing-navigation';
import type { RegisteredChannelListing } from './channel-listings-api';

function listingFixture(overrides: Partial<RegisteredChannelListing> = {}): RegisteredChannelListing {
  return {
    id: 'listing-1',
    listingName: '자석 다트게임',
    thumbnailUrl: 'https://cdn.example.com/product.jpg',
    detailPageArtifactId: null,
    detailPageRevisionId: null,
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
    mappingStatus: 'matched',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('registeredListingWorkspaceHref', () => {
  it('uses the ChannelListing id as the canonical registered-product identity', () => {
    expect(registeredListingWorkspaceHref(listingFixture())).toBe(
      '/product-pipeline/registered-products/listing-1',
    );
  });

  it('does not fall back to source or content-workspace identities', () => {
    expect(registeredListingWorkspaceHref(listingFixture({
      contentWorkspaceId: null,
      sourceCandidateId: 'candidate-1',
    }))).toBe('/product-pipeline/registered-products/listing-1');
  });
});
