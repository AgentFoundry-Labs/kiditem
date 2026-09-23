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
          currentDetailPageRevisionId: true,
          assets: {
            where: {
              organizationId: input.organizationId,
              isDeleted: false,
              assetType: 'image',
              role: { in: ['primary', 'thumbnail'] },
              // 채택하지 않은 AI 후보는 리스팅의 사진이 아니다.
              source: { in: ['upload', 'catalog'] },
            },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            take: 1,
            select: { url: true },
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
          source: 'catalog',
          contentWorkspaceId: { in: workspaces.map((workspace) => workspace.id) },
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          url: true, role: true, sortOrder: true, metadata: true, contentWorkspaceId: true,
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
        // 상세 페이지 아티팩트 표는 없다(KID-313 W3b 가 detail_pages 로 옮긴다) — 현재 revision 이 몰로 가는 상세다.
        detailPageArtifactId: null,
        detailPageRevisionId: workspace?.currentDetailPageRevisionId ?? null,
        thumbnailUrl: thumbnailByListing.get(listing.id) ?? null,
        workspaceImageUrl: workspace?.assets.find(asset => Boolean(asset.url))?.url ?? null,
        providerMedia: workspace ? assets.flatMap((asset) => {
          if (asset.contentWorkspaceId !== workspace.id) return [];
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

/**
 * 리스팅의 대표이미지 = 그 리스팅을 가리키는 활성 작업공간의 현재 대표이미지 자산(KID-313 W3a). 옛
 * `thumbnails` 표는 없다. 작업공간이나 대표이미지가 없는 리스팅은 빠진다.
 */
async function latestThumbnails(
  prisma: Prisma.TransactionClient,
  input: { organizationId: string; listingIds: readonly string[] },
): Promise<Array<{ listingId: string; imageUrl: string }>> {
  if (input.listingIds.length === 0) return [];
  const workspaces = await prisma.contentWorkspace.findMany({
    where: {
      organizationId: input.organizationId,
      channelListingId: { in: [...input.listingIds] },
      status: 'active',
      isDeleted: false,
      currentThumbnailAssetId: { not: null },
    },
    select: { channelListingId: true, currentThumbnailAsset: { select: { url: true, isDeleted: true } } },
  });
  return workspaces.flatMap((workspace) => {
    const asset = workspace.currentThumbnailAsset;
    if (!workspace.channelListingId || !asset || asset.isDeleted || !asset.url.trim()) return [];
    return [{ listingId: workspace.channelListingId, imageUrl: asset.url }];
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
