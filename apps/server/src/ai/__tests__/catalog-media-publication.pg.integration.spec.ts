import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  OTHER_USER_ID as OTHER_USER,
} from '../../test-helpers/real-prisma';
import { ChannelListingQueryService } from '../../channels/application/service/listing/channel-listing-query.service';
import { ChannelListingQueryPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-listing-query.persistence.adapter';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { ContentAssetLibraryRepositoryAdapter } from '../adapter/out/repository/content-asset-library.repository.adapter';
import { ContentWorkspaceThumbnailSelectionRepositoryAdapter } from '../adapter/out/repository/content-workspace-thumbnail-selection.repository.adapter';
import type {
  CatalogMediaPublicationScope,
  ChannelCatalogMedia,
} from '../../channels/application/port/out/cross-domain/catalog-media-publication.port';
import type { PrismaClient } from '@prisma/client';

describe('catalog media publication (real PG and public asset/catalog reads)', () => {
  let prisma: PrismaClient;
  let publisher: AiCatalogMediaPublicationRepositoryAdapter;
  let library: ContentAssetLibraryRepositoryAdapter;
  let selection: ContentWorkspaceThumbnailSelectionRepositoryAdapter;
  let catalog: ChannelListingQueryService;
  let listingId: string;
  let secondListingId: string;
  let foreignListingId: string;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    publisher = new AiCatalogMediaPublicationRepositoryAdapter();
    library = new ContentAssetLibraryRepositoryAdapter(prisma as never);
    selection = new ContentWorkspaceThumbnailSelectionRepositoryAdapter(prisma as never);
    catalog = new ChannelListingQueryService(new ChannelListingQueryPersistenceAdapter(prisma as never));
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    async function seedListing(organizationId: string, externalId: string) {
      const account = await prisma.channelAccount.create({
        data: { organizationId, channel: 'coupang', name: externalId },
      });
      return (
        await prisma.channelListing.create({
          data: {
            organizationId,
            channelAccountId: account.id,
            externalId,
            displayName: externalId,
          },
        })
      ).id;
    }
    listingId = await seedListing(ORG, 'P1');
    secondListingId = await seedListing(ORG, 'P2');
    foreignListingId = await seedListing(OTHER_ORG, 'FOREIGN');
  });
  const assets = (organizationId = ORG) =>
    library
      .listAssets({
        organizationId,
        page: 1,
        limit: 100,
        contentWorkspaceId: null,
        generationId: null,
      })
      .then((result) => result.rows);
  const publish = (
    id: string,
    media: ChannelCatalogMedia[],
    organizationId = ORG,
    userId = USER,
    importId = randomUUID(),
    publicationScope?: CatalogMediaPublicationScope,
    optionIdentityRemaps?: Array<{
      oldExternalOptionId: string;
      newExternalOptionId: string;
    }>,
  ) =>
    prisma.$transaction(
      (tx) =>
        publisher.publishProviderMedia({
          transaction: tx,
          organizationId,
          userId,
          publicationReference: { type: 'source_import_run', id: importId },
          publicationScope,
          listings: [{
            listingId: id,
            channel: 'coupang',
            displayName: '  Ｔｏｙ 이름  ',
            optionIdentityRemaps,
            media,
          }],
        }),
      { timeout: 10_000 },
    );
  const currentThumbnail = () =>
    catalog.getWorkspace(ORG, listingId).then((row) => row.thumbnailUrl);

  it('retains legacy asset/workspace identity and manual/generated media while refreshing only the supplied listing', async () => {
    const firstRef = randomUUID();
    expect(
      await publish(
        listingId,
        [media('a', 'primary', 3), media('a', 'primary', 1), media('old', 'detail')],
        ORG,
        USER,
        firstRef,
      ),
    ).toEqual({ imageCount: 2, inactivatedImageCount: 0 });
    await publish(secondListingId, [media('second', 'primary')]);
    await publish(foreignListingId, [media('foreign', 'primary')], OTHER_ORG, OTHER_USER);
    const foreignBefore = await assets(OTHER_ORG);
    const original = (await assets()).find((row) => row.url === url('a'))!;
    const old = (await assets()).find((row) => row.url === url('old'))!;
    expect(original).toMatchObject({
      role: 'primary',
      sortOrder: 1,
      metadata: { publicationReference: { type: 'source_import_run', id: firstRef } },
    });
    const workspaceId = original.originGenerationGroup!.contentWorkspace.id;
    const groupId = original.originGenerationGroupId!;
    const stored = await prisma.contentAsset.findFirstOrThrow({
      where: { id: original.id, organizationId: ORG },
    });
    const legacyKey = stored.assetKey.replace('channel-provider:coupang:', 'coupang-provider:');
    await prisma.contentAsset.update({
      where: { id_organizationId: { id: original.id, organizationId: ORG } },
      data: {
        assetKey: legacyKey,
        storageKey: 'old/materialized.jpg',
        mimeType: 'image/jpeg',
        width: 10,
        height: 20,
        fileSize: 30,
        metadata: {
          sourceType: 'coupang_catalog',
          customDiagnostic: 'keep',
          materializationStatus: 'ready',
          materializedAtMs: 100,
          materializationLeaseToken: 'old',
          materializationLeaseExpiresAtMs: 200,
          materializationAttemptCount: 2,
          materializationError: 'old',
          nextMaterializationAttemptAtMs: 300,
        },
      },
    });
    const manual = await prisma.contentAsset.create({
      data: {
        organizationId: ORG,
        originGenerationGroupId: groupId,
        assetKey: randomUUID(),
        url: url('manual'),
        role: 'thumbnail',
        metadata: { sourceType: 'generated', operatorNote: 'keep' },
      },
    });
    await prisma.contentAsset.create({
      data: {
        organizationId: ORG,
        originGenerationGroupId: groupId,
        assetKey: randomUUID(),
        url: url('other-channel'),
        metadata: { sourceType: 'channel_catalog', channel: 'smartstore' },
      },
    });
    await selection.selectCurrent({
      organizationId: ORG,
      workspaceId,
      userId: USER,
      selection: { kind: 'content_asset', contentAssetId: manual.id },
    });
    const nextRef = randomUUID();
    expect(
      await publish(
        listingId,
        [media('a', 'primary', 4), media('new', 'detail')],
        ORG,
        USER,
        nextRef,
      ),
    ).toEqual({ imageCount: 2, inactivatedImageCount: 1 });
    const refreshed = await assets();
    const reused = refreshed.find((row) => row.url === url('a'))!;
    expect(reused).toMatchObject({
      id: original.id,
      originGenerationGroupId: groupId,
      sortOrder: 4,
      metadata: {
        sourceType: 'channel_catalog',
        channel: 'coupang',
        customDiagnostic: 'keep',
        sourceUrl: url('a'),
        externalOptionId: null,
        publicationReference: { type: 'source_import_run', id: nextRef },
        lastImportRunId: nextRef,
        active: true,
      },
    });
    expect(reused.metadata).not.toHaveProperty('materializationStatus');
    expect(
      Object.keys(reused.metadata as object).filter(
        (key) => key.startsWith('materializ') || key === 'nextMaterializationAttemptAtMs',
      ),
    ).toEqual([]);
    expect(refreshed.map((row) => row.url).sort()).toEqual(
      ['a', 'manual', 'new', 'other-channel', 'second'].map(url).sort(),
    );
    expect(await currentThumbnail()).toBe(url('manual'));
    expect(await assets(OTHER_ORG)).toEqual(foreignBefore);
    // URL-backed storage fields are not exposed by the public gallery projection.
    expect(
      await prisma.contentAsset.findFirstOrThrow({
        where: { id: original.id, organizationId: ORG },
      }),
    ).toMatchObject({
      assetKey: legacyKey,
      storageKey: null,
      mimeType: null,
      width: null,
      height: null,
      fileSize: null,
    });
    expect(await publish(listingId, [media('a', 'primary'), media('old', 'detail')])).toEqual({
      imageCount: 2,
      inactivatedImageCount: 1,
    });
    expect((await assets()).find((row) => row.url === url('old'))?.id).toBe(old.id);
    expect(await publish(listingId, [])).toEqual({ imageCount: 0, inactivatedImageCount: 2 });
    expect((await assets()).map((row) => row.url).sort()).toEqual(
      ['manual', 'other-channel', 'second'].map(url).sort(),
    );
    expect(await currentThumbnail()).toBe(url('manual'));
  });

  it('advances and clears only a catalog-owned thumbnail pointer', async () => {
    await publish(listingId, [media('auto-a', 'primary')]);
    const initialWorkspace = await prisma.contentWorkspace.findFirstOrThrow({
      where: { organizationId: ORG, channelListingId: listingId },
    });
    const group = await prisma.contentGenerationGroup.findFirstOrThrow({
      where: {
        organizationId: ORG,
        contentWorkspaceId: initialWorkspace.id,
        groupType: 'workspace_assets',
      },
    });
    const firstPointer = initialWorkspace.currentThumbnailSelectionId;
    expect(firstPointer).not.toBeNull();
    expect(group.metadata).toMatchObject({
      catalogPublication: { autoThumbnailSelectionId: firstPointer },
    });

    await publish(listingId, [media('auto-b', 'primary')]);
    const advancedWorkspace = await prisma.contentWorkspace.findUniqueOrThrow({
      where: { id: initialWorkspace.id },
    });
    const advancedGroup = await prisma.contentGenerationGroup.findUniqueOrThrow({
      where: { id: group.id },
    });
    expect(advancedWorkspace.currentThumbnailSelectionId).not.toBe(firstPointer);
    expect(advancedWorkspace.currentThumbnailSelectionId).not.toBeNull();
    expect(advancedGroup.metadata).toMatchObject({
      catalogPublication: {
        autoThumbnailSelectionId: advancedWorkspace.currentThumbnailSelectionId,
      },
    });

    await publish(listingId, []);
    const clearedWorkspace = await prisma.contentWorkspace.findUniqueOrThrow({
      where: { id: initialWorkspace.id },
    });
    expect(clearedWorkspace.currentThumbnailSelectionId).toBeNull();
    expect((await assets()).some((asset) => asset.url === url('auto-a'))).toBe(false);
    expect((await assets()).some((asset) => asset.url === url('auto-b'))).toBe(false);
  });

  it('preserves a manually selected provider asset when the source changes or omits it', async () => {
    await publish(listingId, [media('manual-provider-a', 'primary')]);
    const workspace = await prisma.contentWorkspace.findFirstOrThrow({
      where: { organizationId: ORG, channelListingId: listingId },
    });
    const providerAsset = await prisma.contentAsset.findFirstOrThrow({
      where: {
        organizationId: ORG,
        originGenerationGroup: { contentWorkspaceId: workspace.id },
        url: url('manual-provider-a'),
      },
    });
    await prisma.contentAsset.update({
      where: { id_organizationId: { id: providerAsset.id, organizationId: ORG } },
      data: { storageKey: 'kept/manual-provider-a.jpg' },
    });
    const manualSelection = await selection.selectCurrent({
      organizationId: ORG,
      workspaceId: workspace.id,
      userId: USER,
      selection: { kind: 'content_asset', contentAssetId: providerAsset.id },
    });

    await publish(listingId, [media('manual-provider-b', 'primary')]);
    let preserved = await prisma.contentAsset.findUniqueOrThrow({
      where: { id: providerAsset.id },
    });
    let after = await prisma.contentWorkspace.findUniqueOrThrow({
      where: { id: workspace.id },
    });
    expect(after.currentThumbnailSelectionId).toBe(manualSelection.selectionId);
    expect(await currentThumbnail()).toBe(url('manual-provider-a'));
    expect(preserved).toMatchObject({
      isDeleted: false,
      url: url('manual-provider-a'),
      storageKey: 'kept/manual-provider-a.jpg',
      metadata: { active: false },
    });

    await publish(listingId, []);
    preserved = await prisma.contentAsset.findUniqueOrThrow({
      where: { id: providerAsset.id },
    });
    after = await prisma.contentWorkspace.findUniqueOrThrow({
      where: { id: workspace.id },
    });
    expect(after.currentThumbnailSelectionId).toBe(manualSelection.selectionId);
    expect(await currentThumbnail()).toBe(url('manual-provider-a'));
    expect(preserved).toMatchObject({
      isDeleted: false,
      url: url('manual-provider-a'),
      storageKey: 'kept/manual-provider-a.jpg',
      metadata: { active: false },
    });
  });

  it('preserves a manually selected provider asset when its materialized URL differs', async () => {
    const providerUrl = url('manual-provider-same');
    const materializedUrl = 'https://storage.example/materialized/manual-provider-same.jpg';
    await publish(listingId, [media('manual-provider-same', 'primary')]);
    const workspace = await prisma.contentWorkspace.findFirstOrThrow({
      where: { organizationId: ORG, channelListingId: listingId },
    });
    const providerAsset = await prisma.contentAsset.findFirstOrThrow({
      where: {
        organizationId: ORG,
        originGenerationGroup: { contentWorkspaceId: workspace.id },
        url: providerUrl,
      },
    });
    const manualSelection = await selection.selectCurrent({
      organizationId: ORG,
      workspaceId: workspace.id,
      userId: USER,
      selection: { kind: 'content_asset', contentAssetId: providerAsset.id },
    });
    await prisma.contentAsset.update({
      where: { id_organizationId: { id: providerAsset.id, organizationId: ORG } },
      data: {
        url: materializedUrl,
        storageKey: 'materialized/manual-provider-same.jpg',
        mimeType: 'image/jpeg',
        width: 321,
        height: 654,
        fileSize: 12345,
        metadata: {
          sourceType: 'channel_catalog',
          channel: 'coupang',
          sourceUrl: providerUrl,
          materializationStatus: 'ready',
          materializedAtMs: 100,
          materializationLeaseToken: 'manual-same',
          materializationLeaseExpiresAtMs: 200,
          materializationAttemptCount: 2,
          materializationError: 'old-error',
          nextMaterializationAttemptAtMs: 300,
          operatorNote: 'keep',
        },
      },
    });

    const importId = randomUUID();
    await publish(listingId, [media('manual-provider-same', 'primary')], ORG, USER, importId);

    const preserved = await prisma.contentAsset.findUniqueOrThrow({
      where: { id: providerAsset.id },
    });
    const after = await prisma.contentWorkspace.findUniqueOrThrow({
      where: { id: workspace.id },
    });
    expect(after.currentThumbnailSelectionId).toBe(manualSelection.selectionId);
    expect(await currentThumbnail()).toBe(materializedUrl);
    expect(preserved).toMatchObject({
      isDeleted: false,
      url: materializedUrl,
      storageKey: 'materialized/manual-provider-same.jpg',
      mimeType: 'image/jpeg',
      width: 321,
      height: 654,
      fileSize: 12345,
      metadata: {
        sourceType: 'channel_catalog',
        channel: 'coupang',
        sourceUrl: providerUrl,
        materializationStatus: 'ready',
        materializedAtMs: 100,
        materializationLeaseToken: 'manual-same',
        materializationLeaseExpiresAtMs: 200,
        materializationAttemptCount: 2,
        materializationError: 'old-error',
        nextMaterializationAttemptAtMs: 300,
        operatorNote: 'keep',
        publicationReference: { type: 'source_import_run', id: importId },
        publicationScope: 'full',
        sourceImportRunId: importId,
        lastImportRunId: importId,
        active: true,
      },
    });
  });

  it('preserves a markerless legacy pointer and unrelated group metadata', async () => {
    await publish(listingId, [media('legacy-a', 'primary')]);
    const workspace = await prisma.contentWorkspace.findFirstOrThrow({
      where: { organizationId: ORG, channelListingId: listingId },
    });
    const group = await prisma.contentGenerationGroup.findFirstOrThrow({
      where: {
        organizationId: ORG,
        contentWorkspaceId: workspace.id,
        groupType: 'workspace_assets',
      },
    });
    const legacyPointer = workspace.currentThumbnailSelectionId;
    await prisma.contentGenerationGroup.update({
      where: { id: group.id },
      data: {
        metadata: {
          sourceType: 'channel_catalog',
          channel: 'coupang',
          legacyMarker: 'keep-me',
        },
      },
    });

    await publish(listingId, [media('legacy-b', 'primary')]);
    const after = await prisma.contentWorkspace.findUniqueOrThrow({
      where: { id: workspace.id },
    });
    const oldAsset = await prisma.contentAsset.findFirstOrThrow({
      where: {
        organizationId: ORG,
        originGenerationGroupId: group.id,
        url: url('legacy-a'),
      },
    });
    const afterGroup = await prisma.contentGenerationGroup.findUniqueOrThrow({
      where: { id: group.id },
    });
    expect(after.currentThumbnailSelectionId).toBe(legacyPointer);
    expect(oldAsset).toMatchObject({ isDeleted: false, metadata: { active: false } });
    expect(afterGroup.metadata).toMatchObject({
      sourceType: 'channel_catalog',
      channel: 'coupang',
      legacyMarker: 'keep-me',
    });
    expect(afterGroup.metadata).not.toHaveProperty('catalogPublication');
  });

  it('replaces basic, detail, and option media scopes independently', async () => {
    const initialRef = randomUUID();
    await publish(
      listingId,
      [
        media('old-primary', 'primary'),
        media('old-detail', 'detail'),
        optionMedia('old-option', ['OPTION-A']),
        optionMedia('old-unobserved-option', ['OPTION-C']),
      ],
      ORG,
      USER,
      initialRef,
    );
    const initial = await assets();
    const oldOptionId = initial.find((asset) => asset.url === url('old-option'))!.id;
    const inactiveUnobservedOption = initial.find(
      (asset) => asset.url === url('old-unobserved-option'),
    )!;
    await prisma.contentAsset.update({
      where: { id_organizationId: { id: inactiveUnobservedOption.id, organizationId: ORG } },
      data: {
        metadata: {
          sourceType: 'channel_catalog',
          channel: 'coupang',
          sourceUrl: url('old-unobserved-option'),
          externalOptionId: 'OPTION-C',
          externalOptionIds: ['OPTION-C'],
          publicationReference: { type: 'source_import_run', id: initialRef },
          publicationScope: 'full',
          sourceImportRunId: initialRef,
          lastImportRunId: initialRef,
          active: false,
        },
      },
    });
    const workspaceId = initial[0]!.originGenerationGroup!.contentWorkspace.id;
    const manual = await prisma.contentAsset.create({
      data: {
        organizationId: ORG,
        originGenerationGroupId: initial[0]!.originGenerationGroupId,
        assetKey: randomUUID(),
        url: url('operator'),
        role: 'thumbnail',
        metadata: { sourceType: 'generated', operatorNote: 'keep' },
      },
    });
    await selection.selectCurrent({
      organizationId: ORG,
      workspaceId,
      userId: USER,
      selection: { kind: 'content_asset', contentAssetId: manual.id },
    });

    const basicRef = randomUUID();
    expect(
      await publish(
        listingId,
        [media('new-primary', 'primary'), media('ignored-detail', 'detail')],
        ORG,
        USER,
        basicRef,
        'basic',
      ),
    ).toEqual({ imageCount: 1, inactivatedImageCount: 1 });
    const afterBasic = await assets();
    expect(afterBasic.map((asset) => asset.url).sort()).toEqual(
      [
        url('new-primary'),
        url('old-detail'),
        url('old-option'),
        url('old-unobserved-option'),
        url('operator'),
      ].sort(),
    );
    expect(afterBasic.find((asset) => asset.url === url('old-detail'))?.metadata).toMatchObject({
      publicationReference: { type: 'source_import_run', id: initialRef },
      publicationScope: 'full',
    });
    expect(
      await prisma.contentAsset.findFirstOrThrow({
        where: { organizationId: ORG, url: url('old-primary') },
      }),
    ).toMatchObject({
      isDeleted: true,
      metadata: { publicationReference: { type: 'source_import_run', id: basicRef }, publicationScope: 'basic' },
    });
    expect(await currentThumbnail()).toBe(url('operator'));

    const detailRef = randomUUID();
    expect(
      await publish(
        listingId,
        [media('new-detail', 'detail')],
        ORG,
        USER,
        detailRef,
        'detail',
      ),
    ).toEqual({ imageCount: 1, inactivatedImageCount: 1 });
    const optionRef = randomUUID();
    expect(
      await publish(
        listingId,
        [
          optionMedia('old-option', ['OPTION-B', 'OPTION-A']),
          optionMedia('old-option', ['OPTION-B']),
        ],
        ORG,
        USER,
        optionRef,
        'option',
      ),
    ).toEqual({ imageCount: 1, inactivatedImageCount: 0 });
    const afterDetail = await assets();
    expect(afterDetail.map((asset) => asset.url).sort()).toEqual(
      [
        url('new-primary'),
        url('new-detail'),
        url('old-option'),
        url('old-unobserved-option'),
        url('operator'),
      ].sort(),
    );
    const shared = afterDetail.find((asset) => asset.url === url('old-option'))!;
    expect(shared.metadata).toMatchObject({
      externalOptionId: null,
      externalOptionIds: ['OPTION-A', 'OPTION-B'],
      publicationReference: { type: 'source_import_run', id: optionRef },
      publicationScope: 'option',
      sourceImportRunId: optionRef,
    });
    expect(shared.id).toBe(oldOptionId);
    const unobservedOption = afterDetail.find((asset) => asset.url === url('old-unobserved-option'))!;
    expect(unobservedOption).toMatchObject({
      metadata: {
        externalOptionIds: ['OPTION-C'],
        publicationReference: { type: 'source_import_run', id: initialRef },
        active: false,
      },
    });
    expect(
      await prisma.contentAsset.findUniqueOrThrow({
        where: {
          id_organizationId: { id: unobservedOption.id, organizationId: ORG },
        },
      }),
    ).toMatchObject({ isDeleted: false });
    expect(afterDetail.find((asset) => asset.url === url('new-primary'))?.metadata).toMatchObject({
      publicationReference: { type: 'source_import_run', id: basicRef },
      publicationScope: 'basic',
    });
    expect(await currentThumbnail()).toBe(url('operator'));
  });

  it('preserves unobserved option associations during option-scope replacement', async () => {
    const initialRef = randomUUID();
    await publish(
      listingId,
      [optionMedia('shared-option', ['OPTION-A', 'OPTION-B'])],
      ORG,
      USER,
      initialRef,
    );

    const optionRef = randomUUID();
    expect(
      await publish(
        listingId,
        [optionMedia('replacement-option', ['OPTION-A'])],
        ORG,
        USER,
        optionRef,
        'option',
      ),
    ).toEqual({ imageCount: 1, inactivatedImageCount: 0 });

    const rows = await assets();
    expect(rows.map((asset) => asset.url).sort()).toEqual(
      [url('replacement-option'), url('shared-option')].sort(),
    );
    const sharedOption = rows.find((asset) => asset.url === url('shared-option'))!;
    expect(sharedOption).toMatchObject({
      metadata: {
        externalOptionId: 'OPTION-B',
        externalOptionIds: ['OPTION-B'],
        publicationReference: { type: 'source_import_run', id: initialRef },
        active: true,
      },
    });
    expect(
      await prisma.contentAsset.findUniqueOrThrow({
        where: { id_organizationId: { id: sharedOption.id, organizationId: ORG } },
      }),
    ).toMatchObject({ isDeleted: false });
    expect(rows.find((asset) => asset.url === url('replacement-option'))).toMatchObject({
      metadata: {
        externalOptionId: 'OPTION-A',
        externalOptionIds: ['OPTION-A'],
        publicationReference: { type: 'source_import_run', id: optionRef },
        active: true,
      },
    });
  });

  it('preserves unobserved detail option associations during detail-scope replacement', async () => {
    const initialRef = randomUUID();
    await publish(
      listingId,
      [detailMedia('shared-detail', ['OPTION-A', 'OPTION-B'])],
      ORG,
      USER,
      initialRef,
    );

    const detailRef = randomUUID();
    expect(
      await publish(
        listingId,
        [detailMedia('replacement-detail', ['OPTION-A'])],
        ORG,
        USER,
        detailRef,
        'detail',
      ),
    ).toEqual({ imageCount: 1, inactivatedImageCount: 0 });

    const rows = await assets();
    expect(rows.map((asset) => asset.url).sort()).toEqual(
      [url('replacement-detail'), url('shared-detail')].sort(),
    );
    const sharedDetail = rows.find((asset) => asset.url === url('shared-detail'))!;
    expect(sharedDetail).toMatchObject({
      metadata: {
        externalOptionId: 'OPTION-B',
        externalOptionIds: ['OPTION-B'],
        publicationReference: { type: 'source_import_run', id: initialRef },
        active: true,
      },
    });
    expect(
      await prisma.contentAsset.findUniqueOrThrow({
        where: { id_organizationId: { id: sharedDetail.id, organizationId: ORG } },
      }),
    ).toMatchObject({ isDeleted: false });
    expect(rows.find((asset) => asset.url === url('replacement-detail'))).toMatchObject({
      metadata: {
        externalOptionId: 'OPTION-A',
        externalOptionIds: ['OPTION-A'],
        publicationReference: { type: 'source_import_run', id: detailRef },
        active: true,
      },
    });
  });

  it('remaps provider option metadata across scopes, including a source-inactive selected asset', async () => {
    const oldExternalOptionId = 'fallback-option';
    const newExternalOptionId = 'vendor-option';
    await publish(listingId, [
      mediaWithOption('remap-primary', 'primary', oldExternalOptionId),
      detailMedia('remap-detail', [oldExternalOptionId]),
      optionMedia('remap-option', [oldExternalOptionId]),
    ]);
    const workspace = await prisma.contentWorkspace.findFirstOrThrow({
      where: { organizationId: ORG, channelListingId: listingId },
    });
    const detail = await prisma.contentAsset.findFirstOrThrow({
      where: {
        organizationId: ORG,
        originGenerationGroup: { contentWorkspaceId: workspace.id },
        url: url('remap-detail'),
      },
    });
    await prisma.contentAsset.update({
      where: { id_organizationId: { id: detail.id, organizationId: ORG } },
      data: {
        storageKey: 'kept/remap-detail.jpg',
        metadata: {
          ...(detail.metadata as Record<string, unknown>),
          active: false,
        },
      },
    });
    await selection.selectCurrent({
      organizationId: ORG,
      workspaceId: workspace.id,
      userId: USER,
      selection: { kind: 'content_asset', contentAssetId: detail.id },
    });
    const manual = await prisma.contentAsset.create({
      data: {
        organizationId: ORG,
        originGenerationGroupId: detail.originGenerationGroupId,
        assetKey: randomUUID(),
        url: url('remap-manual'),
        role: 'thumbnail',
        metadata: { sourceType: 'generated', operatorNote: 'keep' },
      },
    });

    await publish(
      listingId,
      [mediaWithOption('remap-primary', 'primary', oldExternalOptionId)],
      ORG,
      USER,
      randomUUID(),
      'basic',
      [{ oldExternalOptionId, newExternalOptionId }],
    );

    const remapped = await prisma.contentAsset.findMany({
      where: { organizationId: ORG, originGenerationGroupId: detail.originGenerationGroupId },
    });
    for (const name of ['remap-primary', 'remap-detail', 'remap-option']) {
      expect(remapped.find((asset) => asset.url === url(name))?.metadata).toMatchObject({
        externalOptionId: newExternalOptionId,
        externalOptionIds: [newExternalOptionId],
      });
    }
    expect(remapped.find((asset) => asset.url === url('remap-detail'))).toMatchObject({
      isDeleted: false,
      storageKey: 'kept/remap-detail.jpg',
      metadata: { active: false },
    });
    expect(remapped.find((asset) => asset.url === url('remap-manual'))).toMatchObject({
      id: manual.id,
      isDeleted: false,
      metadata: { sourceType: 'generated', operatorNote: 'keep' },
    });
    expect(await currentThumbnail()).toBe(url('remap-detail'));
  });

  it('preserves a basic empty-primary observation while still applying option identity remaps', async () => {
    const oldExternalOptionId = 'empty-fallback-option';
    const newExternalOptionId = 'empty-vendor-option';
    await publish(listingId, [
      mediaWithOption('empty-primary', 'primary', oldExternalOptionId),
      optionMedia('empty-option', [oldExternalOptionId]),
    ]);
    const beforePrimary = await prisma.contentAsset.findFirstOrThrow({
      where: { organizationId: ORG, url: url('empty-primary') },
    });
    const beforeWorkspace = await prisma.contentWorkspace.findFirstOrThrow({
      where: { organizationId: ORG, channelListingId: listingId },
    });
    const beforeSelectionId = beforeWorkspace.currentThumbnailSelectionId;
    expect(beforeSelectionId).not.toBeNull();

    expect(
      await publish(
        listingId,
        [],
        ORG,
        USER,
        randomUUID(),
        'basic',
        [{ oldExternalOptionId, newExternalOptionId }],
      ),
    ).toEqual({ imageCount: 0, inactivatedImageCount: 0 });

    const afterPrimary = await prisma.contentAsset.findUniqueOrThrow({
      where: { id: beforePrimary.id },
    });
    const afterWorkspace = await prisma.contentWorkspace.findUniqueOrThrow({
      where: { id: beforeWorkspace.id },
    });
    const afterOption = await prisma.contentAsset.findFirstOrThrow({
      where: { organizationId: ORG, url: url('empty-option') },
    });
    expect(afterPrimary).toMatchObject({
      isDeleted: false,
      metadata: {
        active: true,
        externalOptionId: newExternalOptionId,
        externalOptionIds: [newExternalOptionId],
      },
    });
    expect(afterWorkspace.currentThumbnailSelectionId).toBe(beforeSelectionId);
    expect(afterOption).toMatchObject({
      isDeleted: false,
      metadata: {
        active: true,
        externalOptionId: newExternalOptionId,
        externalOptionIds: [newExternalOptionId],
      },
    });
  });

  it('does not overwrite a manual thumbnail selection racing provider publication', async () => {
    await publish(listingId, [media('a', 'primary')]);
    const original = (await assets())[0]!;
    const workspaceId = original.originGenerationGroup!.contentWorkspace.id;
    const manual = await prisma.contentAsset.create({
      data: {
        organizationId: ORG,
        originGenerationGroupId: original.originGenerationGroupId,
        assetKey: randomUUID(),
        url: url('manual'),
        role: 'thumbnail',
      },
    });
    let unlock!: () => void;
    let signalLocked!: () => void;
    const acquired = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const blocker = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM content_assets WHERE organization_id = ${ORG}::uuid AND id = ${original.id}::uuid FOR UPDATE`;
        signalLocked();
        await release;
      },
      { timeout: 10_000 },
    );
    await acquired;
    const publication = publish(listingId, [media('b', 'primary')]);
    let manualSelection: Promise<unknown> | undefined;
    try {
      await expect
        .poll(
          async () => {
            const rows = await prisma.$queryRaw<
              Array<{ count: number }>
            >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE '%UPDATE content_assets%'`;
            return rows[0]!.count;
          },
          { timeout: 3000 },
        )
        .toBeGreaterThan(0);
      let manualDone = false;
      manualSelection = selection
        .selectCurrent({
          organizationId: ORG,
          workspaceId,
          userId: USER,
          selection: { kind: 'content_asset', contentAssetId: manual.id },
        })
        .then((result) => {
          manualDone = true;
          return result;
        });
      await expect
        .poll(
          async () => {
            const rows = await prisma.$queryRaw<
              Array<{ count: number }>
            >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE '%content_workspaces%'`;
            return manualDone || rows[0]!.count > 0;
          },
          { timeout: 3000 },
        )
        .toBe(true);
    } finally {
      unlock();
      await blocker;
      await Promise.all([publication, manualSelection]);
    }
    expect(await currentThumbnail()).toBe(url('manual'));
    expect((await assets()).find((row) => row.url === url('b'))).toBeDefined();
  });

  it('rejects a foreign listing without changing either organization gallery', async () => {
    await publish(listingId, [media('own', 'primary')]);
    await publish(foreignListingId, [media('foreign', 'primary')], OTHER_ORG, OTHER_USER);
    const before = await assets();
    const foreignBefore = await assets(OTHER_ORG);
    await expect(publish(foreignListingId, [media('bad', 'primary')])).rejects.toThrow(
      'owned channel listings',
    );
    expect(await assets()).toEqual(before);
    expect(await assets(OTHER_ORG)).toEqual(foreignBefore);
  });
});

function url(name: string) {
  return `https://example.com/${name}.jpg`;
}
function media(
  name: string,
  role: ChannelCatalogMedia['role'],
  sortOrder = 0,
): ChannelCatalogMedia {
  return { sourceUrl: url(name), role, sortOrder, externalOptionId: null };
}

function mediaWithOption(
  name: string,
  role: ChannelCatalogMedia['role'],
  externalOptionId: string,
  sortOrder = 0,
): ChannelCatalogMedia {
  return { sourceUrl: url(name), role, sortOrder, externalOptionId };
}

function optionMedia(
  name: string,
  externalOptionIds: string[],
  sortOrder = 0,
): ChannelCatalogMedia {
  return {
    sourceUrl: url(name),
    role: 'option',
    sortOrder,
    externalOptionId: externalOptionIds.length === 1 ? externalOptionIds[0]! : null,
    externalOptionIds,
  };
}

function detailMedia(
  name: string,
  externalOptionIds: string[],
  sortOrder = 0,
): ChannelCatalogMedia {
  return {
    sourceUrl: url(name),
    role: 'detail',
    sortOrder,
    externalOptionId: externalOptionIds.length === 1 ? externalOptionIds[0]! : null,
    externalOptionIds,
  };
}
