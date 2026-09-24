import { describe, expect, it, vi } from 'vitest';
import type { ContentAssetLibraryRepositoryPort } from '../../port/out/repository/content-asset-library.repository.port';
import { ContentAssetService } from '../content-asset.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER_ID = '99999999-9999-9999-9999-999999999999';

function repository(
  overrides: Partial<ContentAssetLibraryRepositoryPort> = {},
): ContentAssetLibraryRepositoryPort {
  return {
    listAssets: vi.fn(),
    listSalesProductAssets: vi.fn().mockResolvedValue([]),
    findSalesProductCurrentThumbnail: vi.fn().mockResolvedValue(null),
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
      listSalesProductAssets: vi.fn().mockResolvedValue([
        { role: 'primary', url: 'http://localhost:9000/a/primary.png', sortOrder: 0 },
        { role: 'thumbnail', url: 'http://localhost:9000/a/thumb-1.png', sortOrder: 1 },
        { role: 'thumbnail', url: 'http://localhost:9000/a/thumb-2.png', sortOrder: 2 },
        { role: 'detail', url: 'http://localhost:9000/a/detail.png', sortOrder: 3 },
        // 상세 생성 입력(원본 스크랩본) — 쿠팡 1,000x1,000 규격이 아니라 등록에 쓰면 안 된다.
        { role: 'detail_source', url: 'https://cbu01.alicdn.com/original.jpg', sortOrder: 4 },
        // 옵션별 이미지는 아직 어떤 등록 폼에도 배선돼 있지 않다.
        { role: 'option', url: 'https://image1.coupangcdn.com/option.jpg', sortOrder: 5 },
        { role: null, url: 'https://image1.coupangcdn.com/untagged.jpg', sortOrder: 6 },
      ]),
    });
    const service = new ContentAssetService(repo);

    const result = await service.listRegistrationImages({
      organizationId: ORG,
      salesProductId: CANDIDATE,
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
      listSalesProductAssets: vi.fn().mockResolvedValue([
        { role: 'primary', url: '  ', sortOrder: 0 },
        { role: 'thumbnail', url: 'http://localhost:9000/a/dup.png', sortOrder: 1 },
        { role: 'thumbnail', url: 'http://localhost:9000/a/dup.png', sortOrder: 2 },
      ]),
    });
    const service = new ContentAssetService(repo);

    await expect(
      service.listRegistrationImages({ organizationId: ORG, salesProductId: CANDIDATE }),
    ).resolves.toEqual({
      primary: [],
      thumbnail: ['http://localhost:9000/a/dup.png'],
      detail: [],
    });
  });

  it('returns empty buckets when the candidate owns no content assets', async () => {
    const service = new ContentAssetService(repository());

    await expect(
      service.listRegistrationImages({ organizationId: ORG, salesProductId: CANDIDATE }),
    ).resolves.toEqual({ primary: [], thumbnail: [], detail: [] });
  });

  it('unions the adopted representative image so an adopted AI candidate reaches registration thumbnails', async () => {
    // 채택 전 AI 후보는 자산 스캔에서 빠진다. 채택된 대표이미지는 갤러리 뒤에 합쳐진다.
    const repo = repository({
      listSalesProductAssets: vi.fn().mockResolvedValue([
        { role: 'thumbnail', url: 'http://localhost:9000/a/gallery.png', sortOrder: 0 },
      ]),
      findSalesProductCurrentThumbnail: vi.fn().mockResolvedValue({
        assetId: 'asset-ai-1',
        url: 'http://localhost:9000/ai/adopted.png',
        source: 'ai',
        thumbnailGenerationId: 'generation-1',
      }),
    });
    const service = new ContentAssetService(repo);

    await expect(
      service.listRegistrationImages({ organizationId: ORG, salesProductId: CANDIDATE }),
    ).resolves.toEqual({
      primary: [],
      thumbnail: [
        'http://localhost:9000/a/gallery.png',
        'http://localhost:9000/ai/adopted.png',
      ],
      detail: [],
    });
  });

  it('returns registration images and the exact same current selection from one media read', async () => {
    const currentThumbnail = {
      assetId: 'asset-upload-1',
      url: 'http://localhost:9000/reused/current.png',
      source: 'upload' as const,
      thumbnailGenerationId: null,
    };
    const repo = repository({
      listSalesProductAssets: vi.fn().mockResolvedValue([
        { role: 'thumbnail', url: 'http://localhost:9000/a/gallery.png', sortOrder: 0 },
      ]),
      findSalesProductCurrentThumbnail: vi.fn().mockResolvedValue(currentThumbnail),
    });
    const service = new ContentAssetService(repo);

    await expect(service.loadRegistrationMedia({
      organizationId: ORG,
      salesProductId: CANDIDATE,
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
    expect(repo.findSalesProductCurrentThumbnail).toHaveBeenCalledTimes(1);
  });
});

describe('ContentAssetService.replaceWorkspaceThumbnailGallery', () => {
  const WORKSPACE = '55555555-5555-4555-8555-555555555555';
  const CANDIDATE = '44444444-4444-4444-8444-444444444444';

  it('persists the ordered preview list so it reads back as registration thumbnails', async () => {
    // 준비(RegistrationTarget)가 없는 후보에게는 이 경로가 목록의 유일한 저장처다.
    // 저장 결과는 `registrationImages.thumbnail` 로 다시 읽혀 쿠팡 WING
    // `additionalImageUrls` 를 채운다.
    const stored: string[] = [];
    const repo = repository({
      replaceWorkspaceThumbnailGallery: vi.fn(async (input: { urls: string[] }) => {
        stored.splice(0, stored.length, ...input.urls);
        return { urls: input.urls };
      }),
      listSalesProductAssets: vi.fn(async () =>
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
      service.listRegistrationImages({ organizationId: ORG, salesProductId: CANDIDATE }),
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
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'THUMBNAIL_GALLERY_TOO_MANY', max: 20 } });
    expect(repo.replaceWorkspaceThumbnailGallery).not.toHaveBeenCalled();
  });
});
