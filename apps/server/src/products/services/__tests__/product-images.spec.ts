import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ProductsService } from '../products.service';

function makePrisma() {
  return {
    product: {
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
}

function makeAgentRegistry() {
  return {
    runByType: vi.fn(),
  };
}

describe('ProductsService.updateImages', () => {
  let service: ProductsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ProductsService(prisma as any, makeAgentRegistry() as any);
  });

  it('정상 저장 + 반환', async () => {
    const images = [
      { url: 'https://cdn.example.com/a.jpg', role: 'main', label: '메인', sortOrder: 0 },
      { url: 'https://cdn.example.com/b.jpg', role: 'sub', sortOrder: 1 },
    ];
    const expected = { id: 'prod-1', images };
    prisma.product.update.mockResolvedValue(expected);

    const result = await service.updateImages('prod-1', images);

    expect(result).toEqual(expected);
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { images: images as any },
      select: { id: true, images: true },
    });
  });

  it('20개 초과 시 BadRequestException', async () => {
    const images = Array.from({ length: 21 }, (_, i) => ({
      url: `https://cdn.example.com/${i}.jpg`,
      role: 'sub',
    }));

    await expect(service.updateImages('prod-1', images)).rejects.toThrow(BadRequestException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('빈 배열로 초기화', async () => {
    const expected = { id: 'prod-1', images: [] };
    prisma.product.update.mockResolvedValue(expected);

    const result = await service.updateImages('prod-1', []);

    expect(result).toEqual(expected);
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { images: [] as any },
      select: { id: true, images: true },
    });
  });
});
