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
    input: { organizationId: string; listings: readonly ListingRef[] },
  ) {
    return latestThumbnails(ownerTransactionClient(transaction), input);
  }

  async findForListings(input: ListingContentRequest): Promise<ListingContentView[]> {
    const listings = [...new Map(input.listings.map((listing) => [listing.id, listing])).values()];
    if (listings.length === 0) return [];
    const workspaceIdByListing = await resolveListingWorkspaceIds(this.prisma, { organizationId: input.organizationId, listings });
    const workspaces = await this.prisma.contentWorkspace.findMany({
        where: { organizationId: input.organizationId, id: { in: [...new Set(workspaceIdByListing.values())] } },
        select: {
          id: true,
          currentDetailPageRevisionId: true,
          currentThumbnailAsset: { select: { url: true, isDeleted: true } },
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
      });
    const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
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
    return listings.map((listing) => {
      const workspaceId = workspaceIdByListing.get(listing.id);
      const workspace = workspaceId ? workspaceById.get(workspaceId) : undefined;
      return {
        listingId: listing.id,
        workspaceId: workspace?.id ?? null,
        detailPageRevisionId: workspace?.currentDetailPageRevisionId ?? null,
        thumbnailUrl: liveAssetUrl(workspace?.currentThumbnailAsset ?? null),
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

type ListingRef = { id: string; salesProductId: string | null };

/**
 * 리스팅이 보여 주는 작업공간(KID-313 W3 리뷰 M1). 판매 상품의 활성 작업공간이 먼저다 — 등록은 리스팅을 상품
 * 작업공간에 붙이지 않고, 리스팅은 `salesProductId` 로 그곳에 닿는다. 상품 작업공간이 없으면(카탈로그 import 로만
 * 생긴 리스팅) 리스팅 소유 작업공간을 쓴다. 상품 작업공간에서 리스팅 id 를 찾지 않는다.
 */
async function resolveListingWorkspaceIds(
  prisma: Prisma.TransactionClient,
  input: { organizationId: string; listings: readonly ListingRef[] },
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (input.listings.length === 0) return result;
  const salesProductIds = [...new Set(input.listings.flatMap((listing) => listing.salesProductId ? [listing.salesProductId] : []))];
  const rows = await prisma.contentWorkspace.findMany({
    where: {
      organizationId: input.organizationId,
      status: 'active',
      isDeleted: false,
      OR: [
        ...(salesProductIds.length > 0 ? [{ ownerType: 'sales_product', salesProductId: { in: salesProductIds } }] : []),
        { ownerType: 'channel_listing', channelListingId: { in: input.listings.map((listing) => listing.id) } },
      ],
    },
    select: { id: true, ownerType: true, salesProductId: true, channelListingId: true },
  });
  const byProduct = new Map(rows.filter((row) => row.ownerType === 'sales_product').map((row) => [row.salesProductId, row.id]));
  const byListing = new Map(rows.filter((row) => row.ownerType === 'channel_listing').map((row) => [row.channelListingId, row.id]));
  for (const listing of input.listings) {
    const workspaceId = (listing.salesProductId ? byProduct.get(listing.salesProductId) : undefined) ?? byListing.get(listing.id);
    if (workspaceId) result.set(listing.id, workspaceId);
  }
  return result;
}

/**
 * 리스팅의 대표이미지 = 그 리스팅이 닿는 활성 작업공간(상품 작업공간, 없으면 리스팅 작업공간)의 현재 대표이미지
 * 자산(KID-313 W3a). 작업공간이나 대표이미지가 없는 리스팅은 빠진다.
 */
async function latestThumbnails(
  prisma: Prisma.TransactionClient,
  input: { organizationId: string; listings: readonly ListingRef[] },
): Promise<Array<{ listingId: string; imageUrl: string }>> {
  const workspaceIdByListing = await resolveListingWorkspaceIds(prisma, input);
  if (workspaceIdByListing.size === 0) return [];
  const workspaces = await prisma.contentWorkspace.findMany({
    where: { organizationId: input.organizationId, id: { in: [...new Set(workspaceIdByListing.values())] } },
    select: { id: true, currentThumbnailAsset: { select: { url: true, isDeleted: true } } },
  });
  const assetByWorkspace = new Map(workspaces.map((workspace) => [workspace.id, workspace.currentThumbnailAsset]));
  return input.listings.flatMap((listing) => {
    const workspaceId = workspaceIdByListing.get(listing.id);
    const imageUrl = liveAssetUrl(workspaceId ? assetByWorkspace.get(workspaceId) ?? null : null);
    return imageUrl ? [{ listingId: listing.id, imageUrl }] : [];
  });
}

function liveAssetUrl(asset: { url: string; isDeleted: boolean } | null): string | null {
  return asset && !asset.isDeleted && asset.url.trim() ? asset.url : null;
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
