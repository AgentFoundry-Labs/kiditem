import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThumbnailEditService } from '../thumbnail-edit.service';

function makePrisma() {
  return {
    product: {
      findUnique: vi.fn(),
    },
    thumbnailGeneration: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function makeAiService() {
  return {
    editImage: vi.fn(),
    checkCompliance: vi.fn().mockResolvedValue(new Map()),
  };
}

describe('ThumbnailEditService', () => {
  let service: ThumbnailEditService;
  let prisma: ReturnType<typeof makePrisma>;
  let aiService: ReturnType<typeof makeAiService>;

  beforeEach(() => {
    prisma = makePrisma();
    aiService = makeAiService();
    service = new ThumbnailEditService(prisma as any, aiService as any, { emit: vi.fn() } as any);
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
        phase: null,
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
      prisma.thumbnailGeneration.findFirst.mockResolvedValue({ id: 'existing', status: 'running', phase: null });

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

  describe('processEditJob', () => {
    it('성공 → status: ready + candidates 저장', async () => {
      const candidates = [
        { url: 'http://edited-1.png', filename: 'edited-1.png' },
        { url: 'http://edited-2.png', filename: 'edited-2.png' },
      ];
      aiService.editImage.mockResolvedValue(candidates);
      aiService.checkCompliance.mockResolvedValue(new Map([
        ['g1', { complianceGrade: 'PASS', complianceScores: { violationCount: 0 } }],
      ]));
      prisma.thumbnailGeneration.update.mockResolvedValue({});

      await (service as any).processEditJob('g1', 'http://img.jpg', '테스트', '완구', 'compliance');

      // generating → ready 순서로 update 호출
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledTimes(2);
      expect(prisma.thumbnailGeneration.update).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ data: { status: 'running', phase: null } }),
      );
      expect(prisma.thumbnailGeneration.update).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'succeeded',
            phase: 'ready',
            candidates: expect.arrayContaining([expect.objectContaining({ url: 'http://edited-1.png' })]),
          }),
        }),
      );
    });

    it('editImage 빈 배열 반환 → status: failed', async () => {
      aiService.editImage.mockResolvedValue([]);
      prisma.thumbnailGeneration.update.mockResolvedValue({});

      await (service as any).processEditJob('g2', 'http://img.jpg', '테스트', null, 'compliance');

      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'g2' }, data: { status: 'failed', phase: null } }),
      );
    });

    it('editImage 에러 → status: failed + 에러 로깅', async () => {
      aiService.editImage.mockRejectedValue(new Error('AI 서버 타임아웃'));
      prisma.thumbnailGeneration.update.mockResolvedValue({});

      await (service as any).processEditJob('g3', 'http://img.jpg', '테스트', null, 'quality');

      // generating 1회 + failed 1회
      const failCall = prisma.thumbnailGeneration.update.mock.calls.find(
        (c: any) => c[0]?.data?.status === 'failed',
      );
      expect(failCall).toBeTruthy();
    });
  });

  describe('reEditJob (phase reset invariant)', () => {
    it("resets status='pending' AND phase=null when re-editing a succeeded+ready job", async () => {
      const job = {
        id: 'gen-ready',
        status: 'succeeded',
        phase: 'ready',
        originalUrl: 'https://example.com/a.jpg',
        product: { id: 'p1', name: 'X', imageUrl: null, coupangProductId: null, category: null },
      };
      prisma.thumbnailGeneration.findUnique.mockResolvedValue(job as any);

      await service.reEditJob('gen-ready');

      const updateCall = prisma.thumbnailGeneration.update.mock.calls.find(
        (c: any) => c[0]?.where?.id === 'gen-ready',
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![0].data).toMatchObject({ status: 'pending', phase: null });
    });

    it("resets phase when re-editing a succeeded+applied job (stale phase → null)", async () => {
      const job = {
        id: 'gen-applied',
        status: 'succeeded',
        phase: 'applied',
        originalUrl: 'https://example.com/a.jpg',
        product: { id: 'p1', name: 'X', imageUrl: null, coupangProductId: null, category: null },
      };
      prisma.thumbnailGeneration.findUnique.mockResolvedValue(job as any);

      await service.reEditJob('gen-applied');

      const updateCall = prisma.thumbnailGeneration.update.mock.calls.find(
        (c: any) => c[0]?.where?.id === 'gen-applied',
      );
      expect(updateCall![0].data).toMatchObject({ status: 'pending', phase: null });
    });
  });
});
