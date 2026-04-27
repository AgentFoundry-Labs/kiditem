import { NotImplementedException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourcingService } from '../sourcing.service';

function makePrisma() {
  return {
    masterProduct: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

function makeAgentRegistry() {
  return {
    runByType: vi.fn().mockResolvedValue({ taskId: 'task-1', ok: true }),
  };
}

describe('SourcingService — extension data ingestion', () => {
  let service: SourcingService;
  let prisma: ReturnType<typeof makePrisma>;
  let agentRegistry: ReturnType<typeof makeAgentRegistry>;

  beforeEach(() => {
    prisma = makePrisma();
    agentRegistry = makeAgentRegistry();
    service = new SourcingService(prisma as any, agentRegistry as any);
  });

  it('receiveExtensionData with new source_url → rejects create path until MasterCodeService integration', async () => {
    prisma.masterProduct.findFirst.mockResolvedValue(null);

    await expect(service.receiveExtensionData(
      {
        page_type: 'detail',
        title: '아동용 스니커즈',
        source_url: 'https://1688.com/item/12345',
        source_platform: '1688',
        price: 15.5,
        images: ['https://img1.jpg'],
      },
      'company-1',
    )).rejects.toThrow(NotImplementedException);

    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { sourceUrl: 'https://1688.com/item/12345', companyId: 'company-1' },
    });
    expect(prisma.masterProduct.create).not.toHaveBeenCalled();
    expect(prisma.masterProduct.update).not.toHaveBeenCalled();
  });

  it('receiveExtensionData with existing source_url → updates existing product', async () => {
    const existing = { id: 'prod-existing' };
    prisma.masterProduct.findFirst.mockResolvedValue(existing);
    prisma.masterProduct.update.mockResolvedValue({ id: 'prod-existing' });

    const result = await service.receiveExtensionData(
      {
        page_type: 'detail',
        title: '아동용 스니커즈 (업데이트)',
        source_url: 'https://1688.com/item/12345',
        source_platform: '1688',
        price: 18.0,
      },
      'company-1',
    );

    expect(prisma.masterProduct.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-existing' },
        data: expect.objectContaining({
          name: '아동용 스니커즈 (업데이트)',
          costCny: 18.0,
        }),
      }),
    );
    expect(prisma.masterProduct.create).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('price parsing: priceRange "¥12.5-¥25.0" format → extracts minimum cost', async () => {
    prisma.masterProduct.findFirst.mockResolvedValue({ id: 'prod-existing' });
    prisma.masterProduct.update.mockResolvedValue({ id: 'prod-existing' });

    await service.receiveExtensionData(
      {
        page_type: 'detail',
        title: '키즈 바람막이',
        source_url: 'https://1688.com/item/99999',
        source_platform: '1688',
        priceRange: '12.5-25.0',
      },
      'company-1',
    );

    expect(prisma.masterProduct.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-existing' },
        data: expect.objectContaining({
          costCny: 12.5,
        }),
      }),
    );
  });

  it('companyId scopes source_url lookup before updating a matched product', async () => {
    prisma.masterProduct.findFirst.mockResolvedValue({ id: 'prod-3' });
    prisma.masterProduct.update.mockResolvedValue({ id: 'prod-3' });

    await service.receiveExtensionData(
      {
        page_type: 'detail',
        title: '유아 모자',
        source_url: 'https://alibaba.com/product/abc',
        source_platform: 'alibaba',
        price: 8.0,
      },
      'company-A',
    );

    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { sourceUrl: 'https://alibaba.com/product/abc', companyId: 'company-A' },
    });
    expect(prisma.masterProduct.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-3' },
        data: expect.objectContaining({
          name: '유아 모자',
          costCny: 8.0,
        }),
      }),
    );
    expect(prisma.masterProduct.create).not.toHaveBeenCalled();
  });

  it('search page type → returns product_count from total_found, does not create product', async () => {
    const result = await service.receiveExtensionData(
      {
        page_type: 'search',
        source_platform: '1688',
        total_found: 42,
      },
      'company-1',
    );

    expect(prisma.masterProduct.findFirst).not.toHaveBeenCalled();
    expect(prisma.masterProduct.create).not.toHaveBeenCalled();
    expect(result.product_count).toBe(42);
    expect(result.ok).toBe(true);
  });
});
