import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
  type ChannelListingDeletionCompletionInput,
  type ChannelListingDeletionOperationLookup,
  type ChannelListingDeletionUnresolvedInput,
  type ChannelListingRepositoryPort,
} from '../port/out/repository/channel-listing.repository.port';
import {
  CHANNELS_DELETION_PASSWORD_PORT,
  type ChannelsDeletionPasswordPort,
} from '../port/out/cross-domain/deletion-password.port';

@Injectable()
export class ChannelListingDeletionService {
  constructor(
    @Inject(CHANNEL_LISTING_REPOSITORY_PORT)
    private readonly listings: ChannelListingRepositoryPort,
    @Inject(CHANNELS_DELETION_PASSWORD_PORT)
    private readonly deletionPassword: ChannelsDeletionPasswordPort,
  ) {}

  /** Password is deliberately verified before any listing lookup. */
  async authorize(input: {
    organizationId: string;
    userId: string;
    listingId: string;
    password: string;
    idempotencyKey: string;
  }) {
    await this.deletionPassword.assertPassword(input.organizationId, input.password);
    return this.listings.authorizeDeletion({
      organizationId: input.organizationId,
      userId: input.userId,
      listingId: input.listingId,
      idempotencyKey: input.idempotencyKey,
      requestHash: deletionRequestHash(input.listingId),
    });
  }

  /** Only the authenticated extension can redeem this one-time, expiring claim. */
  async claimExecution(input: ChannelListingDeletionOperationLookup) {
    return this.listings.claimDeletionExecution(input);
  }

  /** Public browser completion is deliberately unavailable without independent provider evidence. */
  async complete(input: ChannelListingDeletionCompletionInput) {
    throw new BadRequestException(
      `Deletion ${input.operationId} requires independent provider reconciliation before local completion.`,
    );
  }

  async markUnresolved(input: ChannelListingDeletionUnresolvedInput) {
    if (!input.reason.trim()) throw new BadRequestException('Unresolved deletion reason is required.');
    return this.listings.markDeletionUnresolved(input);
  }

  async getStatus(input: ChannelListingDeletionOperationLookup) {
    return this.listings.getDeletionOperation(input);
  }
}

function deletionRequestHash(listingId: string): string {
  return createHash('sha256').update(`channel-listing-delete:${listingId}`).digest('hex');
}
