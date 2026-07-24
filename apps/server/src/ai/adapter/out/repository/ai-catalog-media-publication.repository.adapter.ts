import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type ContentAsset } from '@prisma/client';
import type {
  CatalogMediaPublicationPort,
  ChannelCatalogMedia,
} from '../../../../channels/application/port/out/cross-domain/catalog-media-publication.port';

@Injectable()
export class AiCatalogMediaPublicationRepositoryAdapter
implements CatalogMediaPublicationPort {
  async publishProviderMedia(
    input: Parameters<CatalogMediaPublicationPort['publishProviderMedia']>[0],
  ) {
    const tx = transactionClient(input.transaction);
    let imageCount = 0;
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
          metadata: { sourceType: 'channel_catalog', channel: listing.channel },
        },
        select: { id: true },
      });

      const existingAssets = await tx.contentAsset.findMany({
        where: {
          organizationId: input.organizationId,
          originGenerationGroupId: group.id,
        },
      });
      const providerAssets = existingAssets.filter((asset) =>
        isChannelProviderAsset(asset, listing.channel));
      const desiredKeys = new Set<string>();
      const activeAssets: ContentAsset[] = [];
      for (const media of uniqueMedia(listing.media)) {
        const assetKeys = providerAssetKeys(workspace.id, listing.channel, media);
        const assetKey = assetKeys[0]!;
        const existing = providerAssets.find((asset) => assetKeys.includes(asset.assetKey));
        desiredKeys.add(existing?.assetKey ?? assetKey);
        const existingMetadata = jsonRecord(existing?.metadata) ?? {};
        const metadata = {
          ...withoutMaterializationMetadata(existingMetadata),
          sourceType: 'channel_catalog',
          channel: listing.channel,
          sourceUrl: media.sourceUrl,
          externalOptionId: media.externalOptionId,
          publicationReference: input.publicationReference,
          ...(input.publicationReference.type === 'source_import_run'
            ? { lastImportRunId: input.publicationReference.id }
            : {}),
          active: true,
        };
        const asset = existing
          ? await tx.contentAsset.update({
              where: {
                id_organizationId: {
                  id: existing.id,
                  organizationId: input.organizationId,
                },
              },
              data: {
                url: media.sourceUrl,
                storageKey: null,
                mimeType: null,
                width: null,
                height: null,
                fileSize: null,
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
      }

      const absentIds = providerAssets
        .filter((asset) => !desiredKeys.has(asset.assetKey) && !asset.isDeleted)
        .map((asset) => asset.id);
      if (absentIds.length > 0) {
        for (const asset of providerAssets.filter((item) => absentIds.includes(item.id))) {
          await tx.contentAsset.update({
            where: {
              id_organizationId: {
                id: asset.id,
                organizationId: input.organizationId,
              },
            },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
              metadata: {
                ...(jsonRecord(asset.metadata) ?? {}),
                active: false,
                publicationReference: input.publicationReference,
                ...(input.publicationReference.type === 'source_import_run'
                  ? { lastImportRunId: input.publicationReference.id }
                  : {}),
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
        ? isProviderMetadata(
            workspace.currentThumbnailSelection.contentAsset.metadata,
            listing.channel,
          )
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
          where: {
            id_organizationId: {
              id: workspace.id,
              organizationId: input.organizationId,
            },
          },
          data: { currentThumbnailSelectionId: selection.id },
        });
      }
    }

    return {
      imageCount,
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

function uniqueMedia(media: ChannelCatalogMedia[]): ChannelCatalogMedia[] {
  const unique = new Map<string, ChannelCatalogMedia>();
  for (const item of media) {
    const key = `${item.role}\u0000${item.externalOptionId ?? ''}\u0000${item.sourceUrl}`;
    const existing = unique.get(key);
    if (!existing || item.sortOrder < existing.sortOrder) unique.set(key, item);
  }
  return [...unique.values()].sort((left, right) =>
    left.sortOrder - right.sortOrder || left.sourceUrl.localeCompare(right.sourceUrl),
  );
}

function providerAssetKeys(
  workspaceId: string,
  channel: string,
  media: ChannelCatalogMedia,
): string[] {
  const identity = `${media.role}\u0000${media.externalOptionId ?? ''}\u0000${media.sourceUrl}`;
  const hash = createHash('sha256').update(identity).digest('hex');
  return [
    `channel-provider:${channel}:${workspaceId}:${hash}`,
    ...(channel === 'coupang' ? [`coupang-provider:${workspaceId}:${hash}`] : []),
  ];
}

function isChannelProviderAsset(asset: ContentAsset, channel: string): boolean {
  return isProviderMetadata(asset.metadata, channel);
}

function isProviderMetadata(value: unknown, channel: string): boolean {
  const metadata = jsonRecord(value);
  if (metadata?.sourceType === 'coupang_catalog') return channel === 'coupang';
  return metadata?.sourceType === 'channel_catalog' && metadata.channel === channel;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function withoutMaterializationMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...metadata };
  for (const key of [
    'materializationStatus',
    'materializedAtMs',
    'materializationLeaseToken',
    'materializationLeaseExpiresAtMs',
    'materializationAttemptCount',
    'materializationError',
    'nextMaterializationAttemptAtMs',
  ]) {
    delete result[key];
  }
  return result;
}

function normalizeContentTitle(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
  return normalized || '상세페이지 작업';
}
