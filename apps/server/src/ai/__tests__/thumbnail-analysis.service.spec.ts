import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { ComplianceScores, RecomposeVariantClassification, ThumbnailScores } from '@kiditem/shared/ai';
import { ThumbnailAnalysisService } from '../application/service/thumbnail-analysis.service';

type MasterRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  category: string | null;
  images: Array<{ url: string; role: string; sortOrder: number; isPrimary: boolean }>;
  createdAt: Date;
};

const ORGANIZATION_ID = 'organization-1';
const OTHER_COMPANY = 'organization-2';
const PRODUCT_ID = '7d000000-0000-4000-8000-000000000001';

function makeMaster(overrides: Partial<MasterRow> = {}): MasterRow {
  return {
    id: PRODUCT_ID,
    name: 'Test product',
    imageUrl: 'https://example.com/master.jpg',
    thumbnailUrl: null,
    category: 'toys',
    images: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeAnalysisRow(over: Record<string, unknown> = {}) {
  return {
    id: 'analysis-1',
    masterId: PRODUCT_ID,
    organizationId: ORGANIZATION_ID,
    imageUrl: 'https://example.com/master.jpg',
    overallScore: 80,
    grade: 'A',
    scores: null,
    issues: [],
    suggestions: [],
    method: 'ai',
    complianceGrade: null,
    complianceScores: null,
    imageSpec: null,
    recompose: null,
    qualityAnalyzedAt: new Date(),
    complianceAnalyzedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    master: {
      id: PRODUCT_ID,
      name: 'Test product',
      imageUrl: 'https://example.com/master.jpg',
      thumbnailUrl: null,
      images: [],
    },
    ...over,
  };
}

function makePrismaMock(master: MasterRow | null) {
  return {
    masterProduct: {
      findFirst: vi.fn(async (args: { where: { organizationId?: string } }) => {
        if (master && args.where.organizationId === ORGANIZATION_ID) return master;
        return null;
      }),
    },
    thumbnailAnalysis: {
      upsert: vi.fn(async (args: { update: Record<string, unknown> }) =>
        makeAnalysisRow(args.update),
      ),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
    },
  };
}

function makePrismaListMock(masters: MasterRow[], analyses: Array<ReturnType<typeof makeAnalysisRow>>) {
  return {
    masterProduct: {
      findMany: vi.fn(async () => masters),
    },
    thumbnailAnalysis: {
      findMany: vi.fn(async () => analyses),
    },
  };
}

function makeVisionMock(opts: {
  quality?: { overallScore: number; grade: 'S' | 'A' | 'B' | 'C' | 'F' };
  compliance?: { complianceGrade: 'PASS' | 'WARN' | 'FAIL' };
}) {
  return {
    analyzeQuality: vi.fn(async () => {
      const map = new Map<string, unknown>();
      if (opts.quality) {
        map.set(PRODUCT_ID, {
          overallScore: opts.quality.overallScore,
          grade: opts.quality.grade,
          scores: { heroShot: 80, composition: 80, branding: 80, mobile: 80, differentiation: 80 } satisfies ThumbnailScores,
          issues: [],
          suggestions: [],
          method: 'ai',
        });
      }
      return map;
    }),
    checkCompliance: vi.fn(async () => {
      const map = new Map<string, unknown>();
      if (opts.compliance) {
        map.set(PRODUCT_ID, {
          complianceGrade: opts.compliance.complianceGrade,
          complianceScores: {
            violations: {
              background_not_white: false,
              has_text: false,
              has_extra_logo: false,
              has_discount_text: false,
              has_freebie_display: false,
              has_overlay_effects: false,
              has_gradient_background: false,
              has_background_objects: false,
              product_fill_low: false,
              not_center_aligned: false,
              product_cropped: false,
              excessive_editing: false,
            },
            confidence: {},
            quality: { estimatedFillPercent: 90, centerOffsetPercent: 1, aspectRatioValid: true },
            violationCount: 0,
          } satisfies ComplianceScores,
        });
      }
      return map;
    }),
    checkImageSpec: vi.fn(async () => ({
      width: 2000,
      height: 2000,
      aspectRatio: 1,
      fileSizeKB: 200,
      format: 'image/jpeg',
      issues: [],
    })),
  };
}

function makeRecomposeMock() {
  return {
    classifyByImage: vi.fn(async (): Promise<RecomposeVariantClassification> => ({
      kind: 'single-product',
      requiresChoice: false,
      options: [],
      recommended: null,
      reasoning: null,
    })),
    classify: vi.fn(),
  };
}

describe('ThumbnailAnalysisService AI flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses MasterProductImage fallback when imageUrl is empty', async () => {
    const master = makeMaster({
      imageUrl: null,
      images: [
        { url: 'https://cdn/primary.jpg', role: 'product', sortOrder: 0, isPrimary: true },
      ],
    });
    const prisma = makePrismaMock(master);
    const vision = makeVisionMock({ quality: { overallScore: 70, grade: 'B' } });
    const recompose = makeRecomposeMock();
    const service = new ThumbnailAnalysisService(
      prisma as never,
      vision as never,
      recompose as never,
    );
    await service.analyzeProduct(PRODUCT_ID, ORGANIZATION_ID, 'quality');
    expect(vision.analyzeQuality).toHaveBeenCalledTimes(1);
    expect(vision.analyzeQuality.mock.calls[0][0][0].imageUrl).toBe(
      'https://cdn/primary.jpg',
    );
  });

  it('quality scope updates quality fields and recompose classification', async () => {
    const prisma = makePrismaMock(makeMaster());
    const vision = makeVisionMock({ quality: { overallScore: 85, grade: 'A' } });
    const recompose = makeRecomposeMock();
    const service = new ThumbnailAnalysisService(
      prisma as never,
      vision as never,
      recompose as never,
    );
    await service.analyzeProduct(PRODUCT_ID, ORGANIZATION_ID, 'quality');
    expect(vision.checkCompliance).not.toHaveBeenCalled();
    expect(recompose.classifyByImage).toHaveBeenCalledTimes(1);
    expect(recompose.classifyByImage).toHaveBeenCalledWith('https://example.com/master.jpg', {
      productName: 'Test product',
      category: 'toys',
    });
    const upsertArgs = prisma.thumbnailAnalysis.upsert.mock.calls[0][0];
    expect(upsertArgs.update.complianceGrade).toBeUndefined();
    expect(upsertArgs.update.complianceScores).toBeUndefined();
    expect(upsertArgs.update.qualityAnalyzedAt).toBeInstanceOf(Date);
    expect(upsertArgs.update.recompose).toMatchObject({ kind: 'single-product' });
  });

  it('compliance scope updates only compliance-related fields', async () => {
    const prisma = makePrismaMock(makeMaster());
    const vision = makeVisionMock({ compliance: { complianceGrade: 'PASS' } });
    const recompose = makeRecomposeMock();
    const service = new ThumbnailAnalysisService(
      prisma as never,
      vision as never,
      recompose as never,
    );
    await service.analyzeProduct(PRODUCT_ID, ORGANIZATION_ID, 'compliance');
    expect(vision.analyzeQuality).not.toHaveBeenCalled();
    expect(recompose.classifyByImage).not.toHaveBeenCalled();
    const upsertArgs = prisma.thumbnailAnalysis.upsert.mock.calls[0][0];
    expect(upsertArgs.update.qualityAnalyzedAt).toBeUndefined();
    expect(upsertArgs.update.grade).toBeUndefined();
    expect(upsertArgs.update.complianceAnalyzedAt).toBeInstanceOf(Date);
    expect(upsertArgs.update.recompose).toBeUndefined();
  });

  it('throws NotFoundException for another organization product id', async () => {
    const prisma = makePrismaMock(null);
    const vision = makeVisionMock({});
    const recompose = makeRecomposeMock();
    const service = new ThumbnailAnalysisService(
      prisma as never,
      vision as never,
      recompose as never,
    );
    await expect(
      service.analyzeProduct(PRODUCT_ID, OTHER_COMPANY, 'all'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not upsert a placeholder row when quality analysis returns no result', async () => {
    const prisma = makePrismaMock(makeMaster());
    const vision = makeVisionMock({});
    const recompose = makeRecomposeMock();
    const service = new ThumbnailAnalysisService(
      prisma as never,
      vision as never,
      recompose as never,
    );

    await expect(service.analyzeProduct(PRODUCT_ID, ORGANIZATION_ID, 'quality')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.thumbnailAnalysis.upsert).not.toHaveBeenCalled();
  });

  it('does not upsert a placeholder row when compliance analysis returns no result', async () => {
    const prisma = makePrismaMock(makeMaster());
    const vision = makeVisionMock({});
    const recompose = makeRecomposeMock();
    const service = new ThumbnailAnalysisService(
      prisma as never,
      vision as never,
      recompose as never,
    );

    await expect(
      service.analyzeProduct(PRODUCT_ID, ORGANIZATION_ID, 'compliance'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.thumbnailAnalysis.upsert).not.toHaveBeenCalled();
  });

  it('does not upsert when single-product compliance image fetch/spec probing fails', async () => {
    const prisma = makePrismaMock(makeMaster());
    const vision = makeVisionMock({ compliance: { complianceGrade: 'PASS' } });
    vision.checkImageSpec.mockRejectedValueOnce(new Error('fetch failed'));
    const recompose = makeRecomposeMock();
    const service = new ThumbnailAnalysisService(
      prisma as never,
      vision as never,
      recompose as never,
    );

    await expect(service.analyzeProduct(PRODUCT_ID, ORGANIZATION_ID, 'compliance')).rejects.toThrow(
      'fetch failed',
    );
    expect(prisma.thumbnailAnalysis.upsert).not.toHaveBeenCalled();
  });

  it('keeps spec-only pre-inspect rows out of analyzed results and grade counts', async () => {
    const master = makeMaster();
    const specOnly = makeAnalysisRow({
      grade: 'F',
      overallScore: 0,
      method: 'ai',
      qualityAnalyzedAt: null,
      complianceAnalyzedAt: null,
      imageSpec: {
        width: 800,
        height: 800,
        aspectRatio: 1,
        fileSizeKB: 120,
        format: 'image/jpeg',
        issues: [{ type: 'low_resolution', severity: 'fail', message: 'low' }],
      },
    });
    const prisma = makePrismaListMock([master], [specOnly]);
    const service = new ThumbnailAnalysisService(
      prisma as never,
      makeVisionMock({}) as never,
      makeRecomposeMock() as never,
    );

    const result = await service.findAllWithAnalysis(ORGANIZATION_ID);

    expect(result.analyzed).toBe(0);
    expect(result.gradeDistribution.F).toBe(0);
    expect(result.allResults).toHaveLength(0);
    expect(result.unclassified).toHaveLength(1);
    expect(result.unclassified[0].qualityAnalyzed).toBe(false);
    expect(result.unclassified[0].imageSpec?.issues[0]?.type).toBe('low_resolution');
  });

  it('scopes thumbnail analysis list to masters with Coupang listings', async () => {
    const prisma = makePrismaListMock([makeMaster()], []);
    const service = new ThumbnailAnalysisService(
      prisma as never,
      makeVisionMock({}) as never,
      makeRecomposeMock() as never,
    );

    await service.findAllWithAnalysis(ORGANIZATION_ID);

    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          isDeleted: false,
          pipelineStep: null,
          listings: {
            some: {
              organizationId: ORGANIZATION_ID,
              channel: 'coupang',
              isDeleted: false,
            },
          },
        }),
      }),
    );
  });

  it('scopes thumbnail analysis summary to masters with Coupang listings', async () => {
    const prisma = makePrismaListMock([], []);
    const service = new ThumbnailAnalysisService(
      prisma as never,
      makeVisionMock({}) as never,
      makeRecomposeMock() as never,
    );

    await service.getSummary(ORGANIZATION_ID);

    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          isDeleted: false,
          pipelineStep: null,
          listings: {
            some: {
              organizationId: ORGANIZATION_ID,
              channel: 'coupang',
              isDeleted: false,
            },
          },
        }),
      }),
    );
  });

  it('does not render analysis rows whose master is not owned by the caller organization', async () => {
    const crossTenantAnalysis = makeAnalysisRow({
      master: {
        id: PRODUCT_ID,
        name: 'Cross-tenant master',
        imageUrl: 'https://example.com/other.jpg',
        thumbnailUrl: null,
        images: [],
      },
    });
    const prisma = makePrismaListMock([], [crossTenantAnalysis]);
    const service = new ThumbnailAnalysisService(
      prisma as never,
      makeVisionMock({}) as never,
      makeRecomposeMock() as never,
    );

    const result = await service.findAllWithAnalysis(ORGANIZATION_ID);

    expect(result.total).toBe(0);
    expect(result.allResults).toHaveLength(0);
    expect(result.unclassified).toHaveLength(0);
  });
});
