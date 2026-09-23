import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { PreparedRegistrationRecipe } from '../../../../domain/registration/registration-item-code';
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
  preflightExactProductLinks(input: {
    organizationId: string;
    masterProductId?: string;
    optionLinks: Array<{
      externalOptionId: string;
      sellpiaInventorySkuId: string;
      quantity: number;
      providerOptionKey: string;
    }>;
  }): Promise<void>;
  resolveProductRegistration(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      salesProductId: string;
      channelAccountId: string;
      submissionKey: string;
  preparedRecipe?: PreparedRegistrationRecipe;
      externalListingId: string;
      displayName: string;
      masterProductId?: string;
      optionLinks?: Array<{
        externalOptionId: string;
        sellpiaInventorySkuId: string;
        quantity: number;
      }>;
    },
  ): Promise<{
    listingId: string;
    channelAccountId: string;
    channel: string;
    externalId: string;
    status: string | null;
  }>;
  resolveProductRegistrationWithOwnerReceipt(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      salesProductId: string;
      channelAccountId: string;
      submissionKey: string;
  preparedRecipe?: PreparedRegistrationRecipe;
      externalListingId: string;
      displayName: string;
      masterProductId?: string;
      optionLinks?: Array<{
        externalOptionId: string;
        sellpiaInventorySkuId: string;
        quantity: number;
      }>;
      ownerCapabilityKey: "channels.report_target_execution";
      ownerIdempotencyKey: string;
      ownerRequestHash: string;
    },
  ): Promise<{
    listingId: string;
    channelAccountId: string;
    channel: string;
    externalId: string;
    status: string | null;
  }>;
}
