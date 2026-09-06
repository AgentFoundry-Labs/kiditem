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
import { ChannelListingQueryService } from '../../channels/application/service/channel-listing-query.service';
import { ChannelListingRepositoryAdapter } from '../../channels/adapter/out/repository/channel-listing.repository.adapter';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { ContentAssetLibraryRepositoryAdapter } from '../adapter/out/repository/content-asset-library.repository.adapter';
import { ContentWorkspaceThumbnailSelectionRepositoryAdapter } from '../adapter/out/repository/content-workspace-thumbnail-selection.repository.adapter';
import type { ChannelCatalogMedia } from '../../channels/application/port/out/cross-domain/catalog-media-publication.port';
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
    catalog = new ChannelListingQueryService(new ChannelListingRepositoryAdapter(prisma as never));
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
  ) =>
    prisma.$transaction(
      (tx) =>
        publisher.publishProviderMedia({
          transaction: tx,
          organizationId,
          userId,
          publicationReference: { type: 'source_import_run', id: importId },
          listings: [{ listingId: id, channel: 'coupang', displayName: '  Ｔｏｙ 이름  ', media }],
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
