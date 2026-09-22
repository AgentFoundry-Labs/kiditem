import { makeChannelListingQuery, makeChannelRecipes } from '../../test-helpers/channel-catalog-ports';
import { CatalogDisplayMediaRepositoryAdapter } from '../adapter/out/repository/catalog-display-media.repository.adapter';
import { ThumbnailAnalysisRepositoryAdapter } from '../adapter/out/repository/thumbnail-analysis.repository.adapter';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ownerTransaction } from '../../prisma/owner-transaction';
import type { PrismaService } from '../../prisma/prisma.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG, OTHER_ORGANIZATION_ID as OTHER } from '../../test-helpers/real-prisma';
import { ListingContentQueryRepositoryAdapter } from '../adapter/out/repository/listing-content-query.repository.adapter';
import { ChannelListingQueryPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-listing-query.persistence.adapter';
import { ChannelListingQueryService } from '../../channels/application/service/listing/channel-listing-query.service';

describe('AI listing content owner query (PG integration)', () => {
  let prisma: PrismaClient;
  let content: ListingContentQueryRepositoryAdapter;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    content = new ListingContentQueryRepositoryAdapter(prisma as PrismaService);
  });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });
  afterAll(async () => prisma?.$disconnect());

  function workspace(listingId: string, extra: Partial<Prisma.ContentWorkspaceUncheckedCreateInput> = {}) {
    return prisma.contentWorkspace.create({ data: {
      organizationId: ORG, ownerType: 'channel_listing', channelListingId: listingId,
      displayName: 'Listing content', normalizedTitle: randomUUID(), ...extra,
    } });
  }
  function thumbnail(listingId: string, imageUrl: string, updatedAt: string, extra: Partial<Prisma.ThumbnailUncheckedCreateInput> = {}) {
    return prisma.thumbnail.create({ data: { organizationId: ORG, listingId, imageUrl, updatedAt: new Date(updatedAt), ...extra } });
  }

  it('prefers the selected asset and preserves detail pointers, while profit thumbnails retain their own latest-active semantics', async () => {
    const listingId = randomUUID();
    const ws = await workspace(listingId);
    const asset = await prisma.contentAsset.create({ data: { organizationId: ORG, assetKey: randomUUID(), url: 'https://cdn/selected' } });
    const selection = await prisma.contentWorkspaceThumbnailSelection.create({ data: { organizationId: ORG, contentWorkspaceId: ws.id, contentAssetId: asset.id } });
    const artifact = await prisma.detailPageArtifact.create({ data: { organizationId: ORG, contentWorkspaceId: ws.id } });
    const revision = await prisma.detailPageRevision.create({ data: { organizationId: ORG, artifactId: artifact.id, html: '<p>Saved</p>' } });
    await prisma.contentWorkspace.update({ where: { id: ws.id, organizationId: ORG }, data: { currentThumbnailSelectionId: selection.id, currentDetailPageArtifactId: artifact.id, currentDetailPageRevisionId: revision.id } });
    await thumbnail(listingId, 'https://cdn/legacy', '2026-09-20');
    expect(await content.findForListings({ organizationId: ORG, listings: [{ id: listingId, channel: 'coupang' }] })).toEqual([{
      listingId, workspaceId: ws.id, thumbnailUrl: asset.url,
      detailPageArtifactId: artifact.id, detailPageRevisionId: revision.id, workspaceImageUrl: null, providerMedia: [],
    }]);
    expect(await prisma.$transaction(tx => content.readLatestListingThumbnails(ownerTransaction(tx), { organizationId: ORG, listingIds: [listingId] })))
      .toEqual([{ listingId, imageUrl: 'https://cdn/legacy' }]);
  });

  it('falls back to the latest active same-organization thumbnail with or without a workspace', async () => {
    const listingIds = [randomUUID(), randomUUID()];
    await workspace(listingIds[0]);
    for (const id of listingIds) {
      await thumbnail(id, 'https://cdn/old', '2026-09-18');
      await thumbnail(id, 'https://cdn/latest', '2026-09-19');
      await thumbnail(id, 'https://cdn/inactive', '2026-09-21', { status: 'inactive' });
      await thumbnail(id, 'https://cdn/foreign', '2026-09-22', { organizationId: OTHER });
    }
    const rows = await content.findForListings({ organizationId: ORG, listings: listingIds.map(id => ({ id, channel: 'coupang' })) });
    expect(rows.map(row => row.thumbnailUrl)).toEqual(['https://cdn/latest', 'https://cdn/latest']);
    expect(rows[1].workspaceId).toBeNull();
  });

  it('ignores foreign, deleted, inactive and non-listing workspaces', async () => {
    const listingIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await workspace(listingIds[0], { organizationId: OTHER });
    await workspace(listingIds[1], { isDeleted: true });
    await workspace(listingIds[2], { status: 'archived' });
    await workspace(listingIds[3], { ownerType: 'direct_detail_page' });
    const rows = await content.findForListings({ organizationId: ORG, listings: listingIds.map(id => ({ id, channel: 'coupang' })), includeProviderMedia: true });
    expect(rows.every(row => row.workspaceId === null && row.thumbnailUrl === null && row.providerMedia.length === 0)).toBe(true);
    expect(await content.findForListings({ organizationId: ORG, listings: [] })).toEqual([]);
  });

  it('returns only active provider images from workspace asset groups for the requested channel', async () => {
    const listingId = randomUUID();
    const ws = await workspace(listingId);
    const group = await prisma.contentGenerationGroup.create({ data: { organizationId: ORG, contentWorkspaceId: ws.id, groupType: 'workspace_assets' } });
    const unrelated = await prisma.contentGenerationGroup.create({ data: { organizationId: ORG, contentWorkspaceId: ws.id, groupType: 'input_variation' } });
    const media = (name: string, extra: Partial<Prisma.ContentAssetUncheckedCreateInput> = {}) => prisma.contentAsset.create({ data: {
      organizationId: ORG, originGenerationGroupId: group.id, assetKey: randomUUID(), url: `https://cdn/${name}`,
      assetType: 'image', role: 'detail', metadata: { sourceType: 'coupang_catalog' }, ...extra,
    } });
    await media('option', { role: 'option', sortOrder: 2, metadata: { sourceType: 'coupang_catalog', externalOptionIds: [' b ', 'a', 'b', '', 1], externalOptionId: 'c' } });
    await media('primary', { role: 'primary', sortOrder: 1 });
    await media('mall', { sortOrder: 3, metadata: { sourceType: 'channel_catalog', channel: 'tmon' } });
    await media('inactive', { metadata: { sourceType: 'coupang_catalog', active: false } });
    await media('deleted', { isDeleted: true });
    await media('video', { assetType: 'video' });
    await media('wrong-role', { role: 'generated' });
    await media('wrong-group', { originGenerationGroupId: unrelated.id });
    await media('generated', { metadata: { sourceType: 'generated' } });
    const query = (channel: string, includeProviderMedia = true) => content.findForListings({ organizationId: ORG, listings: [{ id: listingId, channel }], includeProviderMedia });
    expect((await query('coupang'))[0].providerMedia).toEqual([
      { sourceUrl: 'https://cdn/primary', role: 'primary', sortOrder: 1, externalOptionIds: [] },
      { sourceUrl: 'https://cdn/option', role: 'option', sortOrder: 2, externalOptionIds: ['a', 'b', 'c'] },
    ]);
    expect((await query('tmon'))[0].providerMedia.map(row => row.sourceUrl)).toEqual(['https://cdn/mall']);
    expect((await query('coupang', false))[0].providerMedia).toEqual([]);
  });

  it('reads uncommitted latest thumbnails in the caller transaction without opening another transaction', async () => {
    const listingId = randomUUID();
    await prisma.$transaction(async tx => {
      await tx.thumbnail.create({ data: { organizationId: ORG, listingId, imageUrl: 'https://cdn/uncommitted' } });
      expect(await content.readLatestListingThumbnails(ownerTransaction(tx), { organizationId: ORG, listingIds: [listingId] }))
        .toEqual([{ listingId, imageUrl: 'https://cdn/uncommitted' }]);
      expect(await content.readLatestListingThumbnails(ownerTransaction(tx), { organizationId: OTHER, listingIds: [listingId] })).toEqual([]);
      expect(await content.readLatestListingThumbnails(ownerTransaction(tx), { organizationId: ORG, listingIds: [] })).toEqual([]);
    });
  });

  it('merges AI content without replacing observed listing and option facts', async () => {
    const account = await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'coupang', name: 'Wing' } });
    const listing = await prisma.channelListing.create({ data: {
      organizationId: ORG, channelAccountId: account.id, externalId: 'provider-listing', channelName: 'Provider title', status: 'ON_SALE',
      rawJson: { detailDocuments: [{ id: 'doc', kind: 'description', value: '<p>Observed</p>' }] },
    } });
    await prisma.channelListingOption.create({ data: {
      organizationId: ORG, listingId: listing.id, externalOptionId: 'provider-option', itemName: 'Observed option',
      salePrice: 1500, sellerSku: 'provider-sku', status: 'SOLD_OUT', attributesJson: { color: 'blue' },
      rawJson: { vendorItemId: 'vendor-item', sellerProductItemId: 'seller-item', detailDocumentIds: ['doc'] },
    } });
    const ws = await workspace(listing.id);
    await thumbnail(listing.id, 'https://cdn/fallback', '2026-09-20');
    const persistence = new ChannelListingQueryPersistenceAdapter(prisma as PrismaService);
    const service = new ChannelListingQueryService(persistence, content);
    const facts = await persistence.getWorkspace(ORG, listing.id);
    const merged = await service.getWorkspace(ORG, listing.id);
    expect(facts).toMatchObject({ contentWorkspaceId: null, thumbnailUrl: null, providerDetail: { media: [] } });
    expect(merged).toMatchObject({ contentWorkspaceId: ws.id, thumbnailUrl: 'https://cdn/fallback', status: 'ON_SALE' });
    expect(merged?.providerDetail).toEqual(facts?.providerDetail);
    expect(merged?.providerDetail?.options[0]).toMatchObject({ externalOptionId: 'provider-option', vendorItemId: 'vendor-item', sellerProductItemId: 'seller-item', salePrice: 1500, sellerSku: 'provider-sku', status: 'SOLD_OUT', attributes: { color: 'blue' } });
    expect((await service.list(ORG)).items[0]).toMatchObject({ id: listing.id, contentWorkspaceId: ws.id, thumbnailUrl: 'https://cdn/fallback' });
    expect(await service.getWorkspace(OTHER, listing.id)).toBeNull();
  });
  it('keeps the matrix workspace image independent of selected thumbnails and provider media', async () => {
    const listingId = randomUUID();
    const ws = await workspace(listingId);
    const group = await prisma.contentGenerationGroup.create({ data: { organizationId: ORG, contentWorkspaceId: ws.id, groupType: 'input_variation' } });
    await prisma.contentAsset.create({ data: { organizationId: ORG, originGenerationGroupId: group.id, assetKey: randomUUID(), url: 'https://cdn/matrix', role: 'thumbnail', metadata: { sourceType: 'generated' } } });
    await thumbnail(listingId, 'https://cdn/legacy', '2026-09-20');
    expect((await content.findForListings({ organizationId: ORG, listings: [{ id: listingId, channel: 'coupang' }], includeProviderMedia: true }))[0])
      .toMatchObject({ workspaceImageUrl: 'https://cdn/matrix', thumbnailUrl: 'https://cdn/legacy', providerMedia: [] });
  });

  it('analysis paths select active Coupang listing workspaces and retain AI thumbnail fallback in generation reads', async () => {
    const cases = [
      { channel: 'coupang', organizationId: ORG, isActive: true },
      { channel: 'coupang', organizationId: ORG, isActive: false },
      { channel: 'tmon', organizationId: ORG, isActive: true },
      { channel: 'coupang', organizationId: OTHER, isActive: true },
    ];
    const workspaces = [];
    for (const row of cases) {
      const account = await prisma.channelAccount.create({ data: { organizationId: row.organizationId, channel: row.channel, name: randomUUID() } });
      const listing = await prisma.channelListing.create({ data: { organizationId: row.organizationId, channelAccountId: account.id, externalId: randomUUID(), isActive: row.isActive, category: 'Observed category' } });
      workspaces.push(await workspace(listing.id, { organizationId: row.organizationId }));
      await thumbnail(listing.id, 'https://cdn/analysis', '2026-09-20', { organizationId: row.organizationId });
    }
    const listings = makeChannelListingQuery(prisma);
    const analysis = new ThumbnailAnalysisRepositoryAdapter(prisma as PrismaService, listings);
    const eligibleId = workspaces[0].id;
    expect((await analysis.findAllAnalysisWorkspaces(ORG)).map(row => row.id)).toEqual([eligibleId]);
    expect(await analysis.findWorkspaceForAnalysis(eligibleId, ORG)).toMatchObject({ id: eligibleId, imageUrl: 'https://cdn/analysis', category: 'Observed category' });
    expect((await analysis.findWorkspacesForBatch(workspaces.map(row => row.id), ORG)).map(row => row.id)).toEqual([eligibleId]);
    expect((await analysis.findWorkspacesForPreInspect(undefined, ORG)).map(row => row.id)).toEqual([eligibleId]);
    expect(await analysis.findRecomposeWorkspace(workspaces[1].id, ORG)).toBeNull();
    const ledger = new ThumbnailGenerationLedgerRepositoryAdapter(prisma as PrismaService, {} as never, listings, makeChannelRecipes(prisma));
    expect(await ledger.findWorkspaceForThumbnailEditor(eligibleId, ORG)).toMatchObject({ id: eligibleId, imageUrl: 'https://cdn/analysis', category: 'Observed category' });
    expect(await ledger.findWorkspaceForThumbnailEditor(eligibleId, OTHER)).toBeNull();
  });

  it('catalog display media excludes inactive listings/accounts and other organizations via Channels', async () => {
    const ids = [];
    for (const row of [
      { organizationId: ORG, isActive: true, status: 'active' },
      { organizationId: ORG, isActive: false, status: 'active' },
      { organizationId: ORG, isActive: true, status: 'inactive' },
      { organizationId: OTHER, isActive: true, status: 'active' },
    ]) {
      const account = await prisma.channelAccount.create({ data: { organizationId: row.organizationId, channel: 'coupang', name: randomUUID(), status: row.status } });
      const listing = await prisma.channelListing.create({ data: { organizationId: row.organizationId, channelAccountId: account.id, externalId: randomUUID(), isActive: row.isActive } });
      ids.push(listing.id);
      const ws = await workspace(listing.id, { organizationId: row.organizationId });
      const group = await prisma.contentGenerationGroup.create({ data: { organizationId: row.organizationId, contentWorkspaceId: ws.id, groupType: 'workspace_assets' } });
      await prisma.contentAsset.create({ data: { organizationId: row.organizationId, originGenerationGroupId: group.id, assetKey: randomUUID(), url: 'https://cdn/provider', role: 'primary', metadata: { sourceType: 'coupang_catalog' } } });
    }
    const adapter = new CatalogDisplayMediaRepositoryAdapter(prisma as PrismaService, makeChannelListingQuery(prisma));
    expect((await adapter.findCandidates({ organizationId: ORG, channelListingIds: ids })).map(row => row.channelListingId)).toEqual([ids[0]]);
  });

});
