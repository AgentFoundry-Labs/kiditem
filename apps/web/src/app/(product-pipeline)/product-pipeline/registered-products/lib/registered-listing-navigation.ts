import {
  collectedProductDetailHref,
  registeredProductDetailHref,
} from '../../_shared/lib/product-pipeline-routes';
import type { RegisteredChannelListing } from './channel-listings-api';

export function registeredListingDetailHref(listingId: string): string {
  return `${registeredProductDetailHref(listingId)}?workspace=listing`;
}

export function registeredListingWorkspaceHref(listing: RegisteredChannelListing): string {
  if (listing.contentWorkspaceId) {
    return registeredProductDetailHref(listing.contentWorkspaceId);
  }
  if (listing.sourceCandidateId) {
    return collectedProductDetailHref(listing.sourceCandidateId);
  }
  return registeredListingDetailHref(listing.id);
}
