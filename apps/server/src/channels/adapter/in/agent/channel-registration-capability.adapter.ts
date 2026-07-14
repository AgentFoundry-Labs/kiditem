import { Injectable } from '@nestjs/common';
import type {
  ChannelsMarketplaceRegistrationCapabilityPort,
  ProductRegistrationSubmissionCapabilityInput,
  ResolveProductRegistrationCapabilityInput,
} from '../../../application/port/in/capability/marketplace-registration.port';
import type {
  ChannelListingRegistrationResult,
  MarketplaceSubmissionResult,
} from '@kiditem/shared/channel-listing';
import { MarketplaceRegistrationService } from '../../../application/service/marketplace-registration.service';

/**
 * Channels-owned registration boundary used by Sourcing.
 *
 * The retired family-master Agent capabilities are intentionally absent:
 * registration now starts from a ProductPreparation and resolves an
 * account-scoped ChannelListing without creating or mutating Sellpia masters.
 */
@Injectable()
export class ChannelRegistrationCapabilityAdapter
  implements ChannelsMarketplaceRegistrationCapabilityPort
{
  constructor(
    private readonly marketplaceRegistration: MarketplaceRegistrationService,
  ) {}

  reconcileProductRegistration(
    input: ProductRegistrationSubmissionCapabilityInput,
  ): Promise<MarketplaceSubmissionResult | null> {
    return this.marketplaceRegistration.reconcileProductRegistration(input);
  }

  submitProductRegistration(
    input: ProductRegistrationSubmissionCapabilityInput,
    beforeProviderCreate: () => Promise<void>,
  ): Promise<MarketplaceSubmissionResult> {
    return this.marketplaceRegistration.submitProductRegistration(
      input,
      beforeProviderCreate,
    );
  }

  resolveProductRegistration(
    transaction: object,
    input: ResolveProductRegistrationCapabilityInput,
  ): Promise<ChannelListingRegistrationResult> {
    return this.marketplaceRegistration.resolveProductRegistration(transaction, input);
  }
}
