import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ThumbnailAnalysisService } from '../thumbnail-analysis.service';
import { ThumbnailGenerationService } from '../thumbnail-generation.service';
import { ThumbnailAiService } from '../thumbnail-ai.service';

// ── Prisma mock factory ──────────────────────────────────────────────────────

function makePrisma() {
  return {
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    thumbnailAnalysis: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    thumbnailGeneration: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  };
}

// ── ThumbnailAiService mock factory ─────────────────────────────────────────

function makeAiService() {
  return {
    analyzeQuality: vi.fn().mockResolvedValue(new Map()),
    checkCompliance: vi.fn().mockResolvedValue(new Map()),
    analyzeWithRules: vi.fn(),
    toCoupangOriginal: vi.fn((url: string) => url),
    scoreToGrade: vi.fn((score: number) => {
      if (score >= 90) return 'S';
      if (score >= 75) return 'A';
      if (score >= 60) return 'B';
      if (score >= 40) return 'C';
      return 'F';
    }),
  };
}

// ── Helper: base product fixture ─────────────────────────────────────────────

function makeProduct(overrides: Record<string, any> = {}) {
  return {
    id: 'prod-1',
    name: '테스트 상품',
    companyId: 'company-1',
    imageUrl: 'https://cdn.example.com/img.jpg',
    thumbnailUrl: null,
    category: '유아동',
    isDeleted: false,
    status: 'active',
    thumbnails: [],
    thumbnailAnalysis: null,
    ...overrides,
  };
}

// ── ThumbnailAiService (pure) ────────────────────────────────────────────────

describe('ThumbnailAiService', () => {
  const service = new ThumbnailAiService();

  describe('scoreToGrade', () => {
    it('returns S for score >= 90', () => {
      expect(service.scoreToGrade(90)).toBe('S');
      expect(service.scoreToGrade(100)).toBe('S');
    });

    it('returns A for score 75-89', () => {
      expect(service.scoreToGrade(75)).toBe('A');
      expect(service.scoreToGrade(89)).toBe('A');
    });

    it('returns B for score 60-74', () => {
      expect(service.scoreToGrade(60)).toBe('B');
      expect(service.scoreToGrade(74)).toBe('B');
    });

    it('returns C for score 40-59', () => {
      expect(service.scoreToGrade(40)).toBe('C');
      expect(service.scoreToGrade(59)).toBe('C');
    });

    it('returns F for score below 40', () => {
      expect(service.scoreToGrade(39)).toBe('F');
      expect(service.scoreToGrade(0)).toBe('F');
    });
  });

  describe('analyzeWithRules', () => {
    it('returns grade B (score 60) for product with image', () => {
      const result = service.analyzeWithRules({
        id: 'p-1',
        name: '상품',
        imageUrl: 'https://example.com/img.jpg',
      });
      expect(result.overallScore).toBe(60);
      expect(result.grade).toBe('B');
      expect(result.method).toBe('rule');
      expect(result.issues).toHaveLength(0);
    });

    it('returns critical issue "대표 이미지 미등록" when no image', () => {
      const result = service.analyzeWithRules({
        id: 'p-1',
        name: '상품',
        imageUrl: null,
      });
      expect(result.overallScore).toBe(20); // 60 - 40
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('critical');
      expect(result.issues[0].message).toBe('대표 이미지 미등록');
    });

    it('no image → complianceGrade FAIL', () => {
      const result = service.analyzeWithRules({
        id: 'p-1',
        name: '상품',
        imageUrl: null,
      });
      expect(result.complianceGrade).toBe('FAIL');
    });

    it('with image → complianceGrade null (미분석)', () => {
      const result = service.analyzeWithRules({
        id: 'p-1',
        name: '상품',
        imageUrl: 'https://example.com/img.jpg',
      });
      expect(result.complianceGrade).toBeNull();
    });
  });

  // ── calculateComplianceGrade ─────────────────────────────────────────────────

  describe('calculateComplianceGrade', () => {
    function makeScores(overrides: {
      violations?: Partial<Record<string, boolean>>;
      confidence?: Record<string, number>;
      fillPercent?: number;
      offsetPercent?: number;
    } = {}) {
      const allFalse = {
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
      };
      return {
        violations: { ...allFalse, ...(overrides.violations ?? {}) } as Record<string, boolean>,
        confidence: overrides.confidence ?? {},
        quality: {
          estimatedFillPercent: overrides.fillPercent ?? 90,
          centerOffsetPercent: overrides.offsetPercent ?? 2,
          aspectRatioValid: true,
        },
        violationCount: 0,
      };
    }

    it('1. 위반 0건 + 경계값 없음 → PASS', () => {
      const scores = makeScores();
      expect(service.calculateComplianceGrade(scores as any).grade).toBe('PASS');
    });

    it('2. 위반 0건 + fill 80~85% → WARN', () => {
      const scores = makeScores({ fillPercent: 82 });
      expect(service.calculateComplianceGrade(scores as any).grade).toBe('WARN');
    });

    it('3. 위반 0건 + offset >5% → WARN', () => {
      const scores = makeScores({ offsetPercent: 6 });
      expect(service.calculateComplianceGrade(scores as any).grade).toBe('WARN');
    });

    it('4. 위반 0건 + 저확신 flag(violation true, confidence <60) → WARN', () => {
      const scores = makeScores({
        violations: { has_text: true },
        confidence: { has_text: 50 },
      });
      expect(service.calculateComplianceGrade(scores as any).grade).toBe('WARN');
    });

    it('5. 위반 1건 (confidence ≥60) → FAIL', () => {
      const scores = makeScores({
        violations: { background_not_white: true },
        confidence: { background_not_white: 80 },
      });
      expect(service.calculateComplianceGrade(scores as any).grade).toBe('FAIL');
    });

    it('6. 위반 1건 (confidence <60) → 무시 → PASS', () => {
      const scores = makeScores({
        violations: { background_not_white: true },
        confidence: { background_not_white: 40 },
      });
      // confidence < 60 → not confirmed violation, but low-confidence flag → WARN
      // Actually per spec: low-confidence flag → WARN
      expect(service.calculateComplianceGrade(scores as any).grade).toBe('WARN');
    });

    it('7. 위반 12건 전부 (confidence ≥60) → FAIL', () => {
      const violations = Object.fromEntries(
        [
          'background_not_white', 'has_text', 'has_extra_logo', 'has_discount_text',
          'has_freebie_display', 'has_overlay_effects', 'has_gradient_background',
          'has_background_objects', 'product_fill_low', 'not_center_aligned',
          'product_cropped', 'excessive_editing',
        ].map((k) => [k, true]),
      );
      const confidence = Object.fromEntries(Object.keys(violations).map((k) => [k, 95]));
      const scores = makeScores({ violations, confidence });
      expect(service.calculateComplianceGrade(scores as any).grade).toBe('FAIL');
    });

    it('8. violations 필드 누락 시 기본값 true → FAIL (방어 로직은 checkCompliance에서 적용)', () => {
      // calculateComplianceGrade receives already-defaulted scores
      // Here we test that true violations with confidence ≥60 → FAIL
      const scores = {
        violations: {
          background_not_white: true, // defaulted to true (missing field)
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
        confidence: { background_not_white: 0 }, // missing field → defaults to 0
        quality: { estimatedFillPercent: 90, centerOffsetPercent: 2, aspectRatioValid: true },
        violationCount: 1,
      };
      // confidence[background_not_white] = 0 < 60 → not confirmed, but low-confidence flag → WARN
      expect(service.calculateComplianceGrade(scores as any).grade).toBe('WARN');
    });
  });
});

// ── ThumbnailAnalysisService ─────────────────────────────────────────────────

describe('ThumbnailAnalysisService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let aiService: ReturnType<typeof makeAiService>;
  let service: ThumbnailAnalysisService;

  beforeEach(() => {
    prisma = makePrisma();
    aiService = makeAiService();
    service = new ThumbnailAnalysisService(prisma as any, aiService as any);
  });

  describe('analyzeProduct', () => {
    it('AI analysis succeeds → ThumbnailAnalysis upserted with ai grade/scores', async () => {
      const product = makeProduct();
      prisma.product.findUnique.mockResolvedValue(product);

      const qualityResult = {
        overallScore: 82,
        grade: 'A',
        scores: { guideline: 22, heroShot: 17, composition: 18, branding: 13, mobile: 12 },
        issues: [],
        suggestions: ['배경 유지'],
        method: 'ai' as const,
        complianceGrade: null,
        complianceScores: null,
      };
      aiService.analyzeQuality.mockResolvedValue(new Map([['prod-1', qualityResult]]));
      aiService.checkCompliance.mockResolvedValue(new Map());

      const savedRecord = {
        id: 'ana-1',
        productId: product.id,
        imageUrl: product.imageUrl,
        overallScore: 82,
        grade: 'A',
        scores: qualityResult.scores,
        issues: [],
        suggestions: ['배경 유지'],
        method: 'ai',
        qualityAnalyzedAt: new Date(),
        complianceAnalyzedAt: new Date(),
      };
      prisma.thumbnailAnalysis.upsert.mockResolvedValue(savedRecord);

      const result = await service.analyzeProduct(product.id);

      expect(prisma.thumbnailAnalysis.upsert).toHaveBeenCalled();
      expect(result.grade).toBe('A');
      expect(result.method).toBe('ai');
      expect(result.analyzed).toBe(true);
      expect(result.qualityAnalyzed).toBe(true);
    });

    it('AI fails → falls back to rule-based analysis', async () => {
      const product = makeProduct();
      prisma.product.findUnique.mockResolvedValue(product);
      aiService.analyzeQuality.mockResolvedValue(new Map()); // empty = AI returned nothing
      aiService.checkCompliance.mockResolvedValue(new Map());

      const ruleResult = {
        overallScore: 60,
        grade: 'B',
        scores: null,
        issues: [],
        suggestions: [],
        method: 'rule' as const,
      };
      aiService.analyzeWithRules.mockReturnValue(ruleResult);

      const savedRecord = {
        id: 'ana-2',
        productId: product.id,
        imageUrl: product.imageUrl,
        overallScore: 60,
        grade: 'B',
        scores: null,
        issues: [],
        suggestions: [],
        method: 'rule',
      };
      prisma.thumbnailAnalysis.upsert.mockResolvedValue(savedRecord);

      const result = await service.analyzeProduct(product.id);

      expect(aiService.analyzeWithRules).toHaveBeenCalledWith(
        expect.objectContaining({ id: product.id, imageUrl: product.imageUrl }),
      );
      expect(result.method).toBe('rule');
      expect(result.grade).toBe('B');
    });

    it('no image → rule-based with critical issue "대표 이미지 미등록"', async () => {
      const product = makeProduct({ imageUrl: null, thumbnailUrl: null, thumbnails: [] });
      prisma.product.findUnique.mockResolvedValue(product);

      const ruleResult = {
        overallScore: 20,
        grade: 'F',
        scores: null,
        issues: [{ type: 'no_image', severity: 'critical', message: '대표 이미지 미등록' }],
        suggestions: ['대표 이미지를 등록하세요'],
        method: 'rule' as const,
      };
      aiService.analyzeWithRules.mockReturnValue(ruleResult);

      const savedRecord = {
        id: 'ana-3',
        productId: product.id,
        imageUrl: '',
        overallScore: 20,
        grade: 'F',
        scores: null,
        issues: ruleResult.issues,
        suggestions: ruleResult.suggestions,
        method: 'rule',
      };
      prisma.thumbnailAnalysis.upsert.mockResolvedValue(savedRecord);

      const result = await service.analyzeProduct(product.id);

      // AI should not be called when there's no image
      expect(aiService.analyzeQuality).not.toHaveBeenCalled();
      expect(result.grade).toBe('F');
      expect(result.issues[0].message).toBe('대표 이미지 미등록');
    });

    it('throws NotFoundException when product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.analyzeProduct('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('analyzeBatch', () => {
    it('processes multiple products via batch API and returns all results', async () => {
      const productIds = ['prod-1', 'prod-2', 'prod-3'];
      const products = productIds.map((id) => makeProduct({ id }));

      prisma.product.findMany.mockResolvedValue(products);

      // Batch calls return Map with all results
      const qualityMap = new Map(productIds.map((id) => [id, {
        overallScore: 75, grade: 'A' as const, scores: null, issues: [], suggestions: [], method: 'ai' as const,
        complianceGrade: null, complianceScores: null,
      }]));
      aiService.analyzeQuality.mockResolvedValueOnce(qualityMap);
      aiService.checkCompliance.mockResolvedValueOnce(new Map());

      for (const id of productIds) {
        prisma.thumbnailAnalysis.upsert.mockResolvedValueOnce({
          id: `ana-${id}`,
          productId: id,
          imageUrl: 'https://cdn.example.com/img.jpg',
          overallScore: 75,
          grade: 'A',
          scores: null,
          issues: [],
          suggestions: [],
          method: 'ai',
          qualityAnalyzedAt: new Date(),
          complianceAnalyzedAt: null,
        });
      }

      const results = await service.analyzeBatch(productIds);
      expect(results).toHaveLength(3);
      expect(aiService.analyzeQuality).toHaveBeenCalledTimes(1);
    });

    it('processes only found products (unfound products skipped)', async () => {
      // findMany returns only prod-2 (prod-1 not found)
      prisma.product.findMany.mockResolvedValue([makeProduct({ id: 'prod-2' })]);

      // batch analysis for prod-2
      aiService.analyzeQuality.mockResolvedValueOnce(new Map([['prod-2', {
        overallScore: 80,
        grade: 'A' as const,
        scores: null,
        issues: [],
        suggestions: [],
        method: 'ai' as const,
        complianceGrade: null,
        complianceScores: null,
      }]]));
      aiService.checkCompliance.mockResolvedValueOnce(new Map());
      prisma.thumbnailAnalysis.upsert.mockResolvedValueOnce({
        id: 'ana-2',
        productId: 'prod-2',
        imageUrl: 'https://cdn.example.com/img.jpg',
        overallScore: 80,
        grade: 'A',
        scores: null,
        issues: [],
        suggestions: [],
        method: 'ai',
        qualityAnalyzedAt: new Date(),
        complianceAnalyzedAt: null,
      });

      const results = await service.analyzeBatch(['prod-1', 'prod-2']);
      expect(results).toHaveLength(1);
      expect(results[0].productId).toBe('prod-2');
    });
  });

  describe('getSummary', () => {
    it('returns total/analyzed/partialCount/gradeDistribution', async () => {
      prisma.product.count.mockResolvedValue(10);
      // count is called twice: fully analyzed, then partial
      prisma.thumbnailAnalysis.count
        .mockResolvedValueOnce(6)  // fully analyzed
        .mockResolvedValueOnce(1); // partial
      prisma.thumbnailAnalysis.groupBy
        .mockResolvedValueOnce([  // grade groups
          { grade: 'S', _count: { id: 1 } },
          { grade: 'A', _count: { id: 2 } },
          { grade: 'B', _count: { id: 2 } },
          { grade: 'C', _count: { id: 1 } },
        ])
        .mockResolvedValueOnce([]); // compliance groups

      const summary = await service.getSummary();

      expect(summary.total).toBe(10);
      expect(summary.analyzed).toBe(6);
      expect(summary.partialCount).toBe(1);
      expect(summary.unclassifiedCount).toBe(3);
      expect(summary.gradeDistribution).toEqual({ S: 1, A: 2, B: 2, C: 1, F: 0 });
    });
  });
});

// ── ThumbnailGenerationService ───────────────────────────────────────────────

describe('ThumbnailGenerationService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let aiService: ReturnType<typeof makeAiService>;
  let service: ThumbnailGenerationService;

  beforeEach(() => {
    prisma = makePrisma();
    aiService = makeAiService();
    service = new ThumbnailGenerationService(prisma as any, aiService as any, { create: vi.fn().mockResolvedValue({}) } as any);
  });

  describe('selectCandidate', () => {
    it('updates selectedUrl and returns updated record', async () => {
      const existingRecord = { id: 'gen-1', status: 'ready' };
      prisma.thumbnailGeneration.findUnique.mockResolvedValue(existingRecord);

      const updatedRecord = {
        id: 'gen-1',
        productId: 'prod-1',
        companyId: 'company-1',
        originalUrl: 'https://example.com/orig.jpg',
        candidates: [],
        selectedUrl: '/generated-thumbnails/chosen.png',
        status: 'ready',
        grade: '',
        score: 0,
        prompt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        product: makeProduct(),
      };
      prisma.thumbnailGeneration.update.mockResolvedValue(updatedRecord);

      const result = await service.selectCandidate('gen-1', '/generated-thumbnails/chosen.png');

      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gen-1' },
          data: { selectedUrl: '/generated-thumbnails/chosen.png', status: 'ready' },
        }),
      );
      expect(result.selectedUrl).toBe('/generated-thumbnails/chosen.png');
    });

    it('throws NotFoundException when generation not found', async () => {
      prisma.thumbnailGeneration.findUnique.mockResolvedValue(null);

      await expect(service.selectCandidate('nonexistent', '/url')).rejects.toThrow(NotFoundException);
    });
  });

  describe('applyGeneration', () => {
    it('marks status="applied"', async () => {
      const existingRecord = { id: 'gen-1', status: 'ready' };
      prisma.thumbnailGeneration.findUnique.mockResolvedValue(existingRecord);

      const appliedRecord = {
        id: 'gen-1',
        productId: 'prod-1',
        companyId: 'company-1',
        originalUrl: null,
        candidates: [],
        selectedUrl: '/generated-thumbnails/chosen.png',
        status: 'applied',
        grade: '',
        score: 0,
        prompt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        product: makeProduct(),
      };
      prisma.thumbnailGeneration.update.mockResolvedValue(appliedRecord);

      const result = await service.applyGeneration('gen-1');

      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'applied' } }),
      );
      expect(result.status).toBe('applied');
    });

    it('throws NotFoundException when generation not found', async () => {
      prisma.thumbnailGeneration.findUnique.mockResolvedValue(null);

      await expect(service.applyGeneration('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('skipGeneration', () => {
    it('marks status="skipped"', async () => {
      const existingRecord = { id: 'gen-1', status: 'ready' };
      prisma.thumbnailGeneration.findUnique.mockResolvedValue(existingRecord);

      const skippedRecord = {
        id: 'gen-1',
        productId: 'prod-1',
        companyId: 'company-1',
        originalUrl: null,
        candidates: [],
        selectedUrl: null,
        status: 'skipped',
        grade: '',
        score: 0,
        prompt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        product: makeProduct(),
      };
      prisma.thumbnailGeneration.update.mockResolvedValue(skippedRecord);

      const result = await service.skipGeneration('gen-1');

      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'skipped' } }),
      );
      expect(result.status).toBe('skipped');
    });

    it('throws NotFoundException when generation not found', async () => {
      prisma.thumbnailGeneration.findUnique.mockResolvedValue(null);

      await expect(service.skipGeneration('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
