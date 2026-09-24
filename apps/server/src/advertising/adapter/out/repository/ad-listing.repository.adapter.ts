import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../../../channels/application/port/in/channel-option-recipe.port';
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
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
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
    const listingRows = await this.channelListings.readDisplayFacts(ownerTransaction(tx), { organizationId, listingIds: ids, activeOnly: true });
    const summaries = await this.channelRecipes.readListingProductSummaries(ownerTransaction(tx), { organizationId, listingIds: listingRows.map((row) => row.id) });
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
    const row = await this.channelListings.readDisplayFacts(ownerTransaction(this.prisma), { organizationId, listingIds: [listingId], activeOnly: true });
    return row.length === 1;
  }
}

function uniqueListingIds(listingIds: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(listingIds.filter((id): id is string => Boolean(id))),
  );
}
