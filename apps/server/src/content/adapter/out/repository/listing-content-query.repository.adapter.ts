import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ListingContentQueryPort,
  ListingContentRequest,
  ListingContentView,
} from '../../../application/port/in/workspace/listing-content-query.port';

@Injectable()
export class ListingContentQueryRepositoryAdapter implements ListingContentQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  readLatestListingThumbnails(
    transaction: OwnerTransaction,
    input: { organizationId: string; listingIds: readonly string[] },
  ) {
    return latestThumbnails(ownerTransactionClient(transaction), input);
  }

  async findForListings(input: ListingContentRequest): Promise<ListingContentView[]> {
    const listings = [...new Map(input.listings.map((listing) => [listing.id, listing])).values()];
    if (listings.length === 0) return [];
    const listingIds = listings.map((listing) => listing.id);
    const [workspaces, thumbnails] = await Promise.all([
      this.prisma.contentWorkspace.findMany({
        where: {
          organizationId: input.organizationId,
          // The listing pointer, not the owner type, decides whose content a
          // listing shows: registration attaches the listing to the draft's own
          // workspace, and a listing with no draft keeps its own.
          channelListingId: { in: listingIds },
          ownerType: { in: ['sales_product', 'channel_listing'] },
          status: 'active',
          isDeleted: false,
        },
        select: {
          id: true,
          channelListingId: true,
          currentDetailPageArtifactId: true,
          currentDetailPageRevisionId: true,
          contentGenerationGroups: {
            where: { organizationId: input.organizationId },
            take: 3,
            select: { originatingAssets: {
              where: { organizationId: input.organizationId, isDeleted: false, assetType: 'image', role: { in: ['primary', 'thumbnail'] } },
              take: 1, select: { url: true },
            } },
          },
          currentThumbnailSelection: {
            select: { contentAsset: { select: { url: true } } },
          },
        },
      }),
      latestThumbnails(this.prisma, { organizationId: input.organizationId, listingIds }),
    ]);
    const assets = input.includeProviderMedia && workspaces.length > 0
      ? await this.prisma.contentAsset.findMany({
        where: {
          organizationId: input.organizationId,
          assetType: 'image',
          role: { in: ['primary', 'detail', 'option'] },
          isDeleted: false,
          originGenerationGroup: {
            organizationId: input.organizationId,
            groupType: 'workspace_assets',
            contentWorkspaceId: { in: workspaces.map((workspace) => workspace.id) },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          url: true, role: true, sortOrder: true, metadata: true,
          originGenerationGroup: { select: { contentWorkspaceId: true } },
        },
      })
      : [];
    const workspaceByListing = new Map(workspaces.map((workspace) => [workspace.channelListingId, workspace]));
    const thumbnailByListing = new Map(thumbnails.map((thumbnail) => [thumbnail.listingId, thumbnail.imageUrl]));
    return listings.map((listing) => {
      const workspace = workspaceByListing.get(listing.id);
      return {
        listingId: listing.id,
        workspaceId: workspace?.id ?? null,
        detailPageArtifactId: workspace?.currentDetailPageArtifactId ?? null,
        detailPageRevisionId: workspace?.currentDetailPageRevisionId ?? null,
        thumbnailUrl: workspace?.currentThumbnailSelection?.contentAsset.url
          ?? thumbnailByListing.get(listing.id) ?? null,
        workspaceImageUrl: workspace?.contentGenerationGroups.flatMap(group => group.originatingAssets).find(asset => Boolean(asset.url))?.url ?? null,
        providerMedia: workspace ? assets.flatMap((asset) => {
          if (asset.originGenerationGroup?.contentWorkspaceId !== workspace.id) return [];
          const metadata = jsonRecord(asset.metadata);
          if (!asset.url.trim() || metadata?.active === false
            || !isChannelProviderMetadata(metadata, listing.channel)) return [];
          return [{
            sourceUrl: asset.url,
            role: asset.role ?? 'detail',
            sortOrder: asset.sortOrder,
            externalOptionIds: optionIdsFromMetadata(metadata),
          }];
        }) : [],
      };
    });
  }
}

async function latestThumbnails(
  prisma: Prisma.TransactionClient,
  input: { organizationId: string; listingIds: readonly string[] },
): Promise<Array<{ listingId: string; imageUrl: string }>> {
  if (input.listingIds.length === 0) return [];
  return prisma.thumbnail.findMany({
    where: { organizationId: input.organizationId, listingId: { in: [...input.listingIds] }, status: 'active' },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    distinct: ['listingId'],
    select: { listingId: true, imageUrl: true },
  });
}

function isChannelProviderMetadata(metadata: Record<string, unknown> | null, channel: string): boolean {
  if (metadata?.sourceType === 'coupang_catalog') return channel === 'coupang';
  return metadata?.sourceType === 'channel_catalog' && metadata.channel === channel;
}

function optionIdsFromMetadata(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const plural = Array.isArray(metadata.externalOptionIds) ? metadata.externalOptionIds : [];
  return [...new Set([...plural, metadata.externalOptionId]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
