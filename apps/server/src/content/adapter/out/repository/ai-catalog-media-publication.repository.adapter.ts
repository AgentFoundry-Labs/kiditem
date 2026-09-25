import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { KiditemError } from '@kiditem/shared/errors';
import { Prisma, type ContentAsset } from '@prisma/client';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import {
  CHANNEL_LISTING_QUERY_PORT,
  type ChannelListingQueryPort,
} from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import type {
  CatalogMediaOptionIdentityRemap,
  CatalogMediaPublicationScope,
  CatalogMediaPublicationPort,
  ChannelCatalogMedia,
} from '../../../../channels/application/port/out/cross-domain/catalog-media-publication.port';
import {
  planCatalogAssetRepublication,
  type CatalogPublicationHistoryKey,
} from '../../../domain/catalog-media/catalog-asset-republication';

const BULK_ROWS = 500;

@Injectable()
export class AiCatalogMediaPublicationRepositoryAdapter implements CatalogMediaPublicationPort {
  constructor(
    @Inject(CHANNEL_LISTING_QUERY_PORT)
    private readonly channelListings: ChannelListingQueryPort,
  ) {}

  async publishProviderMedia(
    input: Parameters<CatalogMediaPublicationPort['publishProviderMedia']>[0],
  ) {
    const tx = transactionClient(input.transaction);
    if (input.listings.length === 0) return { imageCount: 0, inactivatedImageCount: 0 };
    const listingIds = input.listings.map((listing) => listing.listingId);
    await this.channelListings.assertOwnedIds(ownerTransaction(tx), {
      organizationId: input.organizationId,
      listingIds,
    });
    const optionIdentityRemapsByListing = new Map<string, ReadonlyMap<string, string>>();
    for (const listing of input.listings) {
      const remaps = normalizeOptionIdentityRemaps(listing.optionIdentityRemaps);
      if (remaps.size > 0) optionIdentityRemapsByListing.set(listing.listingId, remaps);
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
        // 리스팅 작업공간은 이름을 갖지 않는다 — 이름은 리스팅(Channels)에서 읽는다.
        return {
          id,
          organizationId: input.organizationId,
          ownerType: 'channel_listing',
          channelListingId: listing.listingId,
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
      throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CATALOG_WORKSPACE_FENCE_LOST' } });
    const workspaces = await tx.contentWorkspace.findMany({
      where: { organizationId: input.organizationId, id: { in: workspaceIds } },
      select: {
        id: true,
        channelListingId: true,
        currentThumbnailAssetId: true,
        currentThumbnailAsset: { select: { metadata: true } },
      },
    });
    const workspaceByListing = new Map(workspaces.map((row) => [row.channelListingId!, row]));
    // 카탈로그 사진은 워크스페이스가 소유한 content_assets 행이다(KID-313 W3a, source=catalog). 같은 워크스페이스의
    // 업로드 · AI 후보 · 상세 이미지는 제공자 사진이 아니라 건드리지 않는다(metadata 로 가른다).
    const existingAssets = await tx.contentAsset.findMany({
      where: {
        organizationId: input.organizationId,
        contentWorkspaceId: { in: workspaceIds },
      },
    });
    const listingById = new Map(input.listings.map((listing) => [listing.listingId, listing]));
    const listingIdByWorkspace = new Map(
      [...workspaceIdsByListing].map(([listingId, workspaceId]) => [workspaceId, listingId]),
    );
    const remappedMetadataUpdates: Array<{
      id: string;
      workspaceId: string;
      metadata: Record<string, unknown>;
    }> = [];
    const assetsByWorkspace = new Map<string, ContentAsset[]>();
    for (const asset of existingAssets) {
      const workspaceId = asset.contentWorkspaceId;
      const listingId = listingIdByWorkspace.get(workspaceId);
      const listing = listingId ? listingById.get(listingId) : undefined;
      const remappedMetadata = listing
        ? remapProviderOptionMetadata(
            asset.metadata,
            listing.channel,
            optionIdentityRemapsByListing.get(listingId!),
          )
        : null;
      const effectiveAsset = remappedMetadata
        ? { ...asset, metadata: remappedMetadata as Prisma.JsonValue }
        : asset;
      if (remappedMetadata) {
        remappedMetadataUpdates.push({ id: asset.id, workspaceId, metadata: remappedMetadata });
      }
      const rows = assetsByWorkspace.get(workspaceId) ?? [];
      rows.push(effectiveAsset);
      assetsByWorkspace.set(workspaceId, rows);
    }
    // Remap every provider asset in the locked workspace, including assets
    // outside the current publication scope and source-inactive selections.
    // This metadata-only update intentionally leaves URL/storage/materialized
    // columns and all non-provider/manual assets untouched.
    for (let offset = 0; offset < remappedMetadataUpdates.length; offset += BULK_ROWS) {
      const batch = remappedMetadataUpdates.slice(offset, offset + BULK_ROWS);
      const updated = await tx.$executeRaw`
        UPDATE content_assets AS asset
        SET metadata = incoming.metadata, updated_at = NOW()
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          AS incoming(id uuid, "workspaceId" uuid, metadata jsonb)
        WHERE asset.organization_id = ${input.organizationId}::uuid
          AND asset.id = incoming.id
          AND asset.content_workspace_id = incoming."workspaceId"
      `;
      if (updated !== batch.length) {
        throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CATALOG_OPTION_REMAP_FENCE_LOST' } });
      }
    }
    const newAssets: Prisma.ContentAssetCreateManyInput[] = [];
    const updatedAssets: Array<{
      id: string;
      workspaceId: string;
      url: string;
      role: string;
      sortOrder: number;
      storageKey: string | null;
      mimeType: string | null;
      width: number | null;
      height: number | null;
      fileSize: number | null;
      metadata: Record<string, unknown>;
    }> = [];
    const absentAssets: Array<{ id: string; workspaceId: string; metadata: Record<string, unknown> }> =
      [];
    const preservedAbsentAssets: Array<{
      id: string;
      workspaceId: string;
      metadata: Record<string, unknown>;
    }> = [];
    const preservedOptionAssets: Array<{
      id: string;
      workspaceId: string;
      metadata: Record<string, unknown>;
    }> = [];
    const pointerUpdates: Array<{
      assetId: string | null;
      contentWorkspaceId: string;
      listingId: string;
    }> = [];
    let imageCount = 0;
    let inactivatedImageCount = 0;
    // The domain comparison ignores exactly these keys; `satisfies` keeps the two lists equal.
    const publicationHistory = {
      publicationReference: input.publicationReference,
      publicationScope: input.publicationScope ?? 'full',
      sourceImportRunId: input.publicationReference.id,
      lastImportRunId: input.publicationReference.id,
    } satisfies Record<CatalogPublicationHistoryKey, unknown>;

    for (const listing of input.listings) {
      const workspace = workspaceByListing.get(listing.listingId)!;
      const workspaceId = workspace.id;
      // 대표이미지 포인터가 카탈로그 몫인가: 이 publication 이 세운 자산에만 `catalogRepresentative` 표시가 있다.
      // 운영자가 다른 자산(업로드 · AI · 다른 카탈로그 사진)을 채택했으면 표시가 없어 그대로 둔다.
      const currentSelectedAssetId = workspace.currentThumbnailAssetId;
      const currentSelectionIsCatalogOwned = Boolean(
        currentSelectedAssetId
        && jsonRecord(workspace.currentThumbnailAsset?.metadata)?.catalogRepresentative === true,
      );
      const providerAssets = (assetsByWorkspace.get(workspaceId) ?? []).filter((asset) =>
        isChannelProviderAsset(asset, listing.channel),
      );
      const optionIdentityRemaps = optionIdentityRemapsByListing.get(listing.listingId);
      const desiredKeys = new Set<string>();
      const activeAssets: Array<{ id: string; role: string | null; sortOrder: number }> = [];
      const scopedMedia = uniqueMedia(
        listing.media.map((media) => remapMediaOptionIdentities(media, optionIdentityRemaps)),
      ).filter((media) => roleInPublicationScope(media.role, input.publicationScope));
      // Basic inventory responses may omit the primary-image field because it
      // was not verified.  An empty basic observation therefore performs no
      // primary reconciliation; identity remaps above still cover every
      // provider role in this workspace.
      const primaryScopeObserved = input.publicationScope === 'basic'
        ? scopedMedia.some((media) => media.role === 'primary')
        : input.publicationScope !== 'detail' && input.publicationScope !== 'option';
      const scopedProviderAssets = primaryScopeObserved || input.publicationScope !== 'basic'
        ? providerAssets.filter((asset) =>
            roleInPublicationScope(assetRole(asset), input.publicationScope),
          )
        : [];
      // A scoped media response may contain media for only some option IDs.
      // Keep associations that are not present in this observation active.
      const associationScoped = input.publicationScope === 'option'
        || (
          input.publicationScope === 'detail'
          && scopedMedia.some((media) => normalizedOptionIds(media).length > 0)
        );
      const observedOptionIds = associationScoped
        ? new Set(scopedMedia.flatMap(normalizedOptionIds))
        : null;
      for (const media of scopedMedia) {
        const assetKeys = providerAssetKeys(workspace.id, listing.channel, media);
        const assetKey = assetKeys[0]!;
        const existing = scopedProviderAssets.find((asset) => assetKeys.includes(asset.assetKey))
          // A v1 key included the single option identity. Reuse the same
          // role/URL row when a v2 shared association changes that key so a
          // key transition cannot discard a provider asset's identity.
          ?? scopedProviderAssets
            .filter((asset) => asset.url === media.sourceUrl && assetRole(asset) === media.role)
            .sort((left, right) => left.id.localeCompare(right.id))[0];
        desiredKeys.add(existing?.assetKey ?? assetKey);
        const optionIds = publicationOptionIds(
          existing,
          normalizedOptionIds(media),
          input.publicationScope,
          observedOptionIds,
        );
        const preservesManualSelection = Boolean(
          existing
          && existing.id === currentSelectedAssetId
          && !currentSelectionIsCatalogOwned
        );
        const publicationMetadata = {
          sourceType: 'channel_catalog',
          channel: listing.channel,
          sourceUrl: media.sourceUrl,
          // Keep the scalar field for v1 readers, while arrays are the
          // canonical representation for shared option media.
          externalOptionId: optionIds.length === 1 ? optionIds[0] : null,
          externalOptionIds: optionIds,
          ...publicationHistory,
          active: true,
        };
        const id = existing?.id ?? randomUUID();
        if (existing) {
          const plan = planCatalogAssetRepublication(
            {
              url: existing.url,
              role: existing.role,
              sortOrder: existing.sortOrder,
              isDeleted: existing.isDeleted,
              metadata: jsonRecord(existing.metadata) ?? {},
              storage: {
                storageKey: existing.storageKey,
                mimeType: existing.mimeType,
                width: existing.width,
                height: existing.height,
                fileSize: existing.fileSize,
              },
            },
            {
              sourceUrl: media.sourceUrl,
              role: media.role,
              sortOrder: media.sortOrder,
              publicationMetadata,
            },
            { preservesManualSelection },
          );
          if (plan.kind === 'update') {
            updatedAssets.push({
              id,
              workspaceId,
              url: plan.url,
              role: plan.role,
              sortOrder: plan.sortOrder,
              ...plan.storage,
              metadata: plan.metadata,
            });
          }
        } else {
          newAssets.push({
            id,
            organizationId: input.organizationId,
            contentWorkspaceId: workspaceId,
            source: 'catalog',
            createdByUserId: input.userId,
            assetKey,
            url: media.sourceUrl,
            assetType: 'image',
            role: media.role,
            sortOrder: media.sortOrder,
            metadata: publicationMetadata as Prisma.InputJsonValue,
          });
        }
        activeAssets.push({ id, role: media.role, sortOrder: media.sortOrder });
        imageCount += 1;
      }
      for (const asset of scopedProviderAssets) {
        if (desiredKeys.has(asset.assetKey) || asset.isDeleted) continue;
        if (observedOptionIds) {
          const optionIds = assetOptionIds(asset);
          const unobservedOptionIds = optionIds.filter((id) => !observedOptionIds.has(id));
          if (optionIds.length === 0 || unobservedOptionIds.length > 0) {
            const metadata = {
              ...(jsonRecord(asset.metadata) ?? {}),
              ...(optionIds.length > 0
                ? {
                    externalOptionId: unobservedOptionIds.length === 1
                      ? unobservedOptionIds[0]
                      : null,
                    externalOptionIds: unobservedOptionIds,
                  }
                : {}),
            };
            preservedOptionAssets.push({ id: asset.id, workspaceId, metadata });
            continue;
          }
        }
        const metadata = {
          ...(jsonRecord(asset.metadata) ?? {}),
          active: false,
          ...publicationHistory,
        };
        if (asset.id === currentSelectedAssetId && !currentSelectionIsCatalogOwned) {
          preservedAbsentAssets.push({ id: asset.id, workspaceId, metadata });
        } else {
          absentAssets.push({ id: asset.id, workspaceId, metadata });
        }
        inactivatedImageCount += 1;
      }
      const primary = activeAssets
        .filter((asset) => asset.role === 'primary')
        .sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (
        primaryScopeObserved &&
        primary &&
        (!currentSelectedAssetId || currentSelectionIsCatalogOwned) &&
        currentSelectedAssetId !== primary.id
      ) {
        pointerUpdates.push({
          assetId: primary.id,
          contentWorkspaceId: workspace.id,
          listingId: listing.listingId,
        });
      } else if (
        primaryScopeObserved
        && !primary
        && currentSelectionIsCatalogOwned
      ) {
        pointerUpdates.push({
          assetId: null,
          contentWorkspaceId: workspace.id,
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
      SET url = incoming.url,
          storage_key = incoming."storageKey", mime_type = incoming."mimeType",
          width = incoming.width, height = incoming.height, file_size = incoming."fileSize",
          role = incoming.role, sort_order = incoming."sortOrder",
          metadata = incoming.metadata, is_deleted = false, deleted_at = NULL, updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
        AS incoming(
          id uuid, "workspaceId" uuid, url text, role text, "sortOrder" integer,
          "storageKey" text, "mimeType" text,
          width integer, height integer, "fileSize" integer, metadata jsonb
        )
      WHERE asset.organization_id = ${input.organizationId}::uuid
        AND asset.id = incoming.id AND asset.content_workspace_id = incoming."workspaceId"
    `;
      if (updated !== batch.length)
        throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CATALOG_ASSET_FENCE_LOST' } });
    }
    for (let offset = 0; offset < absentAssets.length; offset += BULK_ROWS) {
      const batch = absentAssets.slice(offset, offset + BULK_ROWS);
      const updated = await tx.$executeRaw`
      UPDATE content_assets AS asset
      SET is_deleted = true, deleted_at = NOW(), metadata = incoming.metadata, updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
        AS incoming(id uuid, "workspaceId" uuid, metadata jsonb)
      WHERE asset.organization_id = ${input.organizationId}::uuid
        AND asset.id = incoming.id AND asset.content_workspace_id = incoming."workspaceId"
    `;
      if (updated !== batch.length)
        throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CATALOG_ASSET_FENCE_LOST' } });
    }
    for (let offset = 0; offset < preservedAbsentAssets.length; offset += BULK_ROWS) {
      const batch = preservedAbsentAssets.slice(offset, offset + BULK_ROWS);
      const updated = await tx.$executeRaw`
      UPDATE content_assets AS asset
      SET metadata = incoming.metadata, updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
        AS incoming(id uuid, "workspaceId" uuid, metadata jsonb)
      WHERE asset.organization_id = ${input.organizationId}::uuid
        AND asset.id = incoming.id AND asset.content_workspace_id = incoming."workspaceId"
    `;
      if (updated !== batch.length)
        throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CATALOG_ASSET_FENCE_LOST' } });
    }
    for (let offset = 0; offset < preservedOptionAssets.length; offset += BULK_ROWS) {
      const batch = preservedOptionAssets.slice(offset, offset + BULK_ROWS);
      const updated = await tx.$executeRaw`
      UPDATE content_assets AS asset
      SET metadata = incoming.metadata, updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
        AS incoming(id uuid, "workspaceId" uuid, metadata jsonb)
      WHERE asset.organization_id = ${input.organizationId}::uuid
        AND asset.id = incoming.id AND asset.content_workspace_id = incoming."workspaceId"
    `;
      if (updated !== batch.length)
        throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CATALOG_ASSET_FENCE_LOST' } });
    }
    for (let offset = 0; offset < pointerUpdates.length; offset += BULK_ROWS) {
      const batch = pointerUpdates.slice(offset, offset + BULK_ROWS);
      const updated = await tx.$executeRaw`
        UPDATE content_workspaces AS workspace
        SET current_thumbnail_asset_id = incoming."assetId", updated_at = NOW()
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          AS incoming("assetId" uuid, "contentWorkspaceId" uuid, "listingId" uuid)
        WHERE workspace.organization_id = ${input.organizationId}::uuid
          AND workspace.id = incoming."contentWorkspaceId" AND workspace.channel_listing_id = incoming."listingId"
          AND workspace.owner_type = 'channel_listing' AND workspace.status = 'active' AND workspace.is_deleted = false
      `;
      if (updated !== batch.length) throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CATALOG_WORKSPACE_FENCE_LOST' } });
    }
    // 카탈로그가 세운 대표이미지 자산에 표시를 남긴다 — 다음 publication 이 이 포인터를 자기 몫으로 안다.
    const representativeAssetIds = pointerUpdates.flatMap((update) => (update.assetId ? [update.assetId] : []));
    if (representativeAssetIds.length > 0) {
      // An unchanged asset was never updated (or locked) above; an operator
      // delete committed after our read must not leave the pointer on it.
      const marked = await tx.$executeRaw`
        UPDATE content_assets
        SET metadata = metadata || '{"catalogRepresentative": true}'::jsonb, updated_at = NOW()
        WHERE organization_id = ${input.organizationId}::uuid
          AND id = ANY(${representativeAssetIds}::uuid[])
          AND is_deleted = false
      `;
      if (marked !== representativeAssetIds.length)
        throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CATALOG_ASSET_FENCE_LOST' } });
    }
    return { imageCount, inactivatedImageCount };
  }
}

function transactionClient(value: unknown): Prisma.TransactionClient {
  if (!value || typeof value !== 'object' || !('contentWorkspace' in value)) {
    throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CATALOG_PUBLICATION_TRANSACTION_REQUIRED' } });
  }
  return value as Prisma.TransactionClient;
}

function uniqueMedia(media: readonly ChannelCatalogMedia[]): ChannelCatalogMedia[] {
  const unique = new Map<string, ChannelCatalogMedia>();
  for (const item of media) {
    const optionIds = normalizedOptionIds(item);
    const key = `${item.role}\u0000${item.sourceUrl}`;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, normalizedMedia(item, optionIds));
      continue;
    }
    const mergedOptionIds = [...new Set([
      ...normalizedOptionIds(existing),
      ...optionIds,
    ])].sort((left, right) => left.localeCompare(right));
    unique.set(key, normalizedMedia(
      existing.sortOrder <= item.sortOrder ? existing : item,
      mergedOptionIds,
    ));
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder
      || left.sourceUrl.localeCompare(right.sourceUrl)
      || left.role.localeCompare(right.role),
  );
}

function normalizedMedia(
  media: ChannelCatalogMedia,
  optionIds: readonly string[],
): ChannelCatalogMedia {
  const normalizedOptionIdsValue = [...new Set(optionIds)].sort((left, right) =>
    left.localeCompare(right));
  return {
    ...media,
    externalOptionId: normalizedOptionIdsValue.length === 1
      ? normalizedOptionIdsValue[0]!
      : null,
    externalOptionIds: normalizedOptionIdsValue,
  };
}

function remapMediaOptionIdentities(
  media: ChannelCatalogMedia,
  remaps: ReadonlyMap<string, string> | undefined,
): ChannelCatalogMedia {
  if (!remaps || remaps.size === 0) return media;
  const optionIds = normalizedOptionIds(media);
  const remappedOptionIds = normalizedOptionIdValues(optionIds.map((id) => remaps.get(id) ?? id));
  if (remappedOptionIds.length === optionIds.length
    && remappedOptionIds.every((id, index) => id === optionIds[index])) {
    return media;
  }
  return normalizedMedia(media, remappedOptionIds);
}

function normalizedOptionIds(media: ChannelCatalogMedia): string[] {
  return normalizedOptionIdValues([
    ...(Array.isArray(media.externalOptionIds) ? media.externalOptionIds : []),
    media.externalOptionId,
  ]);
}

function normalizedOptionIdValues(values: readonly unknown[]): string[] {
  return [...new Set(values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function assetOptionIds(asset: ContentAsset): string[] {
  return metadataOptionIds(asset.metadata);
}

function metadataOptionIds(value: unknown): string[] {
  const metadata = jsonRecord(value);
  return normalizedOptionIdValues([
    ...(Array.isArray(metadata?.externalOptionIds) ? metadata.externalOptionIds : []),
    metadata?.externalOptionId,
  ]);
}

function normalizeOptionIdentityRemaps(
  remaps: readonly CatalogMediaOptionIdentityRemap[] | undefined,
): ReadonlyMap<string, string> {
  const normalized = new Map<string, string>();
  for (const remap of remaps ?? []) {
    const oldId = remap.oldExternalOptionId.trim();
    const newId = remap.newExternalOptionId.trim();
    if (!oldId || !newId || oldId === newId) continue;
    const previous = normalized.get(oldId);
    if (previous && previous !== newId) {
      throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CATALOG_OPTION_REMAP_AMBIGUOUS', externalOptionId: oldId } });
    }
    normalized.set(oldId, newId);
  }
  return normalized;
}

function remapProviderOptionMetadata(
  value: unknown,
  channel: string,
  remaps: ReadonlyMap<string, string> | undefined,
): Record<string, unknown> | null {
  if (!remaps || remaps.size === 0 || !isProviderMetadata(value, channel)) return null;
  const metadata = jsonRecord(value);
  if (!metadata) return null;
  const optionIds = metadataOptionIds(metadata);
  const remappedOptionIds = normalizedOptionIdValues(optionIds.map((id) => remaps.get(id) ?? id));
  if (remappedOptionIds.length === optionIds.length
    && remappedOptionIds.every((id, index) => id === optionIds[index])) {
    return null;
  }
  return {
    ...metadata,
    externalOptionId: remappedOptionIds.length === 1 ? remappedOptionIds[0] : null,
    externalOptionIds: remappedOptionIds,
  };
}

function publicationOptionIds(
  existing: ContentAsset | undefined,
  incomingOptionIds: readonly string[],
  scope: CatalogMediaPublicationScope | undefined,
  observedOptionIds: ReadonlySet<string> | null,
): string[] {
  if ((scope !== 'option' && scope !== 'detail') || !existing || !observedOptionIds) {
    return [...incomingOptionIds];
  }
  return normalizedOptionIdValues([
    ...incomingOptionIds,
    ...assetOptionIds(existing).filter((id) => !observedOptionIds.has(id)),
  ]);
}

function providerAssetKeys(
  workspaceId: string,
  channel: string,
  media: ChannelCatalogMedia,
): string[] {
  const optionIds = normalizedOptionIds(media);
  // New assets are keyed by role + URL because one provider asset can be
  // associated with every option that shares the same image. The remaining
  // identities are read-compatible aliases for the old scalar-key format.
  const identities = [
    `${media.role}\u0000${media.sourceUrl}`,
    `${media.role}\u0000${optionIds.join('\u0000')}\u0000${media.sourceUrl}`,
  ];
  const hashes = [...new Set(identities.map((identity) =>
    createHash('sha256').update(identity).digest('hex')))];
  return hashes.flatMap((hash) => [
    `channel-provider:${channel}:${workspaceId}:${hash}`,
    ...(channel === 'coupang' ? [`coupang-provider:${workspaceId}:${hash}`] : []),
  ]);
}

function roleInPublicationScope(
  role: string | null,
  scope: CatalogMediaPublicationScope | undefined,
): boolean {
  if (scope === 'basic') return role === 'primary';
  if (scope === 'option') return role === 'option';
  if (scope === 'detail') return role === 'detail';
  // Omitted scope is the legacy full replacement. Include an older provider
  // asset even when its pre-v1 row has no role column value.
  return true;
}

function assetRole(asset: ContentAsset): string | null {
  const role = typeof asset.role === 'string' ? asset.role.trim() : '';
  if (role) return role;
  const metadata = jsonRecord(asset.metadata);
  return typeof metadata?.role === 'string' ? metadata.role.trim() || null : null;
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
