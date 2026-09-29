export const LISTING_REGISTRATION_PERSISTENCE_PORT = Symbol('LISTING_REGISTRATION_PERSISTENCE_PORT');

export interface ListingRegistrationPersistencePort {
  assertActiveRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{
    channel: string;
    vendorId: string | null;
    externalAccountId: string | null;
  }>;
  findExistingActiveListingBySellerSku(input: {
    organizationId: string;
    channelAccountId: string;
    sellerSku: string;
  }): Promise<{
    externalListingId: string;
    displayName: string;
    status: string | null;
  } | null>;
}
