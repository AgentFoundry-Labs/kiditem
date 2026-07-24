import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
  type ChannelListingDeletionOperationLookup,
  type ChannelListingDeletionUnresolvedInput,
  type ChannelListingRepositoryPort,
} from '../port/out/repository/channel-listing.repository.port';
import {
  CHANNELS_DELETION_PASSWORD_PORT,
  type ChannelsDeletionPasswordPort,
} from '../port/out/cross-domain/deletion-password.port';
import {
  COUPANG_PROVIDER_PORT,
  type CoupangProviderPort,
} from '../port/out/provider/coupang-provider.port';

@Injectable()
export class ChannelListingDeletionService {
  constructor(
    @Inject(CHANNEL_LISTING_REPOSITORY_PORT)
    private readonly listings: ChannelListingRepositoryPort,
    @Inject(CHANNELS_DELETION_PASSWORD_PORT)
    private readonly deletionPassword: ChannelsDeletionPasswordPort,
    @Optional()
    @Inject(COUPANG_PROVIDER_PORT)
    private readonly coupang?: CoupangProviderPort,
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
    if (!this.coupang) {
      throw new Error('COUPANG_PROVIDER_PORT is required to reconcile Coupang deletion.');
    }
    const response = await this.coupang.getSellerProduct(
      input.organizationId,
      operation.externalId,
      operation.channelAccountId,
    );
    const product = response.data;
    const status = product?.statusName?.trim() || '';
    const providerDeleted = ['DELETED', '상품삭제'].includes(status.toUpperCase());
    if (!product
      || String(product.sellerProductId) !== operation.externalId
      || product.vendorId?.trim() !== operation.expectedVendorId) {
      throw new ConflictException('Coupang deletion verification does not match the authorized listing.');
    }
    if (!providerDeleted) {
      return this.listings.markDeletionUnresolved({
        ...input,
        reason: status ? `provider_status_${status}` : 'provider_status_unavailable',
      });
    }
    return this.listings.completeDeletion({
      ...input,
      verifiedProviderAccountId: product.vendorId.trim(),
      verifiedExternalListingId: String(product.sellerProductId),
    });
  }
}

function deletionRequestHash(listingId: string): string {
  return createHash('sha256').update(`channel-listing-delete:${listingId}`).digest('hex');
}
