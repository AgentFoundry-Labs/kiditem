import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
  type ChannelListingQuery,
  type ChannelListingRepositoryPort,
} from '../port/out/channel-listing.repository.port';
export type {
  ChannelListingMarketCount,
  ChannelListingQuery,
  ChannelListingSort,
  ChannelListingSummary,
  RegisteredProductGroupSummary,
} from '../port/out/channel-listing.repository.port';

@Injectable()
export class ChannelListingQueryService {
  constructor(
    @Inject(CHANNEL_LISTING_REPOSITORY_PORT)
    private readonly repository: ChannelListingRepositoryPort,
  ) {}

  list(organizationId: string, query: ChannelListingQuery = {}) {
    return this.repository.list(organizationId, query);
  }

  listGrouped(organizationId: string, query: ChannelListingQuery = {}) {
    return this.repository.listGrouped(organizationId, query);
  }

  getWorkspace(organizationId: string, listingId: string) {
    return this.repository.getWorkspace(organizationId, listingId);
  }
}
