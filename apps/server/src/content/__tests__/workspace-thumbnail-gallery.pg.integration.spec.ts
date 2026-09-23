import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ContentAssetLibraryRepositoryAdapter } from '../adapter/out/repository/content-asset-library.repository.adapter';
import { ContentAssetService } from '../application/service/content-asset.service';

/**
 * 대표이미지 갤러리(KID-313 W3a): 운영자 업로드와 AI 후보가 같은 `content_assets` 행이고,
 * 채택은 워크스페이스의 `current_thumbnail_asset_id` 하나를 옮긴다. 저장한 미리보기 목록(업로드)은
 * 등록 사진(`registrationImages.thumbnail`, 곧 Wing 추가이미지)으로 순서대로 다시 읽힌다.
 */
describe('workspace thumbnail gallery (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ContentAssetService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new ContentAssetService(
      new ContentAssetLibraryRepositoryAdapter(prisma as unknown as PrismaService),
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function seedDraftWorkspace(organizationId = TEST_ORGANIZATION_ID) {
    const salesProductId = randomUUID();
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId, ownerType: 'sales_product', salesProductId },
    });
    return { salesProductId, workspaceId: workspace.id };
  }

  async function seedAiCandidate(workspaceId: string, url: string) {
    const job = await prisma.thumbnailGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspaceId,
        status: 'succeeded',
        method: 'generate',
      },
    });
    return prisma.contentAsset.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspaceId,
        source: 'ai',
        thumbnailGenerationId: job.id,
        assetKey: `ai-candidate:${job.id}:0`,
        url,
        role: 'thumbnail',
      },
    });
  }

  const saveGallery = (workspaceId: string, thumbnailUrls: string[]) =>
    service.replaceWorkspaceThumbnailGallery({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      createdByUserId: TEST_USER_ID,
      thumbnailUrls,
    });

  const registrationThumbnails = (salesProductId: string) =>
    service
      .listRegistrationImages({ organizationId: TEST_ORGANIZATION_ID, salesProductId })
      .then((images) => images.thumbnail);

  it('upload → gallery → adopt makes the uploaded asset the workspace representative image', async () => {
    const { salesProductId, workspaceId } = await seedDraftWorkspace();
    await saveGallery(workspaceId, [
      'https://cdn.example.com/thumb-a.png',
      'https://cdn.example.com/thumb-b.png',
    ]);

    const gallery = await service.listThumbnailGallery({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
    });
    expect(gallery.map((item) => [item.url, item.source, item.isCurrentThumbnail])).toEqual(
      expect.arrayContaining([
        ['https://cdn.example.com/thumb-a.png', 'upload', false],
        ['https://cdn.example.com/thumb-b.png', 'upload', false],
      ]),
    );
    const uploadB = gallery.find((item) => item.url.endsWith('thumb-b.png'))!;

    const adopted = await service.adoptCurrentThumbnail({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      assetId: uploadB.id,
    });

    expect(adopted).toMatchObject({ id: uploadB.id, isCurrentThumbnail: true });
    const workspace = await prisma.contentWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect(workspace.currentThumbnailAssetId).toBe(uploadB.id);
    await expect(service.findCurrentThumbnail({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId,
    })).resolves.toEqual({
      assetId: uploadB.id,
      url: 'https://cdn.example.com/thumb-b.png',
      source: 'upload',
      thumbnailGenerationId: null,
    });
  });

  it('shows AI candidates and uploads in one gallery, newest first, and adopts an AI candidate', async () => {
    const { salesProductId, workspaceId } = await seedDraftWorkspace();
    await saveGallery(workspaceId, ['https://cdn.example.com/upload.png']);
    const candidate = await seedAiCandidate(workspaceId, 'https://cdn.example.com/ai-1.png');

    const gallery = await service.listThumbnailGallery({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
    });
    expect(gallery.map((item) => [item.url, item.source])).toEqual([
      ['https://cdn.example.com/ai-1.png', 'ai'],
      ['https://cdn.example.com/upload.png', 'upload'],
    ]);
    expect(gallery[0]!.thumbnailGenerationId).toBe(candidate.thumbnailGenerationId);

    // 채택하지 않은 AI 후보는 몰 추가이미지로 가지 않는다.
    await expect(registrationThumbnails(salesProductId)).resolves.toEqual([
      'https://cdn.example.com/upload.png',
    ]);

    await service.adoptCurrentThumbnail({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      assetId: candidate.id,
    });
    await expect(service.findCurrentThumbnail({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId,
    })).resolves.toMatchObject({ assetId: candidate.id, source: 'ai' });
    await expect(registrationThumbnails(salesProductId)).resolves.toEqual([
      'https://cdn.example.com/upload.png',
      'https://cdn.example.com/ai-1.png',
    ]);
  });

  it('rejects adopting an asset that belongs to another workspace or organization', async () => {
    const own = await seedDraftWorkspace();
    const other = await seedDraftWorkspace();
    await saveGallery(other.workspaceId, ['https://cdn.example.com/foreign.png']);
    const foreign = await prisma.contentAsset.findFirstOrThrow({
      where: { contentWorkspaceId: other.workspaceId },
    });

    await expect(service.adoptCurrentThumbnail({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: own.workspaceId,
      assetId: foreign.id,
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.adoptCurrentThumbnail({
      organizationId: OTHER_ORGANIZATION_ID,
      contentWorkspaceId: other.workspaceId,
      assetId: foreign.id,
    })).rejects.toBeInstanceOf(NotFoundException);

    const workspaces = await prisma.contentWorkspace.findMany({
      where: { id: { in: [own.workspaceId, other.workspaceId] } },
      select: { currentThumbnailAssetId: true },
    });
    expect(workspaces.map((row) => row.currentThumbnailAssetId)).toEqual([null, null]);
  });

  it('adopts only thumbnail assets, plus the catalog primary photo of a listing workspace', async () => {
    const own = await seedDraftWorkspace();
    const listingWorkspace = await prisma.contentWorkspace.create({
      data: { organizationId: TEST_ORGANIZATION_ID, ownerType: 'channel_listing', channelListingId: randomUUID() },
    });
    const photo = (contentWorkspaceId: string, role: string, source = 'upload') => prisma.contentAsset.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId, source, assetKey: `${role}:${randomUUID()}`,
      url: `https://cdn.example.com/${role}.png`, role,
    } });
    const adopt = (contentWorkspaceId: string, assetId: string) => service.adoptCurrentThumbnail({
      organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId, assetId,
    });

    for (const role of ['detail_source', 'detail_image']) {
      await expect(adopt(own.workspaceId, (await photo(own.workspaceId, role)).id)).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(adopt(own.workspaceId, (await photo(own.workspaceId, 'primary', 'catalog')).id)).rejects.toBeInstanceOf(BadRequestException);
    const catalogPrimary = await photo(listingWorkspace.id, 'primary', 'catalog');
    await expect(adopt(listingWorkspace.id, catalogPrimary.id)).resolves.toMatchObject({ id: catalogPrimary.id });
    await expect(adopt(listingWorkspace.id, (await photo(listingWorkspace.id, 'detail', 'catalog')).id)).rejects.toBeInstanceOf(BadRequestException);
    expect((await prisma.contentWorkspace.findUniqueOrThrow({ where: { id: own.workspaceId } })).currentThumbnailAssetId).toBeNull();
  });

  it('reads the saved preview list back in order and replaces rather than appends', async () => {
    const { salesProductId, workspaceId } = await seedDraftWorkspace();
    await saveGallery(workspaceId, [
      'https://cdn.example.com/thumb-a.png',
      'https://cdn.example.com/thumb-b.png',
    ]);
    await saveGallery(workspaceId, [
      'https://cdn.example.com/thumb-c.png',
      'https://cdn.example.com/thumb-a.png',
    ]);

    await expect(registrationThumbnails(salesProductId)).resolves.toEqual([
      'https://cdn.example.com/thumb-c.png',
      'https://cdn.example.com/thumb-a.png',
    ]);

    await saveGallery(workspaceId, []);
    await expect(registrationThumbnails(salesProductId)).resolves.toEqual([]);
  });

  it('keeps the adopted asset and AI candidates when the upload list drops them', async () => {
    const { workspaceId } = await seedDraftWorkspace();
    await saveGallery(workspaceId, [
      'https://cdn.example.com/thumb-a.png',
      'https://cdn.example.com/thumb-b.png',
    ]);
    const candidate = await seedAiCandidate(workspaceId, 'https://cdn.example.com/ai-1.png');
    const adopted = await prisma.contentAsset.findFirstOrThrow({
      where: { contentWorkspaceId: workspaceId, url: 'https://cdn.example.com/thumb-b.png' },
    });
    await service.adoptCurrentThumbnail({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      assetId: adopted.id,
    });

    await saveGallery(workspaceId, []);

    const alive = await prisma.contentAsset.findMany({
      where: { contentWorkspaceId: workspaceId, isDeleted: false },
      select: { id: true },
    });
    expect(alive.map((row) => row.id).sort()).toEqual([adopted.id, candidate.id].sort());
  });

  it('refuses to delete the adopted asset', async () => {
    const { workspaceId } = await seedDraftWorkspace();
    await saveGallery(workspaceId, ['https://cdn.example.com/thumb-a.png']);
    const asset = await prisma.contentAsset.findFirstOrThrow({ where: { contentWorkspaceId: workspaceId } });
    await service.adoptCurrentThumbnail({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      assetId: asset.id,
    });

    await expect(service.deleteAsset(TEST_ORGANIZATION_ID, asset.id)).rejects.toMatchObject({ status: 409 });
  });

  it('refuses to write a gallery into another organization workspace', async () => {
    const { workspaceId } = await seedDraftWorkspace();

    await expect(service.replaceWorkspaceThumbnailGallery({
      organizationId: OTHER_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      createdByUserId: null,
      thumbnailUrls: ['https://cdn.example.com/thumb-a.png'],
    })).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      prisma.contentAsset.count({ where: { organizationId: OTHER_ORGANIZATION_ID } }),
    ).resolves.toBe(0);
  });
});
