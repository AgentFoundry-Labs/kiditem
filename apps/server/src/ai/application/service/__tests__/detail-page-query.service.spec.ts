import { describe, expect, it, vi } from 'vitest';
import { DetailPageQueryService } from '../detail-page-query.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '44444444-4444-4444-8444-444444444444';
const ARTIFACT_ID = '55555555-5555-4555-8555-555555555555';
const REVISION_ID = '66666666-6666-4666-8666-666666666666';
const WORKSPACE_ID = '77777777-7777-4777-8777-777777777777';

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
            registrationWorkspaceId: WORKSPACE_ID,
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
        registrationWorkspace: {
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
          registrationWorkspaceId: WORKSPACE_ID,
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
      expect(prisma.registrationWorkspace.updateMany).toHaveBeenCalledWith({
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
            registrationWorkspaceId: WORKSPACE_ID,
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
        registrationWorkspace: {
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
});
