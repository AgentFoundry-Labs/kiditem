import { createHash } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { RegistrableThumbnailRepositoryAdapter } from '../adapter/out/repository/registrable-thumbnail.repository.adapter';
import { RegistrableThumbnailService } from '../application/service/registrable-thumbnail.service';
import { fakeStorageImageFetch } from './helpers/fake-storage-image-fetch';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const PNG_DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`;

describe('registrable thumbnail (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: RegistrableThumbnailService;
  const storage = new Map<string, { buffer: Buffer; mimeType: string }>();

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const repository = new RegistrableThumbnailRepositoryAdapter(prisma as PrismaService);
    service = new RegistrableThumbnailService(repository, fakeStorageImageFetch(storage));
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    storage.clear();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function listingWorkspace(input: { channelName: string | null; displayName?: string; listingActive?: boolean }) {
    const account = await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'coupang', name: 'Wing', status: 'active' } });
    const listing = await prisma.channelListing.create({
      data: { organizationId: ORG, channelAccountId: account.id, externalId: `ext-${Math.random()}`, channelName: input.channelName, isActive: input.listingActive ?? true },
    });
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId: ORG, ownerType: 'channel_listing', channelListingId: listing.id, displayName: input.displayName ?? '작업공간 이름', normalizedTitle: 'ws' },
    });
    return { account, listing, workspace };
  }

  async function generation(workspaceId: string, data: { selectedUrl?: string | null; candidateUrls?: string[]; organizationId?: string } = {}) {
    return prisma.thumbnailGeneration.create({
      data: {
        organizationId: data.organizationId ?? ORG,
        contentWorkspaceId: workspaceId,
        status: 'succeeded',
        selectedUrl: data.selectedUrl === undefined ? PNG_DATA_URL : data.selectedUrl,
        candidates: { create: (data.candidateUrls ?? []).map((url, index) => ({ organizationId: data.organizationId ?? ORG, url, sortOrder: index })) },
      },
    });
  }

  it('reads the approved image with the workspace name and owner, without reading the Channels listing', async () => {
    const { listing, workspace } = await listingWorkspace({ channelName: encodeURIComponent('쿠팡 상품명'), listingActive: false });
    const gen = await generation(workspace.id);

    await expect(service.readRegistrableThumbnail({ organizationId: ORG, generationId: gen.id })).resolves.toEqual({
      generationId: gen.id,
      contentWorkspaceId: workspace.id,
      salesProductId: null,
      channelListingId: listing.id,
      workspaceDisplayName: '작업공간 이름',
      image: { url: PNG_DATA_URL, assetId: null },
    });
  });

  it('names a sales-product workspace by its display name and uses the single candidate when none is selected', async () => {
    const product = await prisma.salesProduct.create({ data: { organizationId: ORG, name: '판매상품' } });
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId: ORG, ownerType: 'sales_product', salesProductId: product.id, displayName: '판매상품 작업공간', normalizedTitle: 'sp' },
    });
    const gen = await generation(workspace.id, { selectedUrl: null, candidateUrls: ['http://storage.local/a.png'] });

    await expect(service.readRegistrableThumbnail({ organizationId: ORG, generationId: gen.id })).resolves.toMatchObject({
      salesProductId: product.id,
      channelListingId: null,
      workspaceDisplayName: '판매상품 작업공간',
      image: { url: 'http://storage.local/a.png' },
    });
  });

  it('keeps the 404 answers for a missing generation, image or workspace', async () => {
    const { workspace } = await listingWorkspace({ channelName: null, displayName: '  ' });
    await expect(service.readRegistrableThumbnail({ organizationId: ORG, generationId: '00000000-0000-4000-8000-000000000999' }))
      .rejects.toThrow(new NotFoundException('ThumbnailGeneration 00000000-0000-4000-8000-000000000999 not found'));

    const noImage = await generation(workspace.id, { selectedUrl: null, candidateUrls: ['http://a/1.png', 'http://a/2.png'] });
    await expect(service.readRegistrableThumbnail({ organizationId: ORG, generationId: noImage.id }))
      .rejects.toThrow(new NotFoundException('Generation not found or no selected image'));

    const archived = await prisma.contentWorkspace.create({
      data: { organizationId: ORG, ownerType: 'direct_detail_page', displayName: '보관', normalizedTitle: 'archived', status: 'archived' },
    });
    const orphan = await generation(archived.id);
    await expect(service.readRegistrableThumbnail({ organizationId: ORG, generationId: orphan.id }))
      .rejects.toThrow(new NotFoundException(`ContentWorkspace ${archived.id} not found`));
  });

  it('does not read another organization generation', async () => {
    const other = await prisma.contentWorkspace.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, ownerType: 'direct_detail_page', displayName: '남의 것', normalizedTitle: 'other' },
    });
    const gen = await generation(other.id, { organizationId: OTHER_ORGANIZATION_ID });
    await expect(service.readRegistrableThumbnail({ organizationId: ORG, generationId: gen.id })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('loads a data URL or a storage image as a data URL with the sha256 of its bytes and rejects oversize or unsupported images', async () => {
    const generationId = '00000000-0000-4000-8000-0000000000aa';
    await expect(service.loadThumbnailImage({ organizationId: ORG, generationId, url: PNG_DATA_URL })).resolves.toEqual({
      dataUrl: PNG_DATA_URL,
      filename: `${generationId}.png`,
      mimeType: 'image/png',
      sha256: createHash('sha256').update(PNG).digest('hex'),
    });

    const jpeg = Buffer.from('ffd8ffe0', 'hex');
    storage.set('http://storage.local/b.jpg', { buffer: jpeg, mimeType: 'image/jpeg' });
    await expect(service.loadThumbnailImage({ organizationId: ORG, generationId, url: 'http://storage.local/b.jpg' })).resolves.toEqual({
      dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      filename: `${generationId}.jpg`,
      mimeType: 'image/jpeg',
      sha256: createHash('sha256').update(jpeg).digest('hex'),
    });

    storage.set('http://storage.local/huge.png', { buffer: Buffer.alloc(10 * 1024 * 1024 + 1), mimeType: 'image/png' });
    await expect(service.loadThumbnailImage({ organizationId: ORG, generationId, url: 'http://storage.local/huge.png' }))
      .rejects.toThrow(new BadRequestException('image too large'));
    await expect(service.loadThumbnailImage({ organizationId: ORG, generationId, url: 'data:image/gif;base64,R0lGOD' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
