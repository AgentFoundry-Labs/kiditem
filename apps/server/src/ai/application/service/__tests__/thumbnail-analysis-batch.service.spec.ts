import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComplianceScores, RecomposeVariantClassification, ThumbnailScores } from '@kiditem/shared/ai';
import { ThumbnailAnalysisAnalyzerService } from '../thumbnail-analysis-analyzer.service';
import { ThumbnailAnalysisBatchService } from '../thumbnail-analysis-batch.service';

const ORGANIZATION_ID = 'organization-1';
const P1 = '7d000000-0000-4000-8000-000000000101';
const P2 = '7d000000-0000-4000-8000-000000000102';

function workspaceRow(id: string) {
  return {
    id,
    name: `Product ${id}`,
    imageUrl: `https://example.com/${id}.jpg`,
    category: 'toys',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function analysisRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id: `analysis-${id}`,
    contentWorkspaceId: id,
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
    ...over,
  };
}

function makeRepositoryMock(workspaces: Array<ReturnType<typeof workspaceRow>>) {
  return {
    findWorkspacesForBatch: vi.fn(async (ids: string[]) =>
      workspaces.filter((workspace) => ids.includes(workspace.id)),
    ),
    findWorkspaceForAnalysis: vi.fn(async (id: string) => workspaces.find((workspace) => workspace.id === id) ?? null),
    upsertAnalysis: vi.fn(async (input: { contentWorkspaceId: string }) => analysisRow(input.contentWorkspaceId)),
    findAllAnalysisWorkspaces: vi.fn(async () => []),
    findAnalysesForOrganization: vi.fn(async () => []),
    getAnalysisSummaryRows: vi.fn(async () => ({
      workspaceCount: 0,
      rows: [],
    })),
    findWorkspacesForPreInspect: vi.fn(async () => []),
    findRecomposeWorkspace: vi.fn(async () => null),
  };
}

function makeVisionMock(opts: { failChunk?: boolean } = {}) {
  return {
    analyzeQuality: vi.fn(async (items: Array<{ contentWorkspaceId: string }>) => {
      if (opts.failChunk) throw new Error('Gemini quota');
      const map = new Map<string, unknown>();
      for (const item of items) {
        map.set(item.contentWorkspaceId, {
          overallScore: 75,
          grade: 'B' as const,
          scores: {
            heroShot: 70,
            composition: 70,
            branding: 70,
            mobile: 70,
            differentiation: 70,
          } satisfies ThumbnailScores,
          issues: [],
          suggestions: [],
          method: 'ai',
        });
      }
      return map;
    }),
    checkCompliance: vi.fn(async (items: Array<{ contentWorkspaceId: string }>) => {
      const map = new Map<string, unknown>();
      for (const item of items) {
        map.set(item.contentWorkspaceId, {
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
            quality: {
              estimatedFillPercent: 90,
              centerOffsetPercent: 1,
              aspectRatioValid: true,
            },
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
  const repository = makeRepositoryMock([workspaceRow(P1), workspaceRow(P2)]);
  const vision = makeVisionMock(opts);
  const recompose = makeRecomposeMock();
  const analyzer = new ThumbnailAnalysisAnalyzerService(repository as never, vision as never, recompose as never);
  const analyzerSpy = vi.spyOn(analyzer, 'analyzeWorkspace');
  const batch = new ThumbnailAnalysisBatchService(repository as never, vision as never, recompose as never, analyzer);
  return { batch, repository, vision, recompose, analyzer, analyzerSpy };
}

describe('ThumbnailAnalysisBatchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty contentWorkspaceIds without touching vision', async () => {
    const { batch, vision } = makeBatch();
    const result = await batch.analyzeBatch([], ORGANIZATION_ID, 'all');
    expect(result).toEqual([]);
    expect(vision.analyzeQuality).not.toHaveBeenCalled();
    expect(vision.checkCompliance).not.toHaveBeenCalled();
  });

  it('persists each chunk product through the shared upsert path', async () => {
    const { batch, repository } = makeBatch();
    const result = await batch.analyzeBatch([P1, P2], ORGANIZATION_ID, 'quality');
    expect(result).toHaveLength(2);
    expect(repository.upsertAnalysis).toHaveBeenCalledTimes(2);
    const calls = repository.upsertAnalysis.mock.calls.map(
      (call: Array<{ contentWorkspaceId: string }>) => call[0].contentWorkspaceId,
    );
    expect(calls).toContain(P1);
    expect(calls).toContain(P2);
  });

  it('falls back to analyzer.analyzeWorkspace when chunk batch call throws', async () => {
    const { batch, analyzerSpy } = makeBatch({ failChunk: true });
    // analyzer.analyzeWorkspace also calls vision.analyzeQuality — but quality mock
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
      () =>
        new Promise<Map<string, unknown>>((resolve) => {
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
      () =>
        new Promise<Map<string, unknown>>((resolve) => {
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
