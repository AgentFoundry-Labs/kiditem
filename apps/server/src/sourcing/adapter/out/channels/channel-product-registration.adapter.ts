import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
  DefinitiveMarketplaceRegistrationError,
  type ChannelsMarketplaceRegistrationCapabilityPort,
} from '../../../../channels/application/port/in/capability/marketplace-registration.port';
import type {
  ChannelProductRegistrationPort,
  ChannelProductRegistrationSubmissionInput,
  ResolveChannelListingInput,
} from '../../../application/port/out/cross-domain/channel-product-registration.port';
import { DefinitiveChannelProductRegistrationError } from '../../../application/port/out/cross-domain/channel-product-registration.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

@Injectable()
export class ChannelProductRegistrationAdapter
  implements ChannelProductRegistrationPort
{
  constructor(
    @Inject(CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT)
    private readonly registration: ChannelsMarketplaceRegistrationCapabilityPort,
  ) {}

  assertExternalRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: 'coupang' }> {
    return this.registration.assertExternalProductRegistrationAccount(input);
  }

  reconcile(input: ChannelProductRegistrationSubmissionInput) {
    return this.registration.reconcileProductRegistration(input);
  }

  async submit(
    input: ChannelProductRegistrationSubmissionInput,
    beforeProviderCreate: () => Promise<void>,
  ) {
    try {
      return await this.registration.submitProductRegistration(input, beforeProviderCreate);
    } catch (error) {
      if (error instanceof DefinitiveMarketplaceRegistrationError) {
        throw new DefinitiveChannelProductRegistrationError(error.message);
      }
      throw error;
    }
  }

  resolveListing(
    transaction: SourcingRepositoryTransaction,
    input: ResolveChannelListingInput,
  ) {
    return this.registration.resolveProductRegistration(transaction, input);
  }
}
