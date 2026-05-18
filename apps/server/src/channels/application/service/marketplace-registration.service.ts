import { Inject, Injectable } from '@nestjs/common';
import {
  MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
  type MarketplaceRegistrationRepositoryPort,
  type RegisterConfirmedListingInput,
} from '../port/out/channel-listing.repository.port';

@Injectable()
export class MarketplaceRegistrationService {
  constructor(
    @Inject(MARKETPLACE_REGISTRATION_REPOSITORY_PORT)
    private readonly repository: MarketplaceRegistrationRepositoryPort,
  ) {}

  registerConfirmedListing(
    organizationId: string,
    input: RegisterConfirmedListingInput,
  ) {
    return this.repository.registerConfirmedListing(organizationId, input);
  }
}
