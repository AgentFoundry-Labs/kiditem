import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
  type ChannelListingDeletionCompletionInput,
  type ChannelListingDeletionEvidence,
  type ChannelListingDeletionOperationLookup,
  type ChannelListingDeletionUnresolvedInput,
  type ChannelListingRepositoryPort,
} from '../port/out/repository/channel-listing.repository.port';
import {
  CHANNELS_DELETION_PASSWORD_PORT,
  type ChannelsDeletionPasswordPort,
} from '../port/out/cross-domain/deletion-password.port';

const EVIDENCE_SOURCES = new Set<ChannelListingDeletionEvidence['source']>([
  'dom:data-vendor-id',
  'meta:vendor-id',
  'url:vendorId',
]);

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

  /** Provider-confirmed completion intentionally has no second password gate. */
  async complete(input: ChannelListingDeletionCompletionInput) {
    assertEvidence(input.evidence);
    return this.listings.completeDeletion(input);
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

function assertEvidence(evidence: ChannelListingDeletionEvidence): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(evidence.vendorId.trim())) {
    throw new BadRequestException('Verified provider account evidence is required.');
  }
  if (!EVIDENCE_SOURCES.has(evidence.source)) {
    throw new BadRequestException('Verified provider evidence source is required.');
  }
}
