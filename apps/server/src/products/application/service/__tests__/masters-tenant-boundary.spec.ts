import { describe, expect, it, vi } from 'vitest';
import { MastersService } from '../masters.service';

describe('MastersService tenant boundary internals', () => {
  it('re-reads a newly created master with organization scope inside the transaction', async () => {
    const row = {
      id: 'master-1',
      code: 'M-00000001',
      organizationId: 'organization-1',
      name: 'Scoped master',
      optionCounter: 0,
      images: [],
    };
    const tx = {
      masterProduct: {
        create: vi.fn().mockResolvedValue(row),
        findFirst: vi.fn().mockResolvedValue(row),
        findUniqueOrThrow: vi.fn().mockResolvedValue(row),
      },
      masterProductImage: {
        createMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const codeSvc = { generate: vi.fn().mockResolvedValue('M-00000001') };
    const svc = new MastersService(prisma as any, codeSvc as any, {} as any);

    await svc.create('organization-1', { name: 'Scoped master' } as any);

    expect(tx.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { id: 'master-1', organizationId: 'organization-1' },
      include: expect.any(Object),
    });
    expect(tx.masterProduct.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('seeds rawData images for direct detail-page generator masters', async () => {
    const row = {
      id: 'master-1',
      code: 'M-00000001',
      organizationId: 'organization-1',
      name: 'Uploaded toy',
      optionCounter: 0,
      images: [],
    };
    const tx = {
      masterProduct: {
        create: vi.fn().mockResolvedValue(row),
        findFirst: vi.fn().mockResolvedValue(row),
        findUniqueOrThrow: vi.fn().mockResolvedValue(row),
      },
      masterProductImage: {
        createMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const codeSvc = { generate: vi.fn().mockResolvedValue('M-00000001') };
    const svc = new MastersService(prisma as any, codeSvc as any, {} as any);

    await svc.create('organization-1', {
      name: 'Uploaded toy',
      description: '설명',
      category: '초등학생 대상 키즈 상품',
      sourcePlatform: 'detail-page-generator',
      images: [
        {
          url: 'https://cdn.example.com/1.jpg',
          role: 'product',
          label: '대표 이미지',
          sortOrder: 0,
          isPrimary: true,
        },
        {
          url: 'https://cdn.example.com/2.jpg',
          role: 'detail',
          label: '상세 이미지 2',
          sortOrder: 1,
        },
      ],
    } as any);

    expect(tx.masterProduct.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rawData: expect.objectContaining({
          title: 'Uploaded toy',
          productName: 'Uploaded toy',
          category: '초등학생 대상 키즈 상품',
          images: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
          imageUrls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
          image_urls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
          collected_from: 'detail-page-generator',
        }),
      }),
    });
  });
});
