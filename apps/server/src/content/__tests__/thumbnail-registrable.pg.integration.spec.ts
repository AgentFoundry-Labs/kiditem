import { createHash, randomUUID } from 'node:crypto';
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

/**
 * 몰에 올릴 대표이미지(KID-313 W3a): 열쇠는 판매 상품과 고른 자산이고, 고르지 않았으면 작업공간의 현재
 * 대표이미지다. 업로드본과 AI 후보가 같은 길로 나간다.
 */
describe('registrable thumbnail (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: RegistrableThumbnailService;
  const storage = new Map<string, { buffer: Buffer; mimeType: string }>();

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new RegistrableThumbnailService(
      new RegistrableThumbnailRepositoryAdapter(prisma as PrismaService),
      fakeStorageImageFetch(storage),
    );
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    storage.clear();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function productWorkspace(organizationId = ORG) {
    const salesProductId = randomUUID();
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId, ownerType: 'sales_product', salesProductId },
    });
    const asset = (source: 'upload' | 'ai', url: string) => prisma.contentAsset.create({
      data: {
        organizationId,
        contentWorkspaceId: workspace.id,
        source,
        assetKey: `${source}:${randomUUID()}`,
        url,
        role: 'thumbnail',
      },
    });
    return { salesProductId, workspace, asset };
  }

  it('reads the workspace representative image when nothing is chosen, and the chosen asset otherwise', async () => {
    const { salesProductId, workspace, asset } = await productWorkspace();
    const upload = await asset('upload', PNG_DATA_URL);
    const candidate = await asset('ai', 'https://storage.example.com/ai.png');
    await prisma.contentWorkspace.update({ where: { id: workspace.id }, data: { currentThumbnailAssetId: upload.id } });

    await expect(service.readRegistrableThumbnail({ organizationId: ORG, salesProductId, selectedThumbnailAssetId: null }))
      .resolves.toEqual({
        assetId: upload.id,
        contentWorkspaceId: workspace.id,
        salesProductId,
        image: { url: PNG_DATA_URL, sha256: null },
      });
    await expect(service.readRegistrableThumbnail({ organizationId: ORG, salesProductId, selectedThumbnailAssetId: candidate.id }))
      .resolves.toMatchObject({ assetId: candidate.id, image: { url: 'https://storage.example.com/ai.png' } });
  });

  it('answers nothing when the product has no representative image, and refuses another product asset', async () => {
    const { salesProductId } = await productWorkspace();
    const other = await productWorkspace();
    const foreign = await other.asset('upload', PNG_DATA_URL);

    await expect(service.findRegistrableThumbnail({ organizationId: ORG, salesProductId, selectedThumbnailAssetId: null }))
      .resolves.toBeNull();
    await expect(service.readRegistrableThumbnail({ organizationId: ORG, salesProductId, selectedThumbnailAssetId: null }))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.readRegistrableThumbnail({ organizationId: ORG, salesProductId, selectedThumbnailAssetId: foreign.id }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.findRegistrableThumbnail({ organizationId: ORG, salesProductId: randomUUID(), selectedThumbnailAssetId: null }))
      .resolves.toBeNull();
  });

  it('keeps the read inside one organization', async () => {
    const { salesProductId, workspace, asset } = await productWorkspace(OTHER_ORGANIZATION_ID);
    const upload = await asset('upload', PNG_DATA_URL);
    await prisma.contentWorkspace.update({ where: { id: workspace.id }, data: { currentThumbnailAssetId: upload.id } });

    await expect(service.findRegistrableThumbnail({ organizationId: ORG, salesProductId, selectedThumbnailAssetId: null }))
      .resolves.toBeNull();
    await expect(service.loadThumbnailImage({ organizationId: ORG, assetId: upload.id }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('loads the asset photo from a data URL or trusted storage with its digest', async () => {
    const { asset } = await productWorkspace();
    const inline = await asset('upload', PNG_DATA_URL);
    const stored = await asset('ai', 'https://storage.example.com/ai.png');
    storage.set('https://storage.example.com/ai.png', { buffer: PNG, mimeType: 'image/png' });
    const digest = createHash('sha256').update(PNG).digest('hex');

    await expect(service.loadThumbnailImage({ organizationId: ORG, assetId: inline.id })).resolves.toEqual({
      dataUrl: PNG_DATA_URL, filename: `${inline.id}.png`, mimeType: 'image/png', sha256: digest,
    });
    await expect(service.loadThumbnailImage({ organizationId: ORG, assetId: stored.id })).resolves.toEqual({
      dataUrl: PNG_DATA_URL, filename: `${stored.id}.png`, mimeType: 'image/png', sha256: digest,
    });
  });
});
