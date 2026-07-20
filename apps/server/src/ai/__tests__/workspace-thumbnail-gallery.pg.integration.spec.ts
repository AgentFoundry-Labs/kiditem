import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
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
import { groupUrlAssetKey } from '../domain/content-asset-key';

/**
 * 준비(ProductPreparation)가 없는 후보의 썸네일 미리보기 목록 저장 경로.
 *
 * 이 경로가 없을 때는 목록이 조용히 버려졌고, 쿠팡 WING 추가이미지가 늘 0/9 였다.
 * 여기서 검증하는 건 "저장한 목록이 `listCandidateAssets`(= registrationImages.thumbnail,
 * 곧 additionalImageUrls 의 소스)로 그대로 다시 읽히는가" 다.
 */
describe('workspace thumbnail gallery (PG integration)', () => {
  let prisma: PrismaClient;
  let adapter: ContentAssetLibraryRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    adapter = new ContentAssetLibraryRepositoryAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function seedCandidateWorkspace() {
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://1688.com/item/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: '과일바구니 딸깍이 키링',
        status: 'sourced',
      },
    });
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: candidate.id,
        displayName: candidate.name,
        normalizedTitle: `gallery${randomUUID().slice(0, 8)}`,
      },
    });
    return { candidateId: candidate.id, workspaceId: workspace.id };
  }

  const galleryThumbnails = (candidateId: string) =>
    adapter
      .listCandidateAssets({ organizationId: TEST_ORGANIZATION_ID, sourceCandidateId: candidateId })
      .then((rows) => rows.filter((row) => row.role === 'thumbnail').map((row) => row.url));

  it('reads the saved preview list back as role=thumbnail registration images, in order', async () => {
    const { candidateId, workspaceId } = await seedCandidateWorkspace();

    await adapter.replaceWorkspaceThumbnailGallery({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      createdByUserId: TEST_USER_ID,
      urls: [
        'https://cdn.example.com/thumb-a.png',
        'https://cdn.example.com/thumb-b.png',
        'https://cdn.example.com/thumb-c.png',
      ],
    });

    await expect(galleryThumbnails(candidateId)).resolves.toEqual([
      'https://cdn.example.com/thumb-a.png',
      'https://cdn.example.com/thumb-b.png',
      'https://cdn.example.com/thumb-c.png',
    ]);
  });

  it('replaces rather than appends, and honours a reordered list', async () => {
    const { candidateId, workspaceId } = await seedCandidateWorkspace();
    const save = (urls: string[]) =>
      adapter.replaceWorkspaceThumbnailGallery({
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspaceId,
        createdByUserId: TEST_USER_ID,
        urls,
      });

    await save([
      'https://cdn.example.com/thumb-a.png',
      'https://cdn.example.com/thumb-b.png',
    ]);
    // b 를 지우고 c 를 추가하며 순서도 뒤집는다.
    await save([
      'https://cdn.example.com/thumb-c.png',
      'https://cdn.example.com/thumb-a.png',
    ]);

    await expect(galleryThumbnails(candidateId)).resolves.toEqual([
      'https://cdn.example.com/thumb-c.png',
      'https://cdn.example.com/thumb-a.png',
    ]);
  });

  it('clears the gallery when every preview image is removed', async () => {
    const { candidateId, workspaceId } = await seedCandidateWorkspace();

    await adapter.replaceWorkspaceThumbnailGallery({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      createdByUserId: TEST_USER_ID,
      urls: ['https://cdn.example.com/thumb-a.png'],
    });
    await adapter.replaceWorkspaceThumbnailGallery({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      createdByUserId: TEST_USER_ID,
      urls: [],
    });

    await expect(galleryThumbnails(candidateId)).resolves.toEqual([]);
  });

  it('keeps an asset that the current thumbnail selection still references', async () => {
    const { candidateId, workspaceId } = await seedCandidateWorkspace();
    await adapter.replaceWorkspaceThumbnailGallery({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      createdByUserId: TEST_USER_ID,
      urls: [
        'https://cdn.example.com/thumb-a.png',
        'https://cdn.example.com/thumb-b.png',
      ],
    });
    const selected = await prisma.contentAsset.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, url: 'https://cdn.example.com/thumb-b.png' },
    });
    await prisma.contentWorkspaceThumbnailSelection.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspaceId,
        contentAssetId: selected.id,
        createdByUserId: TEST_USER_ID,
      },
    });

    // b 를 목록에서 빼도, 대표 선택이 참조 중이므로 자산 자체는 살아 있어야 한다.
    await adapter.replaceWorkspaceThumbnailGallery({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      createdByUserId: TEST_USER_ID,
      urls: ['https://cdn.example.com/thumb-a.png'],
    });

    await expect(
      prisma.contentAsset.findUniqueOrThrow({ where: { id: selected.id } }),
    ).resolves.toMatchObject({ isDeleted: false });
    expect(await galleryThumbnails(candidateId)).toContain('https://cdn.example.com/thumb-b.png');
  });

  it('tags a scrape original as a gallery thumbnail instead of reusing its role=source asset', async () => {
    const { candidateId, workspaceId } = await seedCandidateWorkspace();
    const sourceUrl = 'https://cbu01.alicdn.com/original.jpg';
    const inputGroup = await prisma.contentGenerationGroup.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspaceId,
        groupType: 'detail_page_inputs',
      },
    });
    await prisma.contentAsset.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        originGenerationGroupId: inputGroup.id,
        assetKey: groupUrlAssetKey(inputGroup.id, sourceUrl),
        url: sourceUrl,
        assetType: 'image',
        role: 'source',
      },
    });

    await adapter.replaceWorkspaceThumbnailGallery({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      createdByUserId: TEST_USER_ID,
      urls: [sourceUrl],
    });

    // 기존 role=source 행을 재사용했다면 갤러리는 비어 보인다 = 조용한 저장 실패.
    await expect(galleryThumbnails(candidateId)).resolves.toEqual([sourceUrl]);
    const roles = await prisma.contentAsset.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, url: sourceUrl, isDeleted: false },
      select: { role: true },
    });
    expect(roles.map((row) => row.role).sort()).toEqual(['source', 'thumbnail']);
  });

  it('refuses to write a gallery into another organization workspace', async () => {
    const { workspaceId } = await seedCandidateWorkspace();

    await expect(adapter.replaceWorkspaceThumbnailGallery({
      organizationId: OTHER_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      createdByUserId: null,
      urls: ['https://cdn.example.com/thumb-a.png'],
    })).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      prisma.contentAsset.count({ where: { organizationId: OTHER_ORGANIZATION_ID } }),
    ).resolves.toBe(0);
  });
});
