import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ComplianceScores,
  RecomposeVariantClassification,
  ThumbnailScores,
} from '@kiditem/shared/ai';
import { ThumbnailAnalysisAnalyzerService } from '../thumbnail-analysis-analyzer.service';
import { ThumbnailAnalysisBatchService } from '../thumbnail-analysis-batch.service';

const ORGANIZATION_ID = 'organization-1';
const P1 = '7d000000-0000-4000-8000-000000000101';
const P2 = '7d000000-0000-4000-8000-000000000102';

function masterRow(id: string) {
  return {
    id,
    name: `Product ${id}`,
    imageUrl: `https://example.com/${id}.jpg`,
    thumbnailUrl: null,
    category: 'toys',
    images: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function analysisRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id: `analysis-${id}`,
    masterId: id,
    organizationId: ORGANIZATION_ID,
    imageUrl: `https://example.com/${id}.jpg`,
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
      id,
      name: `Product ${id}`,
      imageUrl: `https://example.com/${id}.jpg`,
      thumbnailUrl: null,
      images: [],
    },
    ...over,
  };
}

function makePrismaMock(masters: Array<ReturnType<typeof masterRow>>) {
  return {
    masterProduct: {
      findMany: vi.fn(async () => masters),
      findFirst: vi.fn(async (args: { where: { id?: string } }) => {
        const id = args.where.id;
        return masters.find((m) => m.id === id) ?? null;
      }),
    },
    thumbnailAnalysis: {
      upsert: vi.fn(async (args: { where: { masterId: string } }) =>
        analysisRow(args.where.masterId),
      ),
    },
  };
}

function makeVisionMock(opts: { failChunk?: boolean } = {}) {
  return {
    analyzeQuality: vi.fn(async (items: Array<{ productId: string }>) => {
      if (opts.failChunk) throw new Error('Gemini quota');
      const map = new Map<string, unknown>();
      for (const item of items) {
        map.set(item.productId, {
          overallScore: 75,
          grade: 'B' as const,
          scores: { heroShot: 70, composition: 70, branding: 70, mobile: 70, differentiation: 70 } satisfies ThumbnailScores,
          issues: [],
          suggestions: [],
          method: 'ai',
        });
      }
      return map;
    }),
    checkCompliance: vi.fn(async (items: Array<{ productId: string }>) => {
      const map = new Map<string, unknown>();
      for (const item of items) {
        map.set(item.productId, {
          complianceGrade: 'PASS',
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

function makeBatch(opts: { failChunk?: boolean } = {}) {
  const prisma = makePrismaMock([masterRow(P1), masterRow(P2)]);
  const vision = makeVisionMock(opts);
  const recompose = makeRecomposeMock();
  const analyzer = new ThumbnailAnalysisAnalyzerService(
    prisma as never,
    vision as never,
    recompose as never,
  );
  const analyzerSpy = vi.spyOn(analyzer, 'analyzeProduct');
  const batch = new ThumbnailAnalysisBatchService(
    prisma as never,
    vision as never,
    recompose as never,
    analyzer,
  );
  return { batch, prisma, vision, recompose, analyzer, analyzerSpy };
}

describe('ThumbnailAnalysisBatchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty productIds without touching vision', async () => {
    const { batch, vision } = makeBatch();
    const result = await batch.analyzeBatch([], ORGANIZATION_ID, 'all');
    expect(result).toEqual([]);
    expect(vision.analyzeQuality).not.toHaveBeenCalled();
    expect(vision.checkCompliance).not.toHaveBeenCalled();
  });

  it('persists each chunk product through the shared upsert path', async () => {
    const { batch, prisma } = makeBatch();
    const result = await batch.analyzeBatch([P1, P2], ORGANIZATION_ID, 'quality');
    expect(result).toHaveLength(2);
    expect(prisma.thumbnailAnalysis.upsert).toHaveBeenCalledTimes(2);
    // upsert path takes masterId from input and binds organizationId via create.organization.connect.
    const calls = prisma.thumbnailAnalysis.upsert.mock.calls.map((c: { where: { masterId: string } }[]) => c[0].where.masterId);
    expect(calls).toContain(P1);
    expect(calls).toContain(P2);
  });

  it('falls back to analyzer.analyzeProduct when chunk batch call throws', async () => {
    const { batch, analyzerSpy } = makeBatch({ failChunk: true });
    // analyzer.analyzeProduct also calls vision.analyzeQuality — but quality mock
    // is set to fail. Use spy to assert the fallback was attempted per product.
    await batch.analyzeBatch([P1, P2], ORGANIZATION_ID, 'quality');
    expect(analyzerSpy).toHaveBeenCalledTimes(2);
    expect(analyzerSpy).toHaveBeenCalledWith(P1, ORGANIZATION_ID, 'quality', expect.anything());
    expect(analyzerSpy).toHaveBeenCalledWith(P2, ORGANIZATION_ID, 'quality', expect.anything());
  });

  it('cancelBatch returns { cancelled: false } when no batch is in flight', () => {
    const { batch } = makeBatch();
    expect(batch.cancelBatch(ORGANIZATION_ID)).toEqual({ cancelled: false });
  });

  it('cancelBatch aborts an in-flight batch controller', async () => {
    const { batch, vision } = makeBatch();
    // Stall the quality call so the batch sits in flight long enough to cancel.
    let resolveQuality: (value: Map<string, unknown>) => void = () => {};
    vision.analyzeQuality.mockImplementationOnce(
      () => new Promise<Map<string, unknown>>((resolve) => {
        resolveQuality = resolve;
      }),
    );
    const inflight = batch.analyzeBatch([P1, P2], ORGANIZATION_ID, 'quality');
    await Promise.resolve();
    const cancelled = batch.cancelBatch(ORGANIZATION_ID);
    expect(cancelled).toEqual({ cancelled: true });
    resolveQuality(new Map());
    const result = await inflight;
    // After cancellation the loop breaks out before persisting anything.
    expect(result).toEqual([]);
  });

  it('starting a new batch aborts the previous in-flight batch for the same organization', async () => {
    const { batch, vision } = makeBatch();
    let resolveFirst: (value: Map<string, unknown>) => void = () => {};
    vision.analyzeQuality.mockImplementationOnce(
      () => new Promise<Map<string, unknown>>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const first = batch.analyzeBatch([P1], ORGANIZATION_ID, 'quality');
    await Promise.resolve();
    // Second call returns immediately because its own vision mock is non-stalling.
    const second = batch.analyzeBatch([P2], ORGANIZATION_ID, 'quality');
    resolveFirst(new Map());
    const [firstResult, secondResult] = await Promise.all([first, second]);
    // First batch should have been aborted before it could persist.
    expect(firstResult).toEqual([]);
    expect(secondResult).toHaveLength(1);
  });
});
