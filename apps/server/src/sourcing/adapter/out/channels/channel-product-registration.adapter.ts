import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
  type ChannelsMarketplaceRegistrationCapabilityPort,
} from '../../../../channels/application/port/in/capability/marketplace-registration.port';
import type {
  ChannelProductRegistrationPort,
  ExternalRegistrationMatchPreviewInput,
  ExternalRegistrationMatchPreviewResult,
  ExternalRegistrationPreflightInput,
  ExternalRegistrationPreflightResult,
  ResolveChannelListingInput,
} from '../../../application/port/out/cross-domain/channel-product-registration.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

@Injectable()
export class ChannelProductRegistrationAdapter
  implements ChannelProductRegistrationPort
{
  constructor(
    @Inject(CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT)
    private readonly registration: ChannelsMarketplaceRegistrationCapabilityPort,
  ) {}

  previewExternalRegistrationMatch(
    input: ExternalRegistrationMatchPreviewInput,
  ): Promise<ExternalRegistrationMatchPreviewResult> {
    return this.registration.previewExternalProductRegistrationMatch(input);
  }

  preflightExternalRegistration(
    input: ExternalRegistrationPreflightInput,
  ): Promise<ExternalRegistrationPreflightResult> {
    return this.registration.preflightExternalProductRegistration(input);
  }

  assertExternalRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: 'coupang'; vendorId: string }> {
    return this.registration.assertExternalProductRegistrationAccount(input);
  }

  resolveListing(
    transaction: SourcingRepositoryTransaction,
    input: ResolveChannelListingInput,
  ) {
    return this.registration.resolveProductRegistration(transaction, input);
  }
}
