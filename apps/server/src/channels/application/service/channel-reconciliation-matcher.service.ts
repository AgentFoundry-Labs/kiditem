import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type ChannelListingHandle,
  type ChannelListingOptionHandle,
  type MatchOutcome,
  type ProductOptionCandidate,
  RECONCILIATION_CHANNEL,
  type Tx,
} from './channel-reconciliation.types';

/**
 * Applies the Coupang row matching rules inside the caller-owned transaction.
 *
 * Side effects are limited to creating or completing ChannelListing records
 * when a single active ProductOption can be trusted as the match.
 */
@Injectable()
export class ChannelReconciliationMatcherService {
  async evaluateRow(
    tx: Tx,
    organizationId: string,
    externalId: string,
    externalOptionId: string | null,
    legacyCode: string | null,
  ): Promise<MatchOutcome> {
    const listing = await this.findActiveListing(tx, organizationId, externalId);

    if (listing) {
      // Rule 1: existing ChannelListing means listing-level link is established.
      let listingOption: ChannelListingOptionHandle | null = null;
      let linkedProductOptionId: string | null = null;
      if (externalOptionId) {
        listingOption = await tx.channelListingOption.findFirst({
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
        legacyCandidates = await this.findActiveOptionsByLegacyCode(tx, organizationId, legacyCode);
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
          tx,
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
          const updated = await tx.channelListingOption.updateMany({
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

    // No existing listing: try an exact legacyCode match.
    if (legacyCode) {
      const candidates = await this.findActiveOptionsByLegacyCode(tx, organizationId, legacyCode);
      if (candidates.length === 1) {
        const candidate = candidates[0];
        const created = await this.createListingForCandidate(
          tx,
          organizationId,
          candidate,
          externalId,
          externalOptionId,
        );
        return {
          status: 'linked',
          matchReason: 'legacy_code_exact',
          resolutionSource: 'auto_legacy_code',
          confidence: 90,
          linkedListingId: created.listingId,
          linkedListingOptionId: created.listingOptionId,
          linkedMasterProductId: candidate.masterId,
          linkedProductOptionId: candidate.id,
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
    tx: Tx,
    organizationId: string,
    externalId: string,
  ): Promise<ChannelListingHandle | null> {
    return tx.channelListing.findFirst({
      where: {
        organizationId,
        channel: RECONCILIATION_CHANNEL,
        externalId,
        isDeleted: false,
      },
      select: { id: true, masterId: true },
    });
  }

  private async findActiveOptionsByLegacyCode(
    tx: Tx,
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

  private async createListingForCandidate(
    tx: Tx,
    organizationId: string,
    candidate: ProductOptionCandidate,
    externalId: string,
    externalOptionId: string | null,
  ): Promise<{ listingId: string; listingOptionId: string | null }> {
    const listing = await tx.channelListing.create({
      data: {
        organizationId,
        masterId: candidate.masterId,
        channel: RECONCILIATION_CHANNEL,
        externalId,
        status: 'draft',
      },
      select: { id: true },
    });
    let listingOptionId: string | null = null;
    if (externalOptionId) {
      const option = await this.createListingOption(
        tx,
        organizationId,
        listing.id,
        externalOptionId,
        candidate.id,
      );
      listingOptionId = option.id;
    }
    return { listingId: listing.id, listingOptionId };
  }

  private async createListingOption(
    tx: Tx,
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
