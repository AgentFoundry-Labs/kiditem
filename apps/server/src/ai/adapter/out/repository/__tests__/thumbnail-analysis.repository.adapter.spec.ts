import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThumbnailAnalysisRepositoryAdapter } from '../thumbnail-analysis.repository.adapter';

const helperMocks = vi.hoisted(() => ({
  upsertThumbnailAnalysis: vi.fn(),
}));

vi.mock('../thumbnail-analysis.persistence', () => ({
  upsertThumbnailAnalysis: helperMocks.upsertThumbnailAnalysis,
}));

describe('ThumbnailAnalysisRepositoryAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds analysis masters with organization and Coupang listing scope', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new ThumbnailAnalysisRepositoryAdapter(prisma as never);

    await expect(repository.findAllAnalysisMasters('org-1')).resolves.toEqual([]);

    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          isDeleted: false,
          listings: {
            some: {
              organizationId: 'org-1',
              channel: 'coupang',
              isDeleted: false,
            },
          },
        },
        select: expect.objectContaining({
          id: true,
          images: expect.objectContaining({
            where: { organizationId: 'org-1', isDeleted: false },
          }),
        }),
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('builds summary inputs from organization-scoped masters and analyses', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([{ id: 'master-1' }, { id: 'master-2' }]),
      },
      thumbnailAnalysis: {
        findMany: vi.fn().mockResolvedValue([{ grade: 'A' }]),
      },
    };
    const repository = new ThumbnailAnalysisRepositoryAdapter(prisma as never);

    await expect(repository.getAnalysisSummaryRows('org-1')).resolves.toEqual({
      masterCount: 2,
      rows: [{ grade: 'A' }],
    });

    expect(prisma.thumbnailAnalysis.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', masterId: { in: ['master-1', 'master-2'] } },
      select: {
        grade: true,
        complianceGrade: true,
        qualityAnalyzedAt: true,
        complianceAnalyzedAt: true,
      },
    });
  });

  it('upserts analysis rows only through the adapter-private Prisma helper', async () => {
    const prisma = {};
    const repository = new ThumbnailAnalysisRepositoryAdapter(prisma as never);
    helperMocks.upsertThumbnailAnalysis.mockResolvedValueOnce({ id: 'analysis-1' });

    await expect(repository.upsertAnalysis({
      masterId: 'master-1',
      organizationId: 'org-1',
      imageUrl: 'https://cdn.example.com/image.jpg',
      qualityResult: {
        overallScore: 91,
        grade: 'S',
        scores: null,
        issues: [],
        suggestions: [],
        method: 'ai',
      },
    })).resolves.toEqual({ id: 'analysis-1' });

    expect(helperMocks.upsertThumbnailAnalysis).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        masterId: 'master-1',
        organizationId: 'org-1',
      }),
    );
  });
});
