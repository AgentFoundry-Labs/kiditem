import { makeChannelListingQuery, makeChannelRecipes } from '../../test-helpers/channel-catalog-ports';
import { CatalogDisplayMediaRepositoryAdapter } from '../adapter/out/repository/catalog-display-media.repository.adapter';
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

/**
 * 리스팅이 보여 주는 콘텐츠(KID-313 W3a): 대표이미지는 리스팅을 가리키는 작업공간의 현재 대표이미지 자산이다.
 * 옛 `thumbnails` 표와 썸네일 선택 표는 없다.
 */
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
      organizationId: ORG, ownerType: 'channel_listing', channelListingId: listingId, ...extra,
    } });
  }
  function asset(
    workspaceId: string,
    name: string,
    extra: Partial<Prisma.ContentAssetUncheckedCreateInput> = {},
  ) {
    return prisma.contentAsset.create({ data: {
      organizationId: ORG, contentWorkspaceId: workspaceId, source: 'upload', assetKey: randomUUID(),
      url: `https://cdn/${name}`, role: 'thumbnail', ...extra,
    } });
  }
  async function representative(workspaceId: string, name: string, organizationId = ORG) {
    const row = await asset(workspaceId, name, { organizationId });
    await prisma.contentWorkspace.update({ where: { id: workspaceId }, data: { currentThumbnailAssetId: row.id } });
    return row;
  }

  it('shows the workspace representative image and reads it for per-listing profit', async () => {
    const listingId = randomUUID();
    const ws = await workspace(listingId);
    const current = await representative(ws.id, 'current');
    expect(await content.findForListings({ organizationId: ORG, listings: [{ id: listingId, channel: 'coupang' }] })).toEqual([{
      listingId, workspaceId: ws.id, thumbnailUrl: current.url,
      detailPageArtifactId: null, detailPageRevisionId: null, workspaceImageUrl: current.url, providerMedia: [],
    }]);
    expect(await prisma.$transaction(tx => content.readLatestListingThumbnails(ownerTransaction(tx), { organizationId: ORG, listingIds: [listingId] })))
      .toEqual([{ listingId, imageUrl: current.url }]);
  });

  it('serves listing content from the draft workspace attached to that listing', async () => {
    const listingId = randomUUID();
    const ws = await prisma.contentWorkspace.create({ data: {
      organizationId: ORG, ownerType: 'sales_product', salesProductId: randomUUID(), channelListingId: listingId,
    } });
    const current = await representative(ws.id, 'draft-thumb');
    expect(await content.findForListings({ organizationId: ORG, listings: [{ id: listingId, channel: 'coupang' }] }))
      .toMatchObject([{ listingId, workspaceId: ws.id, thumbnailUrl: current.url }]);
  });

  it('has no thumbnail without a representative image, a workspace or a live asset', async () => {
    const listingIds = [randomUUID(), randomUUID(), randomUUID()];
    await workspace(listingIds[0]!);
    const ws = await workspace(listingIds[1]!);
    const gone = await representative(ws.id, 'gone');
    await prisma.contentAsset.update({ where: { id: gone.id }, data: { isDeleted: true } });
    const rows = await content.findForListings({ organizationId: ORG, listings: listingIds.map(id => ({ id, channel: 'coupang' })) });
    expect(rows.map(row => row.thumbnailUrl)).toEqual([null, null, null]);
    expect(rows[2]!.workspaceId).toBeNull();
  });

  it('ignores foreign, deleted, inactive and non-listing workspaces', async () => {
    const listingIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await workspace(listingIds[0]!, { organizationId: OTHER });
    await workspace(listingIds[1]!, { isDeleted: true });
    await workspace(listingIds[2]!, { status: 'archived' });
    await workspace(listingIds[3]!, { ownerType: 'direct_detail_page' });
    const rows = await content.findForListings({ organizationId: ORG, listings: listingIds.map(id => ({ id, channel: 'coupang' })), includeProviderMedia: true });
    expect(rows.every(row => row.workspaceId === null && row.thumbnailUrl === null && row.providerMedia.length === 0)).toBe(true);
    expect(await content.findForListings({ organizationId: ORG, listings: [] })).toEqual([]);
  });

  it('returns only active catalog images of the workspace for the requested channel', async () => {
    const listingId = randomUUID();
    const ws = await workspace(listingId);
    const media = (name: string, extra: Partial<Prisma.ContentAssetUncheckedCreateInput> = {}) => asset(ws.id, name, {
      source: 'catalog', assetType: 'image', role: 'detail', metadata: { sourceType: 'coupang_catalog' }, ...extra,
    });
    await media('option', { role: 'option', sortOrder: 2, metadata: { sourceType: 'coupang_catalog', externalOptionIds: [' b ', 'a', 'b', '', 1], externalOptionId: 'c' } });
    await media('primary', { role: 'primary', sortOrder: 1 });
    await media('mall', { sortOrder: 3, metadata: { sourceType: 'channel_catalog', channel: 'tmon' } });
    await media('inactive', { metadata: { sourceType: 'coupang_catalog', active: false } });
    await media('deleted', { isDeleted: true });
    await media('video', { assetType: 'video' });
    await media('wrong-role', { role: 'generated' });
    await media('uploaded', { source: 'upload' });
    await media('generated', { metadata: { sourceType: 'generated' } });
    const query = (channel: string, includeProviderMedia = true) => content.findForListings({ organizationId: ORG, listings: [{ id: listingId, channel }], includeProviderMedia });
    expect((await query('coupang'))[0]!.providerMedia).toEqual([
      { sourceUrl: 'https://cdn/primary', role: 'primary', sortOrder: 1, externalOptionIds: [] },
      { sourceUrl: 'https://cdn/option', role: 'option', sortOrder: 2, externalOptionIds: ['a', 'b', 'c'] },
    ]);
    expect((await query('tmon'))[0]!.providerMedia.map(row => row.sourceUrl)).toEqual(['https://cdn/mall']);
    expect((await query('coupang', false))[0]!.providerMedia).toEqual([]);
  });

  it('reads an uncommitted representative image in the caller transaction without opening another transaction', async () => {
    const listingId = randomUUID();
    await prisma.$transaction(async tx => {
      const ws = await tx.contentWorkspace.create({ data: { organizationId: ORG, ownerType: 'channel_listing', channelListingId: listingId } });
      const row = await tx.contentAsset.create({ data: {
        organizationId: ORG, contentWorkspaceId: ws.id, source: 'catalog', assetKey: randomUUID(), url: 'https://cdn/uncommitted', role: 'primary',
      } });
      await tx.contentWorkspace.update({ where: { id: ws.id }, data: { currentThumbnailAssetId: row.id } });
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
    await representative(ws.id, 'representative');
    const persistence = new ChannelListingQueryPersistenceAdapter(prisma as PrismaService);
    const service = new ChannelListingQueryService(persistence, content);
    const facts = await persistence.getWorkspace(ORG, listing.id);
    const merged = await service.getWorkspace(ORG, listing.id);
    expect(facts).toMatchObject({ contentWorkspaceId: null, thumbnailUrl: null, providerDetail: { media: [] } });
    expect(merged).toMatchObject({ contentWorkspaceId: ws.id, thumbnailUrl: 'https://cdn/representative', status: 'ON_SALE' });
    expect(merged?.providerDetail).toEqual(facts?.providerDetail);
    expect(merged?.providerDetail?.options[0]).toMatchObject({ externalOptionId: 'provider-option', vendorItemId: 'vendor-item', sellerProductItemId: 'seller-item', salePrice: 1500, sellerSku: 'provider-sku', status: 'SOLD_OUT', attributes: { color: 'blue' } });
    expect((await service.list(ORG)).items[0]).toMatchObject({ id: listing.id, contentWorkspaceId: ws.id, thumbnailUrl: 'https://cdn/representative' });
    expect(await service.getWorkspace(OTHER, listing.id)).toBeNull();
  });

  it('keeps the matrix workspace image independent of the representative image and AI candidates', async () => {
    const listingId = randomUUID();
    const ws = await workspace(listingId);
    await asset(ws.id, 'matrix', { sortOrder: -5 });
    await asset(ws.id, 'ai-candidate', { source: 'ai', sortOrder: -9 });
    await representative(ws.id, 'representative');
    expect((await content.findForListings({ organizationId: ORG, listings: [{ id: listingId, channel: 'coupang' }], includeProviderMedia: true }))[0])
      .toMatchObject({ workspaceImageUrl: 'https://cdn/matrix', thumbnailUrl: 'https://cdn/representative', providerMedia: [] });
  });

  it('opens the thumbnail editor on an active listing workspace with its representative image and category', async () => {
    const account = await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'coupang', name: randomUUID() } });
    const listing = await prisma.channelListing.create({ data: { organizationId: ORG, channelAccountId: account.id, externalId: randomUUID(), isActive: true, category: 'Observed category' } });
    const ws = await workspace(listing.id);
    await representative(ws.id, 'editor');
    const ledger = new ThumbnailGenerationLedgerRepositoryAdapter(prisma as PrismaService, {} as never, makeChannelListingQuery(prisma), makeChannelRecipes(prisma));
    expect(await ledger.findWorkspaceForThumbnailEditor(ws.id, ORG)).toMatchObject({ id: ws.id, imageUrl: 'https://cdn/editor', category: 'Observed category' });
    expect(await ledger.findWorkspaceForThumbnailEditor(ws.id, OTHER)).toBeNull();
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
      await prisma.contentAsset.create({ data: {
        organizationId: row.organizationId, contentWorkspaceId: ws.id, source: 'catalog', assetKey: randomUUID(),
        url: 'https://cdn/provider', role: 'primary', metadata: { sourceType: 'coupang_catalog' },
      } });
    }
    const adapter = new CatalogDisplayMediaRepositoryAdapter(prisma as PrismaService, makeChannelListingQuery(prisma));
    expect((await adapter.findCandidates({ organizationId: ORG, channelListingIds: ids })).map(row => row.channelListingId)).toEqual([ids[0]]);
  });
});
