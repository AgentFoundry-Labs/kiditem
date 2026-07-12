import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
  type ChannelsMarketplaceRegistrationCapabilityPort,
} from '../../../../channels/application/port/in/capability/marketplace-registration.port';
import type {
  ChannelProductRegistrationPort,
  ChannelProductRegistrationSubmissionInput,
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

  reconcile(input: ChannelProductRegistrationSubmissionInput) {
    return this.registration.reconcileProductRegistration(input);
  }

  submit(input: ChannelProductRegistrationSubmissionInput) {
    return this.registration.submitProductRegistration(input);
  }

  resolveListing(
    transaction: SourcingRepositoryTransaction,
    input: ResolveChannelListingInput,
  ) {
    return this.registration.resolveProductRegistration(transaction, input);
  }
}
