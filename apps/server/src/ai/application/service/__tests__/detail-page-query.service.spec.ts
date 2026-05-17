import { describe, expect, it, vi } from 'vitest';
import { DetailPageQueryService } from '../detail-page-query.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '44444444-4444-4444-8444-444444444444';
const ARTIFACT_ID = '55555555-5555-4555-8555-555555555555';
const REVISION_ID = '66666666-6666-4666-8666-666666666666';
const WORKSPACE_ID = '77777777-7777-4777-8777-777777777777';
const DUPLICATE_ID = '88888888-8888-4888-8888-888888888888';
const DUPLICATE_ARTIFACT_ID = '99999999-9999-4999-8999-999999999999';
const DUPLICATE_REVISION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeService(
  prisma: unknown,
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
  const contentAssets = {
    syncGenerationImageUsagesTx: vi.fn().mockResolvedValue([]),
  };
  return {
    service: new DetailPageQueryService(
      prisma as never,
      refiner as never,
      imageStorage as never,
      contentAssets as never,
    ),
    imageStorage,
    contentAssets,
  };
}

describe('DetailPageQueryService list', () => {
  it('filters generated detail pages by content workspace before product scope', async () => {
    const prisma = {
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const { service } = makeService(prisma);

    await service.list(ORG, {
      productId: 'master-1',
      contentWorkspaceId: WORKSPACE_ID,
      templateId: 'kids-playful',
    });

    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contentWorkspaceId: WORKSPACE_ID,
        }),
      }),
    );
    expect(prisma.contentGeneration.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          generationGroup: { targetMasterId: 'master-1' },
        }),
      }),
    );
  });

  it('filters generated detail pages by source candidate for unpromoted sourcing pages', async () => {
    const prisma = {
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const { service } = makeService(prisma);

    await service.list(ORG, {
      productId: 'candidate-1',
      sourceCandidateId: CANDIDATE_ID,
      templateId: 'kids-playful',
    });

    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceCandidateId: CANDIDATE_ID,
        }),
      }),
    );
  });
});

describe('DetailPageQueryService edited HTML', () => {
  it('saves edited HTML as the current detail page artifact revision using organization scope', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));
    try {
      const savedAt = new Date('2026-05-13T10:00:00.000Z');
      const prisma = {
        $transaction: vi.fn((callback) => callback(prisma)),
        contentGeneration: {
          findFirst: vi.fn().mockResolvedValue({
            id: GENERATION_ID,
            generationGroupId: 'group-1',
            contentWorkspaceId: WORKSPACE_ID,
            detailPageArtifactId: null,
            generatedTitle: '소싱 상세페이지',
            sourceCandidateId: CANDIDATE_ID,
            triggeredByUserId: 'user-1',
            generationGroup: {
              targetMasterId: null,
            },
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        detailPageArtifact: {
          create: vi.fn().mockResolvedValue({ id: ARTIFACT_ID }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        detailPageRevision: {
          create: vi.fn().mockResolvedValue({
            id: REVISION_ID,
            html: '<section><img src="https://cdn.example.com/a.jpg" /></section>',
            createdAt: savedAt,
          }),
        },
        contentWorkspace: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const { service, contentAssets } = makeService(prisma);

      await expect(
        service.saveEditedHtml(GENERATION_ID, ORG, '<section><img src="https://cdn.example.com/a.jpg" /></section>'),
      ).resolves.toEqual({
        html: '<section><img src="https://cdn.example.com/a.jpg" /></section>',
        savedAt: '2026-05-13T10:00:00.000Z',
        assetUrlMap: {},
      });

      expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith({
        where: { id: GENERATION_ID, organizationId: ORG },
        data: { detailPageArtifactId: ARTIFACT_ID },
      });
      expect(prisma.detailPageArtifact.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG,
          contentWorkspaceId: WORKSPACE_ID,
          sourceCandidateId: CANDIDATE_ID,
          targetMasterId: null,
          sourceContentGenerationId: GENERATION_ID,
          title: '소싱 상세페이지',
          status: 'draft',
          createdByUserId: 'user-1',
          metadata: { source: 'detail_page_editor_save' },
        },
        select: { id: true },
      });
      expect(prisma.detailPageRevision.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG,
          artifactId: ARTIFACT_ID,
          contentGenerationId: GENERATION_ID,
          revisionType: 'manual_edit',
          html: '<section><img src="https://cdn.example.com/a.jpg" /></section>',
          assetUrlMap: {},
          imageUrls: ['https://cdn.example.com/a.jpg'],
          createdByUserId: 'user-1',
          createdAt: savedAt,
        },
        select: {
          id: true,
          html: true,
          createdAt: true,
        },
      });
      expect(prisma.detailPageArtifact.updateMany).toHaveBeenCalledWith({
        where: { id: ARTIFACT_ID, organizationId: ORG },
        data: {
          currentRevisionId: REVISION_ID,
          status: 'draft',
        },
      });
      expect(prisma.contentWorkspace.updateMany).toHaveBeenCalledWith({
        where: { id: WORKSPACE_ID, organizationId: ORG, isDeleted: false },
        data: {
          currentDetailPageArtifactId: ARTIFACT_ID,
          currentDetailPageRevisionId: REVISION_ID,
        },
      });
      expect(contentAssets.syncGenerationImageUsagesTx).toHaveBeenCalledWith(prisma, {
        organizationId: ORG,
        generationGroupId: 'group-1',
        contentGenerationId: GENERATION_ID,
        createdByUserId: 'user-1',
        imageUrls: ['https://cdn.example.com/a.jpg'],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('promotes temporary edited images to durable content assets before saving', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T10:30:00.000Z'));
    try {
      const tmpUrl = 'https://cdn.example.com/tmp/image-edits/org-1/custom.png';
      const durableUrl = `https://cdn.example.com/content-assets/${ORG}/${GENERATION_ID}/promoted.png`;
      const prisma = {
        $transaction: vi.fn((callback) => callback(prisma)),
        contentGeneration: {
          findFirst: vi.fn().mockResolvedValue({
            id: GENERATION_ID,
            generationGroupId: 'group-1',
            contentWorkspaceId: WORKSPACE_ID,
            detailPageArtifactId: ARTIFACT_ID,
            generatedTitle: '소싱 상세페이지',
            sourceCandidateId: CANDIDATE_ID,
            triggeredByUserId: 'user-1',
            generationGroup: {
              targetMasterId: null,
            },
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        detailPageArtifact: {
          create: vi.fn().mockResolvedValue({ id: ARTIFACT_ID }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        detailPageRevision: {
          create: vi.fn().mockResolvedValue({
            id: REVISION_ID,
            html: `<section><img src="${durableUrl}" /></section>`,
            createdAt: new Date('2026-05-13T10:30:00.000Z'),
          }),
        },
        contentWorkspace: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const { service, imageStorage, contentAssets } = makeService(prisma, {
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
      expect(prisma.detailPageArtifact.create).not.toHaveBeenCalled();
      expect(prisma.detailPageRevision.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          artifactId: ARTIFACT_ID,
          html: `<section><img src="${durableUrl}" /></section>`,
          assetUrlMap: { [tmpUrl]: durableUrl },
          imageUrls: [durableUrl],
        }),
      }));
      expect(contentAssets.syncGenerationImageUsagesTx).toHaveBeenCalledWith(prisma, {
        organizationId: ORG,
        generationGroupId: 'group-1',
        contentGenerationId: GENERATION_ID,
        createdByUserId: 'user-1',
        imageUrls: [durableUrl],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('loads edited HTML from the current detail page artifact revision using organization scope', async () => {
    const savedAt = new Date('2026-05-13T11:00:00.000Z');
    const prisma = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
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
      },
    };
    const { service } = makeService(prisma);

    await expect(service.getEditedHtml(GENERATION_ID, ORG)).resolves.toEqual({
      html: '<main>saved</main>',
      savedAt: savedAt.toISOString(),
    });
    expect(prisma.contentGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: GENERATION_ID, organizationId: ORG, isDeleted: false },
      select: {
        id: true,
        editedHtml: true,
        editedHtmlSavedAt: true,
        detailPageArtifact: {
          select: {
            isDeleted: true,
            currentRevision: {
              select: {
                html: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
  });

  it('ignores stored JSON payloads in the current revision and falls back to generated output rendering', async () => {
    const prisma = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
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
      },
    };
    const { service } = makeService(prisma);

    await expect(service.getEditedHtml(GENERATION_ID, ORG)).resolves.toEqual({
      html: '<main>legacy</main>',
      savedAt: '2026-05-12T11:00:00.000Z',
    });
  });

  it('falls back to legacy ContentGeneration edited HTML when no artifact revision exists', async () => {
    const savedAt = new Date('2026-05-13T11:00:00.000Z');
    const prisma = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: GENERATION_ID,
          editedHtml: '<main>legacy</main>',
          editedHtmlSavedAt: savedAt,
          detailPageArtifact: null,
        }),
      },
    };
    const { service } = makeService(prisma);

    await expect(service.getEditedHtml(GENERATION_ID, ORG)).resolves.toEqual({
      html: '<main>legacy</main>',
      savedAt: savedAt.toISOString(),
    });
  });

  it('returns no edited HTML when only legacy stored JSON exists', async () => {
    const prisma = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: GENERATION_ID,
          editedHtml: '{"templateId":"kids-playful","result":{"section1":{"mainHeadline":"raw json"}}}',
          editedHtmlSavedAt: new Date('2026-05-12T11:00:00.000Z'),
          detailPageArtifact: null,
        }),
      },
    };
    const { service } = makeService(prisma);

    await expect(service.getEditedHtml(GENERATION_ID, ORG)).resolves.toEqual({
      html: null,
      savedAt: null,
    });
  });

  it('rejects JSON payloads when saving edited HTML', async () => {
    const prisma = {
      contentGeneration: {
        findFirst: vi.fn(),
      },
    };
    const { service } = makeService(prisma);

    await expect(
      service.saveEditedHtml(GENERATION_ID, ORG, '{"templateId":"kids-playful","result":{}}'),
    ).rejects.toThrow('렌더링 가능한 상세페이지 HTML만 저장할 수 있습니다.');
    expect(prisma.contentGeneration.findFirst).not.toHaveBeenCalled();
  });
});

describe('DetailPageQueryService detail page version management', () => {
  it('duplicates a detail page generation into an independent editable artifact and revision', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T01:00:00.000Z'));
    try {
      const sourceRevisionCreatedAt = new Date('2026-05-16T01:00:00.000Z');
      const prisma = {
        $transaction: vi.fn((callback) => callback(prisma)),
        contentGeneration: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: GENERATION_ID,
            organizationId: ORG,
            generationGroupId: 'group-1',
            contentWorkspaceId: WORKSPACE_ID,
            sourceCandidateId: CANDIDATE_ID,
            detailPageArtifactId: ARTIFACT_ID,
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
            detailPageArtifact: {
              id: ARTIFACT_ID,
              title: '원본 상세페이지',
              sourceCandidateId: CANDIDATE_ID,
              targetMasterId: null,
              currentRevision: {
                id: REVISION_ID,
                html: '<main>원본 HTML</main>',
                assetUrlMap: { a: 'b' },
                imageUrls: ['https://cdn.example.com/a.jpg'],
                createdAt: sourceRevisionCreatedAt,
              },
            },
            generationGroup: {
              targetMasterId: null,
            },
          }),
          create: vi.fn().mockResolvedValue({
            id: DUPLICATE_ID,
            generationGroup: { targetMasterId: null },
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findFirstOrThrow: vi.fn().mockResolvedValue({
            id: DUPLICATE_ID,
            generationGroup: { targetMasterId: null },
            contentWorkspaceId: WORKSPACE_ID,
            sourceCandidateId: CANDIDATE_ID,
            detailPageArtifactId: DUPLICATE_ARTIFACT_ID,
            contentType: 'detail_page',
            templateId: 'bold-vertical',
            generationInput: { rawTitle: '원본 상품' },
            generationResult: {
              templateId: 'bold-vertical',
              result: { hook: { text: '원본' } },
              imageUrls: ['https://cdn.example.com/a.jpg'],
              processedImages: {},
            },
            generatedTitle: '원본 상세페이지 복사본',
            status: 'READY',
            errorMessage: null,
            createdAt: new Date('2026-05-17T01:00:00.000Z'),
          }),
        },
        detailPageArtifact: {
          create: vi.fn().mockResolvedValue({ id: DUPLICATE_ARTIFACT_ID }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        detailPageRevision: {
          create: vi.fn().mockResolvedValue({
            id: DUPLICATE_REVISION_ID,
            html: '<main>원본 HTML</main>',
            createdAt: new Date('2026-05-17T01:00:00.000Z'),
          }),
        },
      };
      const { service } = makeService(prisma);

      await service.duplicateVersion(GENERATION_ID, ORG, 'operator-1');

      expect(prisma.contentGeneration.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG,
          contentType: 'detail_page',
          generationGroupId: 'group-1',
          contentWorkspaceId: WORKSPACE_ID,
          sourceCandidateId: CANDIDATE_ID,
          templateId: 'bold-vertical',
          generationInput: { rawTitle: '원본 상품' },
          generatedTitle: '원본 상세페이지 복사본',
          status: 'READY',
          triggeredByUserId: 'operator-1',
        }),
        include: expect.any(Object),
      });
      expect(prisma.detailPageArtifact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG,
          contentWorkspaceId: WORKSPACE_ID,
          sourceCandidateId: CANDIDATE_ID,
          targetMasterId: null,
          sourceContentGenerationId: DUPLICATE_ID,
          title: '원본 상세페이지 복사본',
          status: 'draft',
          createdByUserId: 'operator-1',
          metadata: {
            source: 'detail_page_version_duplicate',
            sourceContentGenerationId: GENERATION_ID,
            sourceDetailPageArtifactId: ARTIFACT_ID,
            sourceDetailPageRevisionId: REVISION_ID,
          },
        }),
        select: { id: true },
      });
      expect(prisma.detailPageRevision.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG,
          artifactId: DUPLICATE_ARTIFACT_ID,
          contentGenerationId: DUPLICATE_ID,
          revisionType: 'duplicate',
          html: '<main>원본 HTML</main>',
          assetUrlMap: { a: 'b' },
          imageUrls: ['https://cdn.example.com/a.jpg'],
          createdByUserId: 'operator-1',
        },
        select: { id: true },
      });
      expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith({
        where: { id: DUPLICATE_ID, organizationId: ORG },
        data: { detailPageArtifactId: DUPLICATE_ARTIFACT_ID },
      });
      expect(prisma.detailPageArtifact.updateMany).toHaveBeenCalledWith({
        where: { id: DUPLICATE_ARTIFACT_ID, organizationId: ORG },
        data: { currentRevisionId: DUPLICATE_REVISION_ID },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('renames the detail page version title without changing generated content', async () => {
    const prisma = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: GENERATION_ID,
          detailPageArtifactId: ARTIFACT_ID,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      detailPageArtifact: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { service } = makeService(prisma);

    await expect(
      service.renameVersion(GENERATION_ID, ORG, '등록용 상세 v2'),
    ).resolves.toEqual({ ok: true });

    expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith({
      where: { id: GENERATION_ID, organizationId: ORG, isDeleted: false },
      data: { generatedTitle: '등록용 상세 v2' },
    });
    expect(prisma.detailPageArtifact.updateMany).toHaveBeenCalledWith({
      where: { id: ARTIFACT_ID, organizationId: ORG, isDeleted: false },
      data: { title: '등록용 상세 v2' },
    });
  });
});
