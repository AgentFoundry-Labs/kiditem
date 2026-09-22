import { readListingProductIds } from '../../../../channels/read/listing-product-summary.reader';
// Product identity and published grade hydrated through a scoped channel link.

import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { readProductAbcPublication } from '../../../../products/adapter/out/persistence/read/product-abc-publication.reader';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';
import type {
  AdListingRepositoryPort,
  ScopedAdListingReadModel,
  ScopedAdListingSnapshot,
} from '../../../application/port/out/repository/ad-listing.repository.port';

@Injectable()
export class AdListingRepositoryAdapter implements AdListingRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly products?: ProductTransactionalReadPort,
  ) {}

  async findScopedAdListings(
    organizationId: string,
    listingIds: Array<string | null | undefined>,
  ): Promise<Map<string, ScopedAdListingReadModel>> {
    const ids = uniqueListingIds(listingIds);
    if (ids.length === 0) return new Map();

    return (await this.readScopedAdListings(organizationId, ids)).listings;
  }

  async findScopedAdListingsWithAbcCutoff(
    organizationId: string,
    listingIds: Array<string | null | undefined>,
  ): Promise<ScopedAdListingSnapshot> {
    // Read even without listing ids: the publication cutoff still applies.
    return this.readScopedAdListings(organizationId, uniqueListingIds(listingIds));
  }

  private readScopedAdListings(
    organizationId: string,
    ids: string[],
  ): Promise<ScopedAdListingSnapshot> {
    return this.prisma.$transaction(
      (tx) => this.findScopedAdListingsSnapshot(tx, organizationId, ids),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async findScopedAdListingsSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    ids: string[],
  ): Promise<ScopedAdListingSnapshot> {
    const listingRows = await tx.channelListing.findMany({
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
      },
    });
    const summaries = await readListingProductIds(tx, { organizationId, listingIds: listingRows.map((row) => row.id) });
    const listings = listingRows.map((row) => ({ ...row, masterProductId: summaries.get(row.id) ?? null }));
    const masterProductIds = [...new Set(listings.flatMap((listing) =>
      listing.masterProductId ? [listing.masterProductId] : []))];
    const identities = this.products
      ? await this.products.readSourceIdentities(
        { client: tx },
        { organizationId, selector: { kind: 'ids', values: masterProductIds } },
      )
      : [];
    const identityById = new Map(identities.map((identity) => [
      identity.masterProductId,
      identity,
    ]));
    // One publication read yields the grades and the cutoff that fences them.
    const abc = await readProductAbcPublication(tx, {
      organizationId,
      masterProductIds,
    });
    const gradeByProductId = new Map(abc.products.flatMap((product) =>
      product.evaluation
        ? [[product.masterProductId, product.evaluation.abcGrade] as const]
        : []));
    const out = new Map<string, ScopedAdListingReadModel>();
    for (const listing of listings) {
      const identity = listing.masterProductId
        ? identityById.get(listing.masterProductId) ?? null
        : null;
      out.set(listing.id, {
        id: listing.id,
        externalId: listing.externalId,
        channelName: listing.channelName,
        masterProduct: identity ? {
          id: identity.masterProductId,
          code: identity.code,
          name: identity.name,
          abcGrade: gradeByProductId.get(identity.masterProductId) ?? null,
        } : {
          id: listing.id,
          code: listing.externalId,
          name: listing.displayName ?? listing.channelName ?? listing.externalId,
          abcGrade: null,
        },
      });
    }
    return {
      listings: out,
      abcOfficialCutoffDate: abc.publication?.officialCutoffDate ?? null,
    };
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
}

function uniqueListingIds(listingIds: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(listingIds.filter((id): id is string => Boolean(id))),
  );
}
