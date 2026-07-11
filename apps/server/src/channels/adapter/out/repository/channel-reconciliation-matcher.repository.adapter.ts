import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type ChannelReconciliationMatcherPort,
  type ChannelListingHandle,
  type ChannelListingOptionHandle,
  type MatchOutcome,
  type ProductOptionCandidate,
  RECONCILIATION_CHANNEL,
  type Tx,
} from '../../../application/port/out/repository/channel-reconciliation.repository.port';

/**
 * Applies the Coupang row matching rules inside the caller-owned transaction.
 *
 * Side effects are limited to completing listing options for an existing,
 * account-scoped ChannelListing. A legacyCode-only match remains needs_review.
 */
@Injectable()
export class ChannelReconciliationMatcherRepositoryAdapter
  implements ChannelReconciliationMatcherPort
{
  async evaluateRow(
    tx: Tx,
    organizationId: string,
    externalId: string,
    externalOptionId: string | null,
    legacyCode: string | null,
  ): Promise<MatchOutcome> {
    const prismaTx = tx as Prisma.TransactionClient;
    const listingMatch = await this.findActiveListing(prismaTx, organizationId, externalId);

    if (listingMatch.kind === 'duplicate') {
      return {
        status: 'conflict',
        matchReason: 'conflict',
        resolutionSource: null,
        confidence: 50,
        linkedListingId: null,
        linkedListingOptionId: null,
        linkedMasterProductId: null,
        linkedProductOptionId: null,
        conflictJson: {
          kind: 'duplicate_active_channel_listing_external_id',
          externalId,
          listingIds: listingMatch.listings.map((listing) => listing.id),
          accountIds: listingMatch.listings.map((listing) => listing.channelAccountId ?? null),
        } satisfies Prisma.InputJsonValue,
      };
    }

    const listing = listingMatch.listing;

    if (listing) {
      // Rule 1: existing ChannelListing means listing-level link is established.
      let listingOption: ChannelListingOptionHandle | null = null;
      let linkedProductOptionId: string | null = null;
      if (externalOptionId) {
        listingOption = await prismaTx.channelListingOption.findFirst({
          where: {
            organizationId,
            listingId: listing.id,
            externalOptionId,
          },
          select: { id: true, optionId: true },
        });
        linkedProductOptionId = listingOption?.optionId ?? null;
      }

      // Existing listing master vs legacyCode candidate disagreement.
      let legacyCandidates: ProductOptionCandidate[] = [];
      if (legacyCode) {
        legacyCandidates = await this.findActiveOptionsByLegacyCode(prismaTx, organizationId, legacyCode);
        const masterMismatch = legacyCandidates.find((c) => c.masterId !== listing.masterId);
        if (masterMismatch) {
          return {
            status: 'conflict',
            matchReason: 'conflict',
            resolutionSource: null,
            confidence: 60,
            linkedListingId: listing.id,
            linkedListingOptionId: listingOption?.id ?? null,
            linkedMasterProductId: listing.masterId,
            linkedProductOptionId,
            conflictJson: {
              kind: 'existing_listing_vs_legacy_code',
              listingMasterId: listing.masterId,
              legacyCodeCandidateMasterIds: legacyCandidates.map((c) => c.masterId),
              candidateOptionIds: legacyCandidates.map((c) => c.id),
            } satisfies Prisma.InputJsonValue,
          };
        }
      }

      if (externalOptionId && !listingOption) {
        const candidate =
          legacyCandidates.length === 1 && legacyCandidates[0].masterId === listing.masterId
            ? legacyCandidates[0]
            : null;
        listingOption = await this.createListingOption(
          prismaTx,
          organizationId,
          listing.id,
          externalOptionId,
          candidate?.id ?? null,
        );
        linkedProductOptionId = listingOption.optionId;
      }

      if (externalOptionId && listingOption && !linkedProductOptionId) {
        const candidate =
          legacyCandidates.length === 1 && legacyCandidates[0].masterId === listing.masterId
            ? legacyCandidates[0]
            : null;
        if (candidate) {
          const updated = await prismaTx.channelListingOption.updateMany({
            where: {
              id: listingOption.id,
              organizationId,
              listingId: listing.id,
              optionId: null,
            },
            data: { optionId: candidate.id, isUnmatched: false },
          });
          if (updated.count > 0) {
            linkedProductOptionId = candidate.id;
          }
        } else if (legacyCandidates.length > 1) {
          return {
            status: 'conflict',
            matchReason: 'conflict',
            resolutionSource: null,
            confidence: 40,
            linkedListingId: listing.id,
            linkedListingOptionId: listingOption.id,
            linkedMasterProductId: listing.masterId,
            linkedProductOptionId: null,
            conflictJson: {
              kind: 'multiple_legacy_code_matches_for_existing_listing_option',
              listingMasterId: listing.masterId,
              legacyCode,
              candidateOptionIds: legacyCandidates.map((c) => c.id),
              candidateMasterIds: legacyCandidates.map((c) => c.masterId),
            } satisfies Prisma.InputJsonValue,
          };
        } else {
          return {
            status: 'needs_review',
            matchReason: 'none',
            resolutionSource: null,
            confidence: null,
            linkedListingId: listing.id,
            linkedListingOptionId: listingOption.id,
            linkedMasterProductId: listing.masterId,
            linkedProductOptionId: null,
            conflictJson: null,
          };
        }
      }

      return {
        status: 'linked',
        matchReason: 'external_id',
        resolutionSource: 'existing_external_id',
        confidence: 100,
        linkedListingId: listing.id,
        linkedListingOptionId: listingOption?.id ?? null,
        linkedMasterProductId: listing.masterId,
        linkedProductOptionId,
        conflictJson: null,
      };
    }

    // No existing listing: legacyCode can flag conflicts, but cannot prove
    // channel account identity, so a single candidate stays needs_review.
    if (legacyCode) {
      const candidates = await this.findActiveOptionsByLegacyCode(prismaTx, organizationId, legacyCode);
      if (candidates.length === 1) {
        return {
          status: 'needs_review',
          matchReason: 'none',
          resolutionSource: null,
          confidence: null,
          linkedListingId: null,
          linkedListingOptionId: null,
          linkedMasterProductId: null,
          linkedProductOptionId: null,
          conflictJson: null,
        };
      }
      if (candidates.length > 1) {
        return {
          status: 'conflict',
          matchReason: 'conflict',
          resolutionSource: null,
          confidence: 40,
          linkedListingId: null,
          linkedListingOptionId: null,
          linkedMasterProductId: null,
          linkedProductOptionId: null,
          conflictJson: {
            kind: 'multiple_legacy_code_matches',
            legacyCode,
            candidateOptionIds: candidates.map((c) => c.id),
            candidateMasterIds: candidates.map((c) => c.masterId),
          } satisfies Prisma.InputJsonValue,
        };
      }
    }

    return {
      status: 'needs_review',
      matchReason: 'none',
      resolutionSource: null,
      confidence: null,
      linkedListingId: null,
      linkedListingOptionId: null,
      linkedMasterProductId: null,
      linkedProductOptionId: null,
      conflictJson: null,
    };
  }

  private async findActiveListing(
    tx: Prisma.TransactionClient,
    organizationId: string,
    externalId: string,
  ): Promise<
    | { kind: 'single'; listing: ChannelListingHandle | null }
    | { kind: 'duplicate'; listings: ChannelListingHandle[] }
  > {
    const listings = await tx.channelListing.findMany({
      where: {
        organizationId,
        channel: RECONCILIATION_CHANNEL,
        externalId,
        isDeleted: false,
        masterId: { not: null },
      },
      select: { id: true, masterId: true, channelAccountId: true },
      orderBy: [{ channelAccountId: 'asc' }, { updatedAt: 'desc' }],
      take: 2,
    });
    const linkedListings = listings.filter(
      (listing): listing is (typeof listings)[number] & { masterId: string } =>
        listing.masterId !== null,
    );
    if (linkedListings.length > 1) {
      return { kind: 'duplicate', listings: linkedListings };
    }
    return { kind: 'single', listing: linkedListings[0] ?? null };
  }

  private async findActiveOptionsByLegacyCode(
    tx: Prisma.TransactionClient,
    organizationId: string,
    legacyCode: string,
  ): Promise<ProductOptionCandidate[]> {
    const options = await tx.productOption.findMany({
      where: {
        organizationId,
        legacyCode,
        isActive: true,
        isDeleted: false,
        master: { isDeleted: false },
      },
      select: { id: true, masterId: true },
    });
    return options;
  }

  private async createListingOption(
    tx: Prisma.TransactionClient,
    organizationId: string,
    listingId: string,
    externalOptionId: string,
    optionId: string | null,
  ): Promise<ChannelListingOptionHandle> {
    const option = await tx.channelListingOption.create({
      data: {
        organizationId,
        listingId,
        externalOptionId,
        optionId,
        isActive: true,
      },
      select: { id: true, optionId: true },
    });
    return option;
  }
}
