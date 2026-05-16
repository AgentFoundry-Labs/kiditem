import { describe, expect, it, vi } from 'vitest';
import { GeneratedContentCandidateService } from '../generated-content-candidate.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '99999999-9999-9999-9999-999999999999';
const CANDIDATE_ID = '66666666-6666-4666-8666-666666666666';

describe('GeneratedContentCandidateService', () => {
  it('reuses the same self-collected detail-page candidate for the same normalized title', async () => {
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: CANDIDATE_ID,
          name: '키즈 텀블러',
          category: '완구',
        }),
        create: vi.fn(),
      },
    };
    const service = new GeneratedContentCandidateService(prisma as never);

    await expect(service.ensureSelfCollectedDetailPageCandidate({
      organizationId: ORGANIZATION_ID,
      triggeredByUserId: USER_ID,
      title: '  키즈   텀블러  ',
      category: '완구',
      description: '아이들이 쓰기 좋은 텀블러',
      imageUrls: ['https://example.com/input.jpg'],
      rawData: { rawTitle: '키즈 텀블러' },
    })).resolves.toEqual({
      id: CANDIDATE_ID,
      name: '키즈 텀블러',
      category: '완구',
    });

    expect(prisma.sourcingCandidate.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        sourceUrl: 'kiditem://self-collected/detail-page/%ED%82%A4%EC%A6%88%ED%85%80%EB%B8%94%EB%9F%AC',
        sourcePlatform: 'kiditem-detail-page',
        status: 'sourced',
        isDeleted: false,
      },
      select: { id: true, name: true, category: true },
    });
    expect(prisma.sourcingCandidate.create).not.toHaveBeenCalled();
  });

  it('creates a self-collected detail-page candidate with deterministic sourceUrl and candidate images', async () => {
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: CANDIDATE_ID,
          name: '키즈 텀블러',
          category: '완구',
        }),
      },
    };
    const service = new GeneratedContentCandidateService(prisma as never);

    await service.ensureSelfCollectedDetailPageCandidate({
      organizationId: ORGANIZATION_ID,
      triggeredByUserId: USER_ID,
      title: '키즈 텀블러',
      category: '완구',
      description: '아이들이 쓰기 좋은 텀블러',
      imageUrls: ['https://example.com/input.jpg', 'https://example.com/input.jpg', 'https://example.com/detail.jpg'],
      rawData: { rawTitle: '키즈 텀블러' },
    });

    expect(prisma.sourcingCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceUrl: 'kiditem://self-collected/detail-page/%ED%82%A4%EC%A6%88%ED%85%80%EB%B8%94%EB%9F%AC',
        sourcePlatform: 'kiditem-detail-page',
        rawData: expect.objectContaining({
          source: 'detail_page_generation',
          imageUrls: ['https://example.com/input.jpg', 'https://example.com/detail.jpg'],
          image_urls: ['https://example.com/input.jpg', 'https://example.com/detail.jpg'],
        }),
        name: '키즈 텀블러',
        description: '아이들이 쓰기 좋은 텀블러',
        category: '완구',
        thumbnailUrl: 'https://example.com/input.jpg',
        imageUrl: 'https://example.com/input.jpg',
        triggeredByUserId: USER_ID,
        status: 'sourced',
        images: {
          create: [
            expect.objectContaining({
              organizationId: ORGANIZATION_ID,
              url: 'https://example.com/input.jpg',
              role: 'product',
              sortOrder: 0,
              source: 'detail-page-generation-input',
              isPrimary: true,
            }),
            expect.objectContaining({
              organizationId: ORGANIZATION_ID,
              url: 'https://example.com/detail.jpg',
              role: 'detail',
              sortOrder: 1,
              source: 'detail-page-generation-input',
              isPrimary: false,
            }),
          ],
        },
      }),
      select: { id: true, name: true, category: true },
    });
  });
});
