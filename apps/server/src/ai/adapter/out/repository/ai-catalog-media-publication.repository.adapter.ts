import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type ContentAsset } from '@prisma/client';
import type {
  CatalogMediaPublicationPort,
  ChannelCatalogMedia,
} from '../../../../channels/application/port/out/cross-domain/catalog-media-publication.port';

const BULK_ROWS = 500;

@Injectable()
export class AiCatalogMediaPublicationRepositoryAdapter implements CatalogMediaPublicationPort {
  async publishProviderMedia(
    input: Parameters<CatalogMediaPublicationPort['publishProviderMedia']>[0],
  ) {
    const tx = transactionClient(input.transaction);
    if (input.listings.length === 0) return { imageCount: 0, inactivatedImageCount: 0 };
    const listingIds = input.listings.map((listing) => listing.listingId);
    const ownedListings = await tx.channelListing.findMany({
      where: { organizationId: input.organizationId, id: { in: listingIds } },
      select: { id: true },
    });
    if (ownedListings.length !== new Set(listingIds).size) {
      throw new Error('Catalog media requires owned channel listings');
    }

    const existingWorkspaces = await tx.contentWorkspace.findMany({
      where: {
        organizationId: input.organizationId,
        channelListingId: { in: listingIds },
        ownerType: 'channel_listing',
        status: 'active',
        isDeleted: false,
      },
      select: { id: true, channelListingId: true },
    });
    const workspaceIdsByListing = new Map(
      existingWorkspaces.map((row) => [row.channelListingId!, row.id]),
    );
    const newWorkspaces = input.listings
      .filter((listing) => !workspaceIdsByListing.has(listing.listingId))
      .map((listing) => {
        const id = randomUUID();
        workspaceIdsByListing.set(listing.listingId, id);
        return {
          id,
          organizationId: input.organizationId,
          ownerType: 'channel_listing',
          channelListingId: listing.listingId,
          displayName: listing.displayName,
          normalizedTitle: normalizeContentTitle(listing.displayName),
          createdByUserId: input.userId,
        };
      });
    for (let offset = 0; offset < newWorkspaces.length; offset += BULK_ROWS) {
      await tx.contentWorkspace.createMany({
        data: newWorkspaces.slice(offset, offset + BULK_ROWS),
      });
    }

    // The pointer is authoritative only after this lock. A manual selection made
    // before acquisition is preserved; one made later runs after our transaction.
    const workspaceIds = [...workspaceIdsByListing.values()];
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM content_workspaces
      WHERE organization_id = ${input.organizationId}::uuid
        AND id = ANY(${workspaceIds}::uuid[])
        AND channel_listing_id = ANY(${listingIds}::uuid[])
        AND owner_type = 'channel_listing' AND status = 'active' AND is_deleted = false
      ORDER BY id FOR UPDATE
    `;
    if (locked.length !== workspaceIds.length)
      throw new Error('Catalog workspace changed before publication');
    const workspaces = await tx.contentWorkspace.findMany({
      where: { organizationId: input.organizationId, id: { in: workspaceIds } },
      select: {
        id: true,
        channelListingId: true,
        currentThumbnailSelectionId: true,
        currentThumbnailSelection: {
          select: { contentAssetId: true, contentAsset: { select: { metadata: true } } },
        },
      },
    });
    const workspaceByListing = new Map(workspaces.map((row) => [row.channelListingId!, row]));
    const groups = await tx.contentGenerationGroup.findMany({
      where: {
        organizationId: input.organizationId,
        contentWorkspaceId: { in: workspaceIds },
        groupType: 'workspace_assets',
      },
      select: { id: true, contentWorkspaceId: true },
    });
    const groupByWorkspace = new Map<string, string>();
    for (const group of groups) {
      if (!groupByWorkspace.has(group.contentWorkspaceId))
        groupByWorkspace.set(group.contentWorkspaceId, group.id);
    }
    const newGroups = input.listings
      .filter((listing) => !groupByWorkspace.has(workspaceIdsByListing.get(listing.listingId)!))
      .map((listing) => {
        const contentWorkspaceId = workspaceIdsByListing.get(listing.listingId)!;
        const id = randomUUID();
        groupByWorkspace.set(contentWorkspaceId, id);
        return {
          id,
          organizationId: input.organizationId,
          contentWorkspaceId,
          groupType: 'workspace_assets',
          title: 'Workspace managed assets',
          createdByUserId: input.userId,
          metadata: { sourceType: 'channel_catalog', channel: listing.channel },
        };
      });
    for (let offset = 0; offset < newGroups.length; offset += BULK_ROWS) {
      await tx.contentGenerationGroup.createMany({
        data: newGroups.slice(offset, offset + BULK_ROWS),
      });
    }
    const existingAssets = await tx.contentAsset.findMany({
      where: {
        organizationId: input.organizationId,
        originGenerationGroupId: { in: [...groupByWorkspace.values()] },
      },
    });
    const assetsByGroup = new Map<string, ContentAsset[]>();
    for (const asset of existingAssets) {
      const groupId = asset.originGenerationGroupId!;
      const rows = assetsByGroup.get(groupId) ?? [];
      rows.push(asset);
      assetsByGroup.set(groupId, rows);
    }
    const newAssets: Prisma.ContentAssetCreateManyInput[] = [];
    const updatedAssets: Array<{
      id: string;
      groupId: string;
      url: string;
      role: string;
      sortOrder: number;
      metadata: Record<string, unknown>;
    }> = [];
    const absentAssets: Array<{ id: string; groupId: string; metadata: Record<string, unknown> }> =
      [];
    const selections: Array<{
      id: string;
      organizationId: string;
      contentWorkspaceId: string;
      contentAssetId: string;
      createdByUserId: string;
      listingId: string;
    }> = [];
    let imageCount = 0;
    let inactivatedImageCount = 0;

    for (const listing of input.listings) {
      const workspace = workspaceByListing.get(listing.listingId)!;
      const groupId = groupByWorkspace.get(workspace.id)!;
      const providerAssets = (assetsByGroup.get(groupId) ?? []).filter((asset) =>
        isChannelProviderAsset(asset, listing.channel),
      );
      const desiredKeys = new Set<string>();
      const activeAssets: Array<{ id: string; role: string | null; sortOrder: number }> = [];
      for (const media of uniqueMedia(listing.media)) {
        const assetKeys = providerAssetKeys(workspace.id, listing.channel, media);
        const assetKey = assetKeys[0]!;
        const existing = providerAssets.find((asset) => assetKeys.includes(asset.assetKey));
        desiredKeys.add(existing?.assetKey ?? assetKey);
        const metadata = {
          ...withoutMaterializationMetadata(jsonRecord(existing?.metadata) ?? {}),
          sourceType: 'channel_catalog',
          channel: listing.channel,
          sourceUrl: media.sourceUrl,
          externalOptionId: media.externalOptionId,
          publicationReference: input.publicationReference,
          lastImportRunId: input.publicationReference.id,
          active: true,
        };
        const id = existing?.id ?? randomUUID();
        if (existing) {
          updatedAssets.push({
            id,
            groupId,
            url: media.sourceUrl,
            role: media.role,
            sortOrder: media.sortOrder,
            metadata,
          });
        } else {
          newAssets.push({
            id,
            organizationId: input.organizationId,
            originGenerationGroupId: groupId,
            createdByUserId: input.userId,
            assetKey,
            url: media.sourceUrl,
            assetType: 'image',
            role: media.role,
            sortOrder: media.sortOrder,
            metadata: metadata as Prisma.InputJsonValue,
          });
        }
        activeAssets.push({ id, role: media.role, sortOrder: media.sortOrder });
        imageCount += 1;
      }
      for (const asset of providerAssets) {
        if (desiredKeys.has(asset.assetKey) || asset.isDeleted) continue;
        absentAssets.push({
          id: asset.id,
          groupId,
          metadata: {
            ...(jsonRecord(asset.metadata) ?? {}),
            active: false,
            publicationReference: input.publicationReference,
            lastImportRunId: input.publicationReference.id,
          },
        });
        inactivatedImageCount += 1;
      }
      const primary = activeAssets
        .filter((asset) => asset.role === 'primary')
        .sort((a, b) => a.sortOrder - b.sortOrder)[0];
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
        selections.push({
          id: randomUUID(),
          organizationId: input.organizationId,
          contentWorkspaceId: workspace.id,
          contentAssetId: primary.id,
          createdByUserId: input.userId,
          listingId: listing.listingId,
        });
      }
    }

    for (let offset = 0; offset < newAssets.length; offset += BULK_ROWS) {
      await tx.contentAsset.createMany({ data: newAssets.slice(offset, offset + BULK_ROWS) });
    }
    for (let offset = 0; offset < updatedAssets.length; offset += BULK_ROWS) {
      const batch = updatedAssets.slice(offset, offset + BULK_ROWS);
      const updated = await tx.$executeRaw`
      UPDATE content_assets AS asset
      SET url = incoming.url, storage_key = NULL, mime_type = NULL, width = NULL,
          height = NULL, file_size = NULL, role = incoming.role, sort_order = incoming."sortOrder",
          metadata = incoming.metadata, is_deleted = false, deleted_at = NULL, updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
        AS incoming(id uuid, "groupId" uuid, url text, role text, "sortOrder" integer, metadata jsonb)
      WHERE asset.organization_id = ${input.organizationId}::uuid
        AND asset.id = incoming.id AND asset.origin_generation_group_id = incoming."groupId"
    `;
      if (updated !== batch.length)
        throw new Error('Catalog provider asset changed before publication');
    }
    for (let offset = 0; offset < absentAssets.length; offset += BULK_ROWS) {
      const batch = absentAssets.slice(offset, offset + BULK_ROWS);
      const updated = await tx.$executeRaw`
      UPDATE content_assets AS asset
      SET is_deleted = true, deleted_at = NOW(), metadata = incoming.metadata, updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
        AS incoming(id uuid, "groupId" uuid, metadata jsonb)
      WHERE asset.organization_id = ${input.organizationId}::uuid
        AND asset.id = incoming.id AND asset.origin_generation_group_id = incoming."groupId"
    `;
      if (updated !== batch.length)
        throw new Error('Catalog provider asset changed before publication');
    }
    for (let offset = 0; offset < selections.length; offset += BULK_ROWS) {
      const batch = selections.slice(offset, offset + BULK_ROWS);
      await tx.contentWorkspaceThumbnailSelection.createMany({
        data: batch.map(({ listingId: _listingId, ...selection }) => selection),
      });
      const updated = await tx.$executeRaw`
        UPDATE content_workspaces AS workspace
        SET current_thumbnail_selection_id = incoming.id, updated_at = NOW()
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          AS incoming(id uuid, "contentWorkspaceId" uuid, "listingId" uuid)
        WHERE workspace.organization_id = ${input.organizationId}::uuid
          AND workspace.id = incoming."contentWorkspaceId" AND workspace.channel_listing_id = incoming."listingId"
          AND workspace.owner_type = 'channel_listing' AND workspace.status = 'active' AND workspace.is_deleted = false
      `;
      if (updated !== batch.length) throw new Error('Catalog workspace changed before publication');
    }
    return { imageCount, inactivatedImageCount };
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
  return [...unique.values()].sort(
    (left, right) =>
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
    ? (value as Record<string, unknown>)
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
