import { describe, expect, it, vi } from 'vitest';
import type { DetailPageQueryRepositoryPort } from '../../port/out/repository/detail-page-query.repository.port';
import { DetailPageQueryService } from '../detail-page-query.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '44444444-4444-4444-8444-444444444444';
const WORKSPACE_ID = '77777777-7777-4777-8777-777777777777';

function makeRepository(
  overrides: Partial<Record<keyof DetailPageQueryRepositoryPort, ReturnType<typeof vi.fn>>> = {},
): DetailPageQueryRepositoryPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    existsActive: vi.fn().mockResolvedValue(false),
    markDeleted: vi.fn().mockResolvedValue(undefined),
    renameVersion: vi.fn().mockResolvedValue(false),
    findDuplicateSource: vi.fn().mockResolvedValue(null),
    duplicateVersion: vi.fn(),
    saveEditedHtmlRevision: vi.fn(),
    getEditedHtml: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as DetailPageQueryRepositoryPort;
}

function makeService(
  repository: DetailPageQueryRepositoryPort = makeRepository(),
  overrides: {
    imageStorage?: Partial<{
      extractKey: ReturnType<typeof vi.fn>;
      copy: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    }>;
  } = {},
) {
  const refiner = {
    suppressProductInfoWhenSafetyLabelExists: vi.fn((result) => result),
  };
  const imageStorage = {
    extractKey: vi.fn().mockReturnValue(null),
    copy: vi.fn(),
    delete: vi.fn(),
    ...overrides.imageStorage,
  };
  return {
    service: new DetailPageQueryService(repository, refiner as never, imageStorage as never),
    imageStorage,
    repository,
  };
}

describe('DetailPageQueryService list', () => {
  it('passes ownership filters through the repository seam and filters by template', async () => {
    const kidsRow = makeGenerationRow({ templateId: 'kids-playful' });
    const boldRow = makeGenerationRow({
      id: 'bold-row',
      templateId: 'bold-vertical',
      generationInput: {
        rawTitle: '원본 상품',
        imageUrls: ['https://cdn.example.com/a.jpg'],
        templateId: 'bold-vertical',
      },
      generationResult: {
        templateId: 'bold-vertical',
        result: {},
        imageUrls: ['https://cdn.example.com/a.jpg'],
        processedImages: {},
      },
    });
    const repository = makeRepository({
      list: vi.fn().mockResolvedValue([kidsRow, boldRow]),
    });
    const { service } = makeService(repository);

    await expect(service.list(ORG, {
      productId: 'master-1',
      contentWorkspaceId: WORKSPACE_ID,
      sourceCandidateId: CANDIDATE_ID,
      templateId: 'kids-playful',
    })).resolves.toHaveLength(1);

    expect(repository.list).toHaveBeenCalledWith({
      organizationId: ORG,
      productId: 'master-1',
      contentWorkspaceId: WORKSPACE_ID,
      sourceCandidateId: CANDIDATE_ID,
    });
  });
});

describe('DetailPageQueryService edited HTML', () => {
  it('promotes temporary edited images and saves through the versioning seam', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T10:30:00.000Z'));
    try {
      const tmpUrl = 'https://cdn.example.com/tmp/image-edits/org-1/custom.png';
      const durableUrl = `https://cdn.example.com/content-assets/${ORG}/${GENERATION_ID}/promoted.png`;
      const repository = makeRepository({
        saveEditedHtmlRevision: vi.fn().mockResolvedValue({
          html: `<section><img src="${durableUrl}" /></section>`,
          createdAt: new Date('2026-05-13T10:30:00.000Z'),
        }),
      });
      const { service, imageStorage } = makeService(repository, {
        imageStorage: {
          extractKey: vi.fn((url: string) => (
            url === tmpUrl ? 'tmp/image-edits/org-1/custom.png' : null
          )),
          copy: vi.fn().mockResolvedValue(durableUrl),
          delete: vi.fn().mockResolvedValue(undefined),
        },
      });

      await expect(
        service.saveEditedHtml(GENERATION_ID, ORG, `<section><img src="${tmpUrl}" /></section>`),
      ).resolves.toEqual({
        html: `<section><img src="${durableUrl}" /></section>`,
        savedAt: '2026-05-13T10:30:00.000Z',
        assetUrlMap: { [tmpUrl]: durableUrl },
      });

      expect(imageStorage.copy).toHaveBeenCalledWith(
        'tmp/image-edits/org-1/custom.png',
        expect.stringMatching(
          new RegExp(`^content-assets/${ORG}/${GENERATION_ID}/[a-f0-9]{32}\\.png$`),
        ),
      );
      expect(repository.saveEditedHtmlRevision).toHaveBeenCalledWith({
        organizationId: ORG,
        contentGenerationId: GENERATION_ID,
        html: `<section><img src="${durableUrl}" /></section>`,
        assetUrlMap: { [tmpUrl]: durableUrl },
        imageUrls: [durableUrl],
        savedAt: new Date('2026-05-13T10:30:00.000Z'),
      });
      expect(imageStorage.delete).toHaveBeenCalledWith('tmp/image-edits/org-1/custom.png');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects JSON payloads before crossing the repository seam', async () => {
    const repository = makeRepository();
    const { service } = makeService(repository);

    await expect(
      service.saveEditedHtml(GENERATION_ID, ORG, '{"templateId":"kids-playful","result":{}}'),
    ).rejects.toThrow('렌더링 가능한 상세페이지 HTML만 저장할 수 있습니다.');
    expect(repository.saveEditedHtmlRevision).not.toHaveBeenCalled();
  });

  it('loads edited HTML from the current artifact revision before legacy fallback', async () => {
    const savedAt = new Date('2026-05-13T11:00:00.000Z');
    const repository = makeRepository({
      getEditedHtml: vi.fn().mockResolvedValue({
        id: GENERATION_ID,
        editedHtml: '<main>legacy</main>',
        editedHtmlSavedAt: new Date('2026-05-12T11:00:00.000Z'),
        detailPageArtifact: {
          isDeleted: false,
          currentRevision: {
            html: '<main>saved</main>',
            createdAt: savedAt,
          },
        },
      }),
    });
    const { service } = makeService(repository);

    await expect(service.getEditedHtml(GENERATION_ID, ORG)).resolves.toEqual({
      html: '<main>saved</main>',
      savedAt: savedAt.toISOString(),
    });
  });

  it('ignores JSON current revisions and falls back to legacy renderable HTML', async () => {
    const repository = makeRepository({
      getEditedHtml: vi.fn().mockResolvedValue({
        id: GENERATION_ID,
        editedHtml: '<main>legacy</main>',
        editedHtmlSavedAt: new Date('2026-05-12T11:00:00.000Z'),
        detailPageArtifact: {
          isDeleted: false,
          currentRevision: {
            html: '{"templateId":"kids-playful","result":{"section1":{"mainHeadline":"raw json"}}}',
            createdAt: new Date('2026-05-13T11:00:00.000Z'),
          },
        },
      }),
    });
    const { service } = makeService(repository);

    await expect(service.getEditedHtml(GENERATION_ID, ORG)).resolves.toEqual({
      html: '<main>legacy</main>',
      savedAt: '2026-05-12T11:00:00.000Z',
    });
  });
});

describe('DetailPageQueryService detail page version management', () => {
  it('duplicates a version using repository-owned artifact and revision rules', async () => {
    const source = {
      id: GENERATION_ID,
      generationGroupId: 'group-1',
      contentWorkspaceId: WORKSPACE_ID,
      sourceCandidateId: CANDIDATE_ID,
      detailPageArtifactId: 'artifact-1',
      contentType: 'detail_page',
      templateId: 'bold-vertical',
      generationInput: { rawTitle: '원본 상품' },
      generationResult: {
        templateId: 'bold-vertical',
        result: { hook: { text: '원본' } },
        imageUrls: ['https://cdn.example.com/a.jpg'],
        processedImages: {},
      },
      generatedTitle: '원본 상세페이지',
      generatedDescription: 'desc',
      generatedCopy: 'copy',
      editedHtml: null,
      editedHtmlSavedAt: null,
      status: 'READY',
      triggeredByUserId: 'source-user',
      generationGroup: { targetMasterId: null },
      detailPageArtifact: {
        id: 'artifact-1',
        title: '원본 상세페이지',
        sourceCandidateId: CANDIDATE_ID,
        targetMasterId: null,
        currentRevision: null,
      },
    };
    const repository = makeRepository({
      findDuplicateSource: vi.fn().mockResolvedValue(source),
      duplicateVersion: vi.fn().mockResolvedValue(makeGenerationRow({
        id: 'duplicate-1',
        generatedTitle: '원본 상세페이지 복사본',
      })),
    });
    const { service } = makeService(repository);

    await service.duplicateVersion(GENERATION_ID, ORG, 'operator-1');

    expect(repository.duplicateVersion).toHaveBeenCalledWith({
      organizationId: ORG,
      triggeredByUserId: 'operator-1',
      source,
      duplicateTitle: '원본 상세페이지 복사본',
    });
  });

  it('renames a version with trimmed title', async () => {
    const repository = makeRepository({
      renameVersion: vi.fn().mockResolvedValue(true),
    });
    const { service } = makeService(repository);

    await expect(
      service.renameVersion(GENERATION_ID, ORG, '  등록용 상세 v2  '),
    ).resolves.toEqual({ ok: true });

    expect(repository.renameVersion).toHaveBeenCalledWith({
      id: GENERATION_ID,
      organizationId: ORG,
      title: '등록용 상세 v2',
    });
  });
});

function makeGenerationRow(overrides: Partial<ReturnType<typeof baseGenerationRow>> = {}) {
  return {
    ...baseGenerationRow(),
    ...overrides,
  };
}

function baseGenerationRow() {
  return {
    id: GENERATION_ID,
    sourceCandidateId: CANDIDATE_ID,
    contentWorkspaceId: WORKSPACE_ID,
    templateId: 'kids-playful',
    generationInput: {
      rawTitle: '원본 상품',
      imageUrls: ['https://cdn.example.com/a.jpg'],
      templateId: 'kids-playful',
    },
    generationResult: {
      templateId: 'kids-playful',
      result: {},
      imageUrls: ['https://cdn.example.com/a.jpg'],
      processedImages: {},
    },
    generatedTitle: '원본 상품',
    status: 'READY',
    errorMessage: null,
    createdAt: new Date('2026-05-17T01:00:00.000Z'),
    generationGroup: {
      targetMasterId: null,
    },
  };
}
