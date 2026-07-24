import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ContentAssetLibraryRepositoryPort } from '../../port/out/repository/content-asset-library.repository.port';
import { ContentAssetService } from '../content-asset.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '99999999-9999-9999-9999-999999999999';

function repository(
  overrides: Partial<ContentAssetLibraryRepositoryPort> = {},
): ContentAssetLibraryRepositoryPort {
  return {
    recordDetailPageInputAssets: vi.fn(),
    recordDetailPageGeneratedAssets: vi.fn(),
    syncGenerationImageUsages: vi.fn(),
    syncGenerationImageUsagesInScope: vi.fn(),
    listAssets: vi.fn(),
    listCandidateAssets: vi.fn().mockResolvedValue([]),
    findCandidateCurrentThumbnail: vi.fn().mockResolvedValue(null),
    replaceWorkspaceThumbnailGallery: vi.fn(async (input: { urls: string[] }) => ({
      urls: input.urls,
    })),
    deleteAsset: vi.fn(),
    ...overrides,
  } as ContentAssetLibraryRepositoryPort;
}

describe('ContentAssetService.listRegistrationImages', () => {
  const CANDIDATE = '44444444-4444-4444-8444-444444444444';

  it('splits assets by role and drops roles that must never reach a registration form', async () => {
    const repo = repository({
      listCandidateAssets: vi.fn().mockResolvedValue([
        { role: 'primary', url: 'http://localhost:9000/a/primary.png', sortOrder: 0 },
        { role: 'thumbnail', url: 'http://localhost:9000/a/thumb-1.png', sortOrder: 1 },
        { role: 'thumbnail', url: 'http://localhost:9000/a/thumb-2.png', sortOrder: 2 },
        { role: 'detail', url: 'http://localhost:9000/a/detail.png', sortOrder: 3 },
        // 원본 스크랩본 — 쿠팡 1,000x1,000 규격이 아니라 등록에 쓰면 안 된다.
        { role: 'source', url: 'https://cbu01.alicdn.com/original.jpg', sortOrder: 4 },
        // 옵션별 이미지는 아직 어떤 등록 폼에도 배선돼 있지 않다.
        { role: 'option', url: 'https://image1.coupangcdn.com/option.jpg', sortOrder: 5 },
        { role: null, url: 'https://image1.coupangcdn.com/untagged.jpg', sortOrder: 6 },
      ]),
    });
    const service = new ContentAssetService(repo);

    const result = await service.listRegistrationImages({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    });

    expect(result).toEqual({
      primary: ['http://localhost:9000/a/primary.png'],
      thumbnail: ['http://localhost:9000/a/thumb-1.png', 'http://localhost:9000/a/thumb-2.png'],
      detail: ['http://localhost:9000/a/detail.png'],
    });
    const flattened = [...result.primary, ...result.thumbnail, ...result.detail];
    expect(flattened).not.toContain('https://cbu01.alicdn.com/original.jpg');
    expect(flattened).not.toContain('https://image1.coupangcdn.com/option.jpg');
  });

  it('drops blank urls and de-duplicates within a role', async () => {
    const repo = repository({
      listCandidateAssets: vi.fn().mockResolvedValue([
        { role: 'primary', url: '  ', sortOrder: 0 },
        { role: 'thumbnail', url: 'http://localhost:9000/a/dup.png', sortOrder: 1 },
        { role: 'thumbnail', url: 'http://localhost:9000/a/dup.png', sortOrder: 2 },
      ]),
    });
    const service = new ContentAssetService(repo);

    await expect(
      service.listRegistrationImages({ organizationId: ORG, sourceCandidateId: CANDIDATE }),
    ).resolves.toEqual({
      primary: [],
      thumbnail: ['http://localhost:9000/a/dup.png'],
      detail: [],
    });
  });

  it('returns empty buckets when the candidate owns no content assets', async () => {
    const service = new ContentAssetService(repository());

    await expect(
      service.listRegistrationImages({ organizationId: ORG, sourceCandidateId: CANDIDATE }),
    ).resolves.toEqual({ primary: [], thumbnail: [], detail: [] });
  });

  it('unions the current workspace thumbnail so a reused pick reaches registration thumbnails', async () => {
    // 중복 상품끼리 재사용된 썸네일은 다른 워크스페이스 그룹 소유라 자산 스캔이
    // 놓친다. 현재 워크스페이스 선택은 이를 잡으므로 갤러리 뒤에 합쳐진다.
    const repo = repository({
      listCandidateAssets: vi.fn().mockResolvedValue([
        { role: 'thumbnail', url: 'http://localhost:9000/a/gallery.png', sortOrder: 0 },
      ]),
      findCandidateCurrentThumbnail: vi.fn().mockResolvedValue({
        url: 'http://localhost:9000/reused/from-other-workspace.png',
        sourceThumbnailGenerationId: null,
        sourceThumbnailCandidateId: null,
      }),
    });
    const service = new ContentAssetService(repo);

    await expect(
      service.listRegistrationImages({ organizationId: ORG, sourceCandidateId: CANDIDATE }),
    ).resolves.toEqual({
      primary: [],
      thumbnail: [
        'http://localhost:9000/a/gallery.png',
        'http://localhost:9000/reused/from-other-workspace.png',
      ],
      detail: [],
    });
  });

  it('returns registration images and the exact same current selection from one media read', async () => {
    const currentThumbnail = {
      url: 'http://localhost:9000/reused/current.png',
      sourceThumbnailGenerationId: 'generation-1',
      sourceThumbnailCandidateId: 'candidate-thumb-1',
    };
    const repo = repository({
      listCandidateAssets: vi.fn().mockResolvedValue([
        { role: 'thumbnail', url: 'http://localhost:9000/a/gallery.png', sortOrder: 0 },
      ]),
      findCandidateCurrentThumbnail: vi.fn().mockResolvedValue(currentThumbnail),
    });
    const service = new ContentAssetService(repo);

    await expect(service.loadRegistrationMedia({
      organizationId: ORG,
      sourceCandidateId: CANDIDATE,
    })).resolves.toEqual({
      registrationImages: {
        primary: [],
        thumbnail: [
          'http://localhost:9000/a/gallery.png',
          'http://localhost:9000/reused/current.png',
        ],
        detail: [],
      },
      currentThumbnail,
    });
    expect(repo.findCandidateCurrentThumbnail).toHaveBeenCalledTimes(1);
  });
});

describe('ContentAssetService.replaceWorkspaceThumbnailGallery', () => {
  const WORKSPACE = '55555555-5555-4555-8555-555555555555';
  const CANDIDATE = '44444444-4444-4444-8444-444444444444';

  it('persists the ordered preview list so it reads back as registration thumbnails', async () => {
    // 준비(ProductPreparation)가 없는 후보에게는 이 경로가 목록의 유일한 저장처다.
    // 저장 결과는 `registrationImages.thumbnail` 로 다시 읽혀 쿠팡 WING
    // `additionalImageUrls` 를 채운다.
    const stored: string[] = [];
    const repo = repository({
      replaceWorkspaceThumbnailGallery: vi.fn(async (input: { urls: string[] }) => {
        stored.splice(0, stored.length, ...input.urls);
        return { urls: input.urls };
      }),
      listCandidateAssets: vi.fn(async () =>
        stored.map((url, index) => ({ role: 'thumbnail', url, sortOrder: index })),
      ),
    });
    const service = new ContentAssetService(repo);

    await service.replaceWorkspaceThumbnailGallery({
      organizationId: ORG,
      contentWorkspaceId: WORKSPACE,
      createdByUserId: USER_ID,
      thumbnailUrls: [
        'https://cdn.example.com/thumb-1.png',
        'https://cdn.example.com/thumb-2.png',
      ],
    });

    expect(repo.replaceWorkspaceThumbnailGallery).toHaveBeenCalledWith({
      organizationId: ORG,
      contentWorkspaceId: WORKSPACE,
      createdByUserId: USER_ID,
      urls: [
        'https://cdn.example.com/thumb-1.png',
        'https://cdn.example.com/thumb-2.png',
      ],
    });
    await expect(
      service.listRegistrationImages({ organizationId: ORG, sourceCandidateId: CANDIDATE }),
    ).resolves.toEqual({
      primary: [],
      thumbnail: [
        'https://cdn.example.com/thumb-1.png',
        'https://cdn.example.com/thumb-2.png',
      ],
      detail: [],
    });
  });

  it('trims, drops blanks, and de-duplicates while keeping first-seen order', async () => {
    const repo = repository();
    const service = new ContentAssetService(repo);

    await service.replaceWorkspaceThumbnailGallery({
      organizationId: ORG,
      contentWorkspaceId: WORKSPACE,
      createdByUserId: null,
      thumbnailUrls: [
        '  https://cdn.example.com/b.png  ',
        '',
        'https://cdn.example.com/a.png',
        'https://cdn.example.com/b.png',
      ],
    });

    expect(repo.replaceWorkspaceThumbnailGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: ['https://cdn.example.com/b.png', 'https://cdn.example.com/a.png'],
      }),
    );
  });

  it('clears the gallery when the operator removes every preview image', async () => {
    const repo = repository();
    const service = new ContentAssetService(repo);

    await expect(service.replaceWorkspaceThumbnailGallery({
      organizationId: ORG,
      contentWorkspaceId: WORKSPACE,
      createdByUserId: null,
      thumbnailUrls: [],
    })).resolves.toEqual({ thumbnailUrls: [] });
    expect(repo.replaceWorkspaceThumbnailGallery).toHaveBeenCalledWith(
      expect.objectContaining({ urls: [] }),
    );
  });

  it('rejects a gallery larger than the supported cap', async () => {
    const repo = repository();
    const service = new ContentAssetService(repo);

    await expect(service.replaceWorkspaceThumbnailGallery({
      organizationId: ORG,
      contentWorkspaceId: WORKSPACE,
      createdByUserId: null,
      thumbnailUrls: Array.from({ length: 21 }, (_, i) => `https://cdn.example.com/${i}.png`),
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.replaceWorkspaceThumbnailGallery).not.toHaveBeenCalled();
  });
});

describe('ContentAssetService', () => {
  it('blocks deletion while an active generation usage or thumbnail selection references the asset', async () => {
    const repo = repository({
      deleteAsset: vi.fn().mockResolvedValue({ status: 'in_use' }),
    });
    const service = new ContentAssetService(repo);

    await expect(service.deleteAsset(ORG, 'asset-1')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.deleteAsset).toHaveBeenCalledWith({
      organizationId: ORG,
      contentAssetId: 'asset-1',
      deletedAt: expect.any(Date),
    });
  });

  it('delegates detail-page input asset recording to the asset library repository', async () => {
    const assets = [{
      id: 'asset-1',
      assetKey: 'group-url:group-1:hash',
      url: 'https://example.com/a.jpg',
      role: 'source',
      label: null,
      sortOrder: 0,
    }];
    const repo = repository({
      recordDetailPageInputAssets: vi.fn().mockResolvedValue(assets),
    });
    const service = new ContentAssetService(repo);

    await expect(service.recordDetailPageInputAssets({
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg'],
    })).resolves.toEqual(assets);

    expect(repo.recordDetailPageInputAssets).toHaveBeenCalledWith({
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg'],
    });
  });

  it('keeps existing transaction callers on an abstract asset write scope', async () => {
    const scope = {
      contentAsset: {
        createMany: vi.fn(),
        findMany: vi.fn(),
      },
      contentGenerationAssetUsage: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
    };
    const repo = repository({
      syncGenerationImageUsagesInScope: vi.fn().mockResolvedValue([]),
    });
    const service = new ContentAssetService(repo);

    await service.syncGenerationImageUsagesTx(scope, {
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      contentGenerationId: GENERATION_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg'],
    });

    expect(repo.syncGenerationImageUsagesInScope).toHaveBeenCalledWith(scope, {
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      contentGenerationId: GENERATION_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg'],
    });
  });

  it('lists group assets through the content workspace relation', async () => {
    const createdAt = new Date('2026-05-13T09:00:00.000Z');
    const updatedAt = new Date('2026-05-13T09:30:00.000Z');
    const repo = repository({
      listAssets: vi.fn().mockResolvedValue({
        total: 1,
        rows: [
          {
            id: 'asset-1',
            originGenerationGroupId: GROUP_ID,
            url: 'https://cdn.example.com/asset.png',
            assetType: 'image',
            role: 'used',
            label: 'hero',
            sortOrder: 0,
            metadata: { width: 1200 },
            createdAt,
            updatedAt,
            originGenerationGroup: {
              contentWorkspace: {
                id: 'workspace-1',
                displayName: '큐브 퍼즐',
              },
            },
          },
        ],
      }),
    });
    const service = new ContentAssetService(repo);

    await expect(
      service.listAssets(ORG, { page: 2, limit: 10, contentWorkspaceId: 'workspace-1' }),
    ).resolves.toEqual({
      items: [
        {
          id: 'asset-1',
          contentWorkspaceId: 'workspace-1',
          originGenerationGroupId: GROUP_ID,
          url: 'https://cdn.example.com/asset.png',
          assetType: 'image',
          role: 'used',
          label: 'hero',
          sortOrder: 0,
          metadata: { width: 1200 },
          workspace: {
            id: 'workspace-1',
            displayName: '큐브 퍼즐',
          },
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        },
      ],
      total: 1,
      page: 2,
      limit: 10,
    });

    expect(repo.listAssets).toHaveBeenCalledWith({
      organizationId: ORG,
      page: 2,
      limit: 10,
      contentWorkspaceId: 'workspace-1',
      generationId: null,
    });
  });
});
