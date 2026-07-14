import { registeredProductDetailHref } from '../../_shared/lib/product-pipeline-routes';
import type { RegisteredChannelListing } from './channel-listings-api';

export function registeredListingDetailHref(listingId: string): string {
  return registeredProductDetailHref(listingId);
}

export function registeredListingWorkspaceHref(listing: RegisteredChannelListing): string {
  return registeredListingDetailHref(listing.id);
}
