import { describe, expect, it, vi } from 'vitest';
import { ProductGenerationContextRepositoryAdapter } from '../product-generation-context.repository.adapter';

describe('ProductGenerationContextRepositoryAdapter', () => {
  it('loads sourcing candidate context with active images in sort order', async () => {
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'candidate-1',
          name: '자석 다트게임',
          category: '완구',
          description: '안전한 다트 보드',
          thumbnailUrl: 'https://example.com/main.jpg',
          images: [{ url: 'https://example.com/main.jpg', sortOrder: 0 }],
        }),
      },
    };
    const repository = new ProductGenerationContextRepositoryAdapter(prisma as never);

    await repository.findCandidate({
      organizationId: 'org-1',
      candidateId: 'candidate-1',
    });

    expect(prisma.sourcingCandidate.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'candidate-1',
        organizationId: 'org-1',
        isDeleted: false,
      },
      select: expect.objectContaining({
        images: {
          where: { isDeleted: false },
          orderBy: { sortOrder: 'asc' },
          select: { url: true, sortOrder: true },
        },
      }),
    });
  });
});
