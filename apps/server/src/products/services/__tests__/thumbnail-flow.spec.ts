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
    analyzeWithGeminiVision: vi.fn(),
    analyzeWithRules: vi.fn(),
    generateImages: vi.fn(),
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

      const aiResult = {
        overallScore: 82,
        grade: 'A',
        scores: { guideline: 22, heroShot: 17, composition: 18, branding: 13, mobile: 12 },
        issues: [],
        suggestions: ['배경 유지'],
        method: 'ai' as const,
      };
      aiService.analyzeWithGeminiVision.mockResolvedValue(aiResult);

      const savedRecord = {
        id: 'ana-1',
        productId: product.id,
        imageUrl: product.imageUrl,
        overallScore: 82,
        grade: 'A',
        scores: aiResult.scores,
        issues: [],
        suggestions: ['배경 유지'],
        method: 'ai',
      };
      prisma.thumbnailAnalysis.upsert.mockResolvedValue(savedRecord);

      const result = await service.analyzeProduct(product.id);

      expect(aiService.analyzeWithGeminiVision).toHaveBeenCalledWith(
        product.imageUrl,
        product.name,
        product.category,
      );
      expect(prisma.thumbnailAnalysis.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: product.id },
          create: expect.objectContaining({ grade: 'A', method: 'ai' }),
          update: expect.objectContaining({ grade: 'A', method: 'ai' }),
        }),
      );
      expect(result.grade).toBe('A');
      expect(result.method).toBe('ai');
      expect(result.analyzed).toBe(true);
    });

    it('AI fails → falls back to rule-based analysis', async () => {
      const product = makeProduct();
      prisma.product.findUnique.mockResolvedValue(product);
      aiService.analyzeWithGeminiVision.mockResolvedValue(null); // AI returns null

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
      expect(aiService.analyzeWithGeminiVision).not.toHaveBeenCalled();
      expect(result.grade).toBe('F');
      expect(result.issues[0].message).toBe('대표 이미지 미등록');
    });

    it('throws NotFoundException when product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.analyzeProduct('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('analyzeBatch', () => {
    it('processes multiple products and returns all results', async () => {
      const products = ['prod-1', 'prod-2', 'prod-3'];

      for (const id of products) {
        const product = makeProduct({ id });
        prisma.product.findUnique.mockResolvedValueOnce(product);

        const aiResult = { overallScore: 75, grade: 'A', scores: null, issues: [], suggestions: [], method: 'ai' as const };
        aiService.analyzeWithGeminiVision.mockResolvedValueOnce(aiResult);

        prisma.thumbnailAnalysis.upsert.mockResolvedValueOnce({
          id: `ana-${id}`,
          productId: id,
          imageUrl: 'https://example.com/img.jpg',
          overallScore: 75,
          grade: 'A',
          scores: null,
          issues: [],
          suggestions: [],
          method: 'ai',
        });
      }

      const results = await service.analyzeBatch(products);
      expect(results).toHaveLength(3);
    });

    it('continues on individual product failure', async () => {
      // First product throws, second succeeds
      prisma.product.findUnique
        .mockResolvedValueOnce(null) // causes NotFoundException for prod-1
        .mockResolvedValueOnce(makeProduct({ id: 'prod-2' }));

      aiService.analyzeWithGeminiVision.mockResolvedValueOnce({
        overallScore: 80,
        grade: 'A',
        scores: null,
        issues: [],
        suggestions: [],
        method: 'ai' as const,
      });

      prisma.thumbnailAnalysis.upsert.mockResolvedValueOnce({
        id: 'ana-2',
        productId: 'prod-2',
        imageUrl: 'https://example.com/img.jpg',
        overallScore: 80,
        grade: 'A',
        scores: null,
        issues: [],
        suggestions: [],
        method: 'ai',
      });

      const results = await service.analyzeBatch(['prod-1', 'prod-2']);
      // Only prod-2 succeeded; prod-1 error was swallowed
      expect(results).toHaveLength(1);
      expect(results[0].productId).toBe('prod-2');
    });
  });

  describe('getSummary', () => {
    it('returns total/analyzed/gradeDistribution', async () => {
      prisma.product.count.mockResolvedValue(10);
      prisma.thumbnailAnalysis.count.mockResolvedValue(6);
      prisma.thumbnailAnalysis.groupBy.mockResolvedValue([
        { grade: 'S', _count: { id: 1 } },
        { grade: 'A', _count: { id: 2 } },
        { grade: 'B', _count: { id: 2 } },
        { grade: 'C', _count: { id: 1 } },
      ]);

      const summary = await service.getSummary();

      expect(summary.total).toBe(10);
      expect(summary.analyzed).toBe(6);
      expect(summary.unclassifiedCount).toBe(4);
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
    service = new ThumbnailGenerationService(prisma as any, aiService as any);
  });

  describe('createJobs', () => {
    it('creates ThumbnailGeneration record with status="generating" initially, then "ready" on success', async () => {
      const product = makeProduct();
      prisma.thumbnailGeneration.findFirst.mockResolvedValue(null); // no existing job
      prisma.product.findUnique.mockResolvedValue(product);

      const createdRecord = {
        id: 'gen-1',
        productId: product.id,
        companyId: product.companyId,
        originalUrl: product.imageUrl,
        status: 'generating',
        candidates: [],
        selectedUrl: null,
        grade: '',
        score: 0,
        prompt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        product,
      };
      prisma.thumbnailGeneration.create.mockResolvedValue(createdRecord);

      const generatedImages = [
        { url: '/generated-thumbnails/prod-1_123_0.png', filename: 'prod-1_123_0.png' },
        { url: '/generated-thumbnails/prod-1_123_1.png', filename: 'prod-1_123_1.png' },
      ];
      aiService.generateImages.mockResolvedValue(generatedImages);

      const updatedRecord = {
        ...createdRecord,
        candidates: generatedImages,
        status: 'ready',
      };
      prisma.thumbnailGeneration.update.mockResolvedValue(updatedRecord);

      const results = await service.createJobs([product.id]);

      expect(prisma.thumbnailGeneration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'generating', productId: product.id }),
        }),
      );
      expect(aiService.generateImages).toHaveBeenCalledWith(
        product.name,
        product.category,
        product.id,
      );
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ready' }),
        }),
      );
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('ready');
    });

    it('AI generation fails → status="failed", no placeholder URLs', async () => {
      const product = makeProduct();
      prisma.thumbnailGeneration.findFirst.mockResolvedValue(null);
      prisma.product.findUnique.mockResolvedValue(product);

      const createdRecord = {
        id: 'gen-2',
        productId: product.id,
        companyId: product.companyId,
        originalUrl: product.imageUrl,
        status: 'generating',
        candidates: [],
        selectedUrl: null,
        grade: '',
        score: 0,
        prompt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        product,
      };
      prisma.thumbnailGeneration.create.mockResolvedValue(createdRecord);
      aiService.generateImages.mockRejectedValue(new Error('Imagen API error'));

      const failedRecord = { ...createdRecord, candidates: [], status: 'failed' };
      prisma.thumbnailGeneration.update.mockResolvedValue(failedRecord);

      const results = await service.createJobs([product.id]);

      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'failed', candidates: [] }),
        }),
      );
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('failed');
      expect(results[0].candidates).toHaveLength(0);
    });

    it('skips product that already has an active job', async () => {
      const existingJob = { id: 'gen-existing', status: 'generating' };
      prisma.thumbnailGeneration.findFirst.mockResolvedValue(existingJob);

      const results = await service.createJobs(['prod-1']);

      expect(prisma.product.findUnique).not.toHaveBeenCalled();
      expect(prisma.thumbnailGeneration.create).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
    });
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
