// Product-owned advertising metadata hydrated through a scoped channel link.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { readPublishedProductAbcGrades } from '../../../../products/read/product-abc-publication.reader';
import type {
  AdListingRepositoryPort,
  ScopedAdListingReadModel,
} from '../../../application/port/out/repository/ad-listing.repository.port';

@Injectable()
export class AdListingRepositoryAdapter implements AdListingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findScopedAdListings(
    organizationId: string,
    listingIds: Array<string | null | undefined>,
  ): Promise<Map<string, ScopedAdListingReadModel>> {
    const ids = Array.from(
      new Set(listingIds.filter((id): id is string => Boolean(id))),
    );
    if (ids.length === 0) return new Map();

    return this.prisma.$transaction(
      (tx) => this.findScopedAdListingsSnapshot(tx, organizationId, ids),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async findScopedAdListingsSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    ids: string[],
  ): Promise<Map<string, ScopedAdListingReadModel>> {
    const listings = await tx.channelListing.findMany({
      where: {
        id: { in: ids },
        organizationId,
        isActive: true,
      },
      select: {
        id: true,
        externalId: true,
        channelName: true,
        displayName: true,
        masterProduct: {
          select: {
            id: true,
            code: true,
            name: true,
            adTier: true,
          },
        },
      },
    });
    const gradeByProductId = await readPublishedProductAbcGrades(tx, {
      organizationId,
      masterProductIds: listings.flatMap((listing) =>
        listing.masterProduct ? [listing.masterProduct.id] : []),
    });
    const out = new Map<string, ScopedAdListingReadModel>();
    for (const listing of listings) {
      out.set(listing.id, {
        id: listing.id,
        externalId: listing.externalId,
        channelName: listing.channelName,
        masterProduct: listing.masterProduct ? {
          ...listing.masterProduct,
          abcGrade: gradeByProductId.get(listing.masterProduct.id) ?? null,
        } : {
          id: listing.id,
          code: listing.externalId,
          name: listing.displayName ?? listing.channelName ?? listing.externalId,
          abcGrade: null,
          adTier: null,
        },
      });
    }
    return out;
  }

  async verifyListingOwnership(
    listingId: string,
    organizationId: string,
  ): Promise<boolean> {
    const row = await this.prisma.channelListing.findFirst({
      where: { id: listingId, organizationId, isActive: true },
      select: { id: true },
    });
    return row != null;
  }

  async changeAdTier(
    listingId: string,
    organizationId: string,
    nextTier: string | null,
  ): Promise<boolean> {
    const updated = await this.prisma.masterProduct.updateMany({
      where: {
        organizationId,
        channelListings: {
          some: { id: listingId, organizationId, isActive: true },
        },
      },
      data: { adTier: nextTier },
    });
    return updated.count === 1;
  }

}
