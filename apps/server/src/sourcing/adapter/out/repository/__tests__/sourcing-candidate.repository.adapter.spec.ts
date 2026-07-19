import { describe, expect, it, vi } from 'vitest';
import { SourcingCandidateRepositoryAdapter } from '../sourcing-candidate.repository.adapter';

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate-1',
    organizationId: 'org-1',
    sourceUrl: 'https://1688.com/item/1',
    sourcePlatform: 'ALIBABA_1688',
    rawData: {},
    name: 'Toy candidate',
    description: 'description',
    category: null,
    tags: [],
    thumbnailUrl: null,
    imageUrl: null,
    costCny: null,
    status: 'sourced',
    rejectedReason: null,
    rejectedAt: null,
    rejectedByUserId: null,
    triggeredByUserId: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:01:00.000Z'),
    ...overrides,
  };
}

describe('SourcingCandidateRepositoryAdapter', () => {
  it('retries sourced candidate create races by updating the concurrent candidate', async () => {
    const tx1 = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const tx2 = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: 'candidate-1', rawData: { old: true } }),
        update: vi.fn().mockResolvedValue(candidateRow({
          rawData: { old: true, title: 'Updated toy' },
          name: 'Updated toy',
        })),
      },
      candidateImage: {
        count: vi.fn().mockResolvedValue(0),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn()
        .mockImplementationOnce(async (callback: (tx: typeof tx1) => Promise<unknown>) => callback(tx1))
        .mockImplementationOnce(async (callback: (tx: typeof tx2) => Promise<unknown>) => callback(tx2)),
    };
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never);

    const row = await repository.upsertSourced({
      organizationId: 'org-1',
      sourceUrl: 'https://1688.com/item/1',
      sourcePlatform: 'ALIBABA_1688',
      rawData: { title: 'Updated toy' },
      name: 'Updated toy',
      description: 'updated',
      category: null,
      tags: [],
      thumbnailUrl: 'https://cdn.example.com/item.jpg',
      imageUrl: 'https://cdn.example.com/item.jpg',
      costCny: 12.5,
      triggeredByUserId: 'user-1',
      images: [{
        url: 'https://cdn.example.com/item.jpg',
        role: 'product',
        label: null,
        sortOrder: 0,
        source: 'sourcing-scrape-url',
        isPrimary: true,
      }],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx2.sourcingCandidate.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'candidate-1' },
      data: expect.objectContaining({
        rawData: { old: true, title: 'Updated toy' },
        name: 'Updated toy',
      }),
    }));
    expect(row).toMatchObject({ id: 'candidate-1', status: 'sourced' });
  });

  it('finds only an active sourced candidate by source URL', async () => {
    const prisma = {
      sourcingCandidate: { findFirst: vi.fn().mockResolvedValue(candidateRow()) },
    };
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never);

    const result = await repository.findActiveBySourceUrl({
      organizationId: 'org-1',
      sourceUrl: 'https://1688.com/item/1',
    });

    expect(prisma.sourcingCandidate.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        sourceUrl: 'https://1688.com/item/1',
        isDeleted: false,
        status: 'sourced',
      },
      orderBy: { updatedAt: 'desc' },
    });
    expect(result).toMatchObject({ id: 'candidate-1', status: 'sourced' });
  });

  it('lists only requested sourcing platforms', async () => {
    const prisma = listPrisma();
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never);

    await repository.listSourced({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      sort: 'newest',
      sourcePlatforms: ['ALIBABA_1688', 'ALIBABA'],
    });

    expect(prisma.sourcingCandidate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        sourcePlatform: { in: ['ALIBABA_1688', 'ALIBABA'] },
      }),
    }));
  });

  it('keeps only sourced candidates without an active ChannelProduct in the inbox', async () => {
    const prisma = listPrisma();
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never);

    await repository.listSourced({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      sort: 'newest',
      sourcePlatforms: ['ALIBABA_1688'],
    });

    expect(prisma.sourcingCandidate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        status: 'sourced',
        channelListings: { none: { organizationId: 'org-1', isActive: true } },
      }),
    }));
  });

  it('returns the latest product preparation with final registration identities', async () => {
    const preparation = {
      id: 'prep-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      sourceContentWorkspaceId: 'source-workspace-1',
      channelListingId: 'listing-1',
      displayName: 'Toy candidate',
      status: 'product_registered',
      selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
      selectedThumbnailGenerationId: 'thumb-generation-1',
      selectedThumbnailGenerationCandidateId: 'thumb-candidate-1',
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
      registrationInput: { category: '완구' },
      createdAt: new Date('2026-05-17T00:30:00.000Z'),
      updatedAt: new Date('2026-05-17T01:00:00.000Z'),
    };
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue(candidateRow({
          images: [],
          productPreparations: [preparation],
        })),
      },
    };
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never);

    const row = await repository.findById('candidate-1', 'org-1');

    expect(prisma.sourcingCandidate.findFirst).toHaveBeenCalledWith({
      where: { id: 'candidate-1', organizationId: 'org-1', isDeleted: false },
      include: {
        images: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
        productPreparations: {
          where: { organizationId: 'org-1', isDeleted: false },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
    expect(row?.productPreparation).toEqual(preparation);
    expect(row?.productPreparations).toEqual([preparation]);
    expect(row?.productPreparation).not.toHaveProperty('masterId');
  });

  describe('updateManualBasics', () => {
    it('merges into prior manualBasics and syncs real columns, org-scoped', async () => {
      const prisma = {
        sourcingCandidate: {
          findFirst: vi.fn().mockResolvedValue({
            rawData: { source_platform: 'ALIBABA_1688', manualBasics: { keywords: ['기존키워드'], salePrice: 4900 } },
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const repository = new SourcingCandidateRepositoryAdapter(prisma as never);

      const ok = await repository.updateManualBasics({
        organizationId: 'org-1',
        candidateId: 'candidate-1',
        basics: { name: '새 상품명', category: '문구 > 키링', description: '설명', tags: ['태그'], salePrice: 5900 },
      });

      expect(ok).toBe(true);
      // 조회는 id+org+isDeleted 로 스코프(IDOR 방지).
      expect(prisma.sourcingCandidate.findFirst).toHaveBeenCalledWith({
        where: { id: 'candidate-1', organizationId: 'org-1', isDeleted: false },
        select: { rawData: true },
      });
      const updateArg = prisma.sourcingCandidate.updateMany.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'candidate-1', organizationId: 'org-1', isDeleted: false });
      // 부분 저장이 기존 키워드를 지우지 않고 salePrice 만 갱신한다.
      expect(updateArg.data.rawData.manualBasics).toEqual({
        keywords: ['기존키워드'],
        salePrice: 5900,
        name: '새 상품명',
        category: '문구 > 키링',
        description: '설명',
        tags: ['태그'],
      });
      // 스크랩 원본(source_platform)은 보존된다.
      expect(updateArg.data.rawData.source_platform).toBe('ALIBABA_1688');
      // 카드/헤더가 읽는 실컬럼도 함께 갱신한다.
      expect(updateArg.data.name).toBe('새 상품명');
      expect(updateArg.data.category).toBe('문구 > 키링');
      expect(updateArg.data.description).toBe('설명');
      expect(updateArg.data.tags).toEqual(['태그']);
    });

    it('returns false without writing when the candidate is missing', async () => {
      const prisma = {
        sourcingCandidate: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn(),
        },
      };
      const repository = new SourcingCandidateRepositoryAdapter(prisma as never);

      const ok = await repository.updateManualBasics({
        organizationId: 'org-1',
        candidateId: 'missing',
        basics: { salePrice: 1000 },
      });

      expect(ok).toBe(false);
      expect(prisma.sourcingCandidate.updateMany).not.toHaveBeenCalled();
    });
  });
});

function listPrisma() {
  const prisma = {
    sourcingCandidate: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
  return prisma;
}
