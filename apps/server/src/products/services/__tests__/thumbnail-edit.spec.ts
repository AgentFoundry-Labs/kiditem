import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThumbnailEditService } from '../thumbnail-edit.service';

function makePrisma() {
  return {
    product: {
      findUnique: vi.fn(),
    },
    thumbnailGeneration: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

function makeAiService() {
  return {
    editImage: vi.fn(),
    analyzeWithGeminiVision: vi.fn(),
  };
}

describe('ThumbnailEditService', () => {
  let service: ThumbnailEditService;
  let prisma: ReturnType<typeof makePrisma>;
  let aiService: ReturnType<typeof makeAiService>;

  beforeEach(() => {
    prisma = makePrisma();
    aiService = makeAiService();
    service = new ThumbnailEditService(prisma as any, aiService as any);
  });

  describe('createEditJobs', () => {
    it('이미지 있는 상품 → status: pending 즉시 반환', async () => {
      const product = { id: 'p1', companyId: 'c1', imageUrl: 'http://img.jpg', thumbnailUrl: null, name: '테스트', category: '완구' };
      prisma.thumbnailGeneration.findFirst.mockResolvedValue(null);
      prisma.product.findUnique.mockResolvedValue(product);
      prisma.thumbnailGeneration.create.mockResolvedValue({
        id: 'g1',
        productId: 'p1',
        companyId: 'c1',
        originalUrl: 'http://img.jpg',
        candidates: [],
        selectedUrl: null,
        status: 'pending',
        grade: 'F',
        score: 0,
        prompt: null,
        method: 'edit',
        editAnalysis: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        product: { id: 'p1', name: '테스트', imageUrl: 'http://img.jpg', coupangProductId: null, category: '완구' },
      });

      const results = await service.createEditJobs(['p1']);

      expect(results).toHaveLength(1);
      expect(results[0].method).toBe('edit');
      expect(results[0].status).toBe('pending');
      expect(prisma.thumbnailGeneration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ method: 'edit', status: 'pending' }),
        }),
      );
    });

    it('이미지 없는 상품 → skip', async () => {
      const product = { id: 'p2', companyId: 'c1', imageUrl: null, thumbnailUrl: null, name: '테스트' };
      prisma.thumbnailGeneration.findFirst.mockResolvedValue(null);
      prisma.product.findUnique.mockResolvedValue(product);

      const results = await service.createEditJobs(['p2']);

      expect(results).toHaveLength(0);
      expect(prisma.thumbnailGeneration.create).not.toHaveBeenCalled();
    });

    it('기존 활성 edit job → skip', async () => {
      prisma.thumbnailGeneration.findFirst.mockResolvedValue({ id: 'existing', status: 'generating' });

      const results = await service.createEditJobs(['p3']);

      expect(results).toHaveLength(0);
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
    });

    it('상품이 없으면 → skip', async () => {
      prisma.thumbnailGeneration.findFirst.mockResolvedValue(null);
      prisma.product.findUnique.mockResolvedValue(null);

      const results = await service.createEditJobs(['missing']);

      expect(results).toHaveLength(0);
    });
  });
});
