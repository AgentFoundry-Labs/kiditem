import { Inject, Injectable } from '@nestjs/common';
import { AI_LISTING_CONTENT_QUERY_PORT, type ListingContentQueryPort } from '../../../../ai/application/port/in/workspace/listing-content-query.port';
import type { ChannelListingContentPort, ListingContentRequest } from '../../../application/port/out/content/listing-content.port';
@Injectable()
export class ListingContentAdapter implements ChannelListingContentPort {
  constructor(@Inject(AI_LISTING_CONTENT_QUERY_PORT) private readonly content: ListingContentQueryPort) {}
  findForListings(input: ListingContentRequest) { return this.content.findForListings(input); }
}
