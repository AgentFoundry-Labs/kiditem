import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type ContentAsset } from '@prisma/client';
import type { CoupangCatalogMediaV1 } from '@kiditem/shared/coupang-catalog-snapshot';
import type { CatalogMediaPublicationPort } from '../../../../channels/application/port/out/cross-domain/catalog-media-publication.port';

type ProviderAssetState = 'pending' | 'ready' | 'failed';

@Injectable()
export class AiCatalogMediaPublicationAdapter
implements CatalogMediaPublicationPort {
  async publishProviderMedia(
    input: Parameters<CatalogMediaPublicationPort['publishProviderMedia']>[0],
  ) {
    const tx = transactionClient(input.transaction);
    let imageCount = 0;
    let pendingImageCount = 0;
    let readyImageCount = 0;
    let failedImageCount = 0;
    let inactivatedImageCount = 0;

    for (const listing of input.listings) {
      let workspace = await tx.contentWorkspace.findFirst({
        where: {
          organizationId: input.organizationId,
          channelListingId: listing.listingId,
          ownerType: 'channel_listing',
          status: 'active',
          isDeleted: false,
        },
        select: {
          id: true,
          currentThumbnailSelectionId: true,
          currentThumbnailSelection: {
            select: { contentAssetId: true, contentAsset: { select: { metadata: true } } },
          },
        },
      });
      workspace ??= await tx.contentWorkspace.create({
        data: {
          organizationId: input.organizationId,
          ownerType: 'channel_listing',
          channelListingId: listing.listingId,
          displayName: listing.displayName,
          normalizedTitle: normalizeContentTitle(listing.displayName),
          createdByUserId: input.userId,
        },
        select: {
          id: true,
          currentThumbnailSelectionId: true,
          currentThumbnailSelection: {
            select: { contentAssetId: true, contentAsset: { select: { metadata: true } } },
          },
        },
      });

      let group = await tx.contentGenerationGroup.findFirst({
        where: {
          organizationId: input.organizationId,
          contentWorkspaceId: workspace.id,
          groupType: 'workspace_assets',
        },
        select: { id: true },
      });
      group ??= await tx.contentGenerationGroup.create({
        data: {
          organizationId: input.organizationId,
          contentWorkspaceId: workspace.id,
          groupType: 'workspace_assets',
          title: 'Workspace managed assets',
          createdByUserId: input.userId,
          metadata: { sourceType: 'coupang_catalog' },
        },
        select: { id: true },
      });

      const existingAssets = await tx.contentAsset.findMany({
        where: {
          organizationId: input.organizationId,
          originGenerationGroupId: group.id,
        },
      });
      const providerAssets = existingAssets.filter(isCoupangProviderAsset);
      const desiredKeys = new Set<string>();
      const activeAssets: ContentAsset[] = [];
      for (const media of uniqueMedia(listing.media)) {
        const assetKey = providerAssetKey(workspace.id, media);
        desiredKeys.add(assetKey);
        const existing = providerAssets.find((asset) => asset.assetKey === assetKey);
        const existingMetadata = jsonRecord(existing?.metadata) ?? {};
        const materializationStatus = providerState(existing, existingMetadata);
        const metadata = {
          ...existingMetadata,
          sourceType: 'coupang_catalog',
          sourceUrl: media.sourceUrl,
          externalOptionId: media.externalOptionId,
          materializationStatus,
          lastImportRunId: input.sourceImportRunId,
          active: true,
        };
        const asset = existing
          ? await tx.contentAsset.update({
              where: { id: existing.id },
              data: {
                url: existing.storageKey ? existing.url : media.sourceUrl,
                role: media.role,
                sortOrder: media.sortOrder,
                metadata,
                isDeleted: false,
                deletedAt: null,
              },
            })
          : await tx.contentAsset.create({
              data: {
                organizationId: input.organizationId,
                originGenerationGroupId: group.id,
                createdByUserId: input.userId,
                assetKey,
                url: media.sourceUrl,
                assetType: 'image',
                role: media.role,
                sortOrder: media.sortOrder,
                metadata,
              },
            });
        activeAssets.push(asset);
        imageCount += 1;
        if (materializationStatus === 'ready') readyImageCount += 1;
        else if (materializationStatus === 'failed') failedImageCount += 1;
        else pendingImageCount += 1;
      }

      const absentIds = providerAssets
        .filter((asset) => !desiredKeys.has(asset.assetKey) && !asset.isDeleted)
        .map((asset) => asset.id);
      if (absentIds.length > 0) {
        for (const asset of providerAssets.filter((item) => absentIds.includes(item.id))) {
          await tx.contentAsset.update({
            where: { id: asset.id },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
              metadata: {
                ...(jsonRecord(asset.metadata) ?? {}),
                active: false,
                lastImportRunId: input.sourceImportRunId,
              },
            },
          });
        }
        inactivatedImageCount += absentIds.length;
      }

      const primary = activeAssets
        .filter((asset) => asset.role === 'primary')
        .sort((left, right) => left.sortOrder - right.sortOrder)[0];
      const currentIsProvider = workspace.currentThumbnailSelection
        ? isProviderMetadata(workspace.currentThumbnailSelection.contentAsset.metadata)
        : false;
      if (
        primary &&
        (!workspace.currentThumbnailSelectionId || currentIsProvider) &&
        workspace.currentThumbnailSelection?.contentAssetId !== primary.id
      ) {
        const selection = await tx.contentWorkspaceThumbnailSelection.create({
          data: {
            organizationId: input.organizationId,
            contentWorkspaceId: workspace.id,
            contentAssetId: primary.id,
            createdByUserId: input.userId,
          },
          select: { id: true },
        });
        await tx.contentWorkspace.update({
          where: { id: workspace.id },
          data: { currentThumbnailSelectionId: selection.id },
        });
      }
    }

    return {
      imageCount,
      pendingImageCount,
      readyImageCount,
      failedImageCount,
      inactivatedImageCount,
    };
  }
}

function transactionClient(value: unknown): Prisma.TransactionClient {
  if (!value || typeof value !== 'object' || !('contentWorkspace' in value)) {
    throw new Error('Catalog media publication requires a Prisma transaction');
  }
  return value as Prisma.TransactionClient;
}

function uniqueMedia(media: CoupangCatalogMediaV1[]): CoupangCatalogMediaV1[] {
  const unique = new Map<string, CoupangCatalogMediaV1>();
  for (const item of media) {
    const key = `${item.role}\u0000${item.externalOptionId ?? ''}\u0000${item.sourceUrl}`;
    const existing = unique.get(key);
    if (!existing || item.sortOrder < existing.sortOrder) unique.set(key, item);
  }
  return [...unique.values()].sort((left, right) =>
    left.sortOrder - right.sortOrder || left.sourceUrl.localeCompare(right.sourceUrl),
  );
}

function providerAssetKey(workspaceId: string, media: CoupangCatalogMediaV1): string {
  const identity = `${media.role}\u0000${media.externalOptionId ?? ''}\u0000${media.sourceUrl}`;
  const hash = createHash('sha256').update(identity).digest('hex');
  return `coupang-provider:${workspaceId}:${hash}`;
}

function providerState(
  existing: ContentAsset | undefined,
  metadata: Record<string, unknown>,
): ProviderAssetState {
  if (existing?.storageKey) return 'ready';
  return metadata.materializationStatus === 'failed' ? 'failed' : 'pending';
}

function isCoupangProviderAsset(asset: ContentAsset): boolean {
  return isProviderMetadata(asset.metadata);
}

function isProviderMetadata(value: unknown): boolean {
  return jsonRecord(value)?.sourceType === 'coupang_catalog';
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeContentTitle(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
  return normalized || '상세페이지 작업';
}
