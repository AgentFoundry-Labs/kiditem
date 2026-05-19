import { describe, expect, it, vi } from 'vitest';
import { PostPromotionGenerationRepositoryAdapter } from '../post-promotion-generation.repository.adapter';

describe('PostPromotionGenerationRepositoryAdapter', () => {
  it('loads active master context with ordered images', async () => {
    const prisma = {
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'master-1',
          name: 'Test Master',
          category: 'Kids/Toys',
          description: 'Lovely test toy',
          imageUrl: 'https://cdn.example.com/master/primary.jpg',
        }),
      },
      masterProductImage: {
        findMany: vi.fn().mockResolvedValue([
          { url: 'https://cdn.example.com/master/primary.jpg' },
          { url: 'https://cdn.example.com/master/extra1.jpg' },
        ]),
      },
    };
    const repository = new PostPromotionGenerationRepositoryAdapter(prisma as never);

    await expect(repository.findMasterContext({
      organizationId: 'org-1',
      masterId: 'master-1',
    })).resolves.toMatchObject({
      id: 'master-1',
      imageUrls: [
        'https://cdn.example.com/master/primary.jpg',
        'https://cdn.example.com/master/extra1.jpg',
      ],
    });

    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { id: 'master-1', organizationId: 'org-1', isDeleted: false },
      select: expect.any(Object),
    });
    expect(prisma.masterProductImage.findMany).toHaveBeenCalledWith({
      where: { masterId: 'master-1', organizationId: 'org-1', isDeleted: false },
      orderBy: { sortOrder: 'asc' },
      select: { url: true },
    });
  });

  it('creates thumbnail generation plus its input image', async () => {
    const prisma = {
      thumbnailGeneration: {
        create: vi.fn().mockResolvedValue({ id: 'thumbnail-generation-1' }),
      },
      thumbnailGenerationInputImage: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const repository = new PostPromotionGenerationRepositoryAdapter(prisma as never);

    await repository.createThumbnailGeneration({
      organizationId: 'org-1',
      masterId: 'master-1',
      originalUrl: 'https://cdn.example.com/master/primary.jpg',
      inputMeta: { trigger: 'post_promotion' },
      inputImage: {
        url: 'https://cdn.example.com/master/primary.jpg',
        storageKey: 'master/primary.jpg',
        role: 'product',
        label: 'Product photo',
        sortOrder: 0,
        source: 'master_image',
        mimeType: 'image/jpeg',
        fileSize: 12345,
      },
    });

    expect(prisma.thumbnailGeneration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        masterId: 'master-1',
        status: 'pending',
        method: 'generate',
      }),
      select: { id: true },
    });
    expect(prisma.thumbnailGenerationInputImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        generationId: 'thumbnail-generation-1',
        role: 'product',
      }),
    });
  });
});
