import { BadRequestException, Inject, Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
  type ChannelListingDeletionOperationLookup,
  type ChannelListingDeletionUnresolvedInput,
  type ChannelListingRepositoryPort,
} from '../port/out/repository/channel-listing.repository.port';

@Injectable()
export class ChannelListingDeletionService {
  constructor(
    @Inject(CHANNEL_LISTING_REPOSITORY_PORT)
    private readonly listings: ChannelListingRepositoryPort,
  ) {}

  private unsupported(): never {
    throw new NotImplementedException(
      'Coupang listing deletion is not supported without an independent provider verifier.',
    );
  }

  authorize(_input: {
    organizationId: string;
    userId: string;
    listingId: string;
    password: string;
    idempotencyKey: string;
  }) {
    return this.unsupported();
  }

  claimExecution(_input: ChannelListingDeletionOperationLookup): never {
    return this.unsupported();
  }

  async markUnresolved(input: ChannelListingDeletionUnresolvedInput) {
    if (!input.reason.trim()) throw new BadRequestException('Unresolved deletion reason is required.');
    return this.listings.markDeletionUnresolved(input);
  }

  async getStatus(input: ChannelListingDeletionOperationLookup) {
    return this.listings.getDeletionOperation(input);
  }

  async reconcileObservedDeletion(input: ChannelListingDeletionOperationLookup) {
    const operation = await this.listings.getDeletionOperation(input);
    if (!operation) throw new NotFoundException('Deletion operation not found.');
    if (operation.status === 'succeeded') {
      return {
        operationId: operation.operationId,
        status: 'succeeded' as const,
        providerOutcome: 'succeeded' as const,
      };
    }
    return this.unsupported();
  }
}
