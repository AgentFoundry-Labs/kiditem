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

/** 수집은 후보 한 줄과 그 판매상품 초안 한 줄을 만든다(KID-310). */
const draftsFake = () => ({
  createFromSource: vi.fn().mockResolvedValue({ salesProductId: 'draft-1' }),
  findDraftIdForSource: vi.fn(),
  findDraftIdsForSources: vi.fn(),
  getDraft: vi.fn(),
  retireForSource: vi.fn(),
}) as never;

describe('SourcingCandidateRepositoryAdapter', () => {
  it('retries sourced candidate create races by updating the concurrent candidate', async () => {
    const tx1 = {
      $queryRaw: vi.fn().mockResolvedValue([{ lock: 'locked' }]),
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const tx2 = {
      $queryRaw: vi.fn().mockResolvedValue([{ lock: 'locked' }]),
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
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never, undefined, undefined, draftsFake());

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

  it('serializes the shared source identity before returning the same candidate without another image create', async () => {
    let candidate: ReturnType<typeof candidateRow> | null = null;
    let imageCount = 0;
    const tx = {
      $queryRaw: vi.fn(async () => [{ lock: 'locked' }]),
      sourcingCandidate: {
        findFirst: vi.fn(async () => candidate && { id: candidate.id, rawData: candidate.rawData }),
        create: vi.fn(async ({ data }) => {
          candidate = candidateRow({
            id: 'candidate-1',
            sourceIdentityHash: data.sourceIdentityHash,
            externalOfferId: data.externalOfferId,
            variantKeyNormalized: data.variantKeyNormalized,
            rawData: data.rawData,
          });
          return candidate;
        }),
        update: vi.fn(async ({ data }) => {
          candidate = candidateRow({
            id: candidate!.id,
            sourceIdentityHash: data.sourceIdentityHash,
            externalOfferId: data.externalOfferId,
            variantKeyNormalized: data.variantKeyNormalized,
            rawData: data.rawData,
          });
          return candidate;
        }),
      },
      candidateImage: {
        count: vi.fn(async () => imageCount),
        createMany: vi.fn(async ({ data }) => {
          imageCount += data.length;
          return { count: data.length };
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never, undefined, undefined, draftsFake());
    const input = {
      organizationId: 'org-1',
      idempotencyKey: 'candidate-owner-key',
      sourceUrl: 'https://detail.1688.com/offer/1.html',
      sourcePlatform: 'ALIBABA_1688',
      externalOfferId: '1',
      variantKeyNormalized: '',
      sourceIdentityHash: 'supplier-offer-1',
      rawData: { source: 'agent_final_scrape', contentHash: 'a'.repeat(64) },
      name: 'Toy candidate', description: '', category: null, tags: [],
      thumbnailUrl: 'https://cdn.example.com/item.jpg', imageUrl: 'https://cdn.example.com/item.jpg',
      costCny: 12.5, triggeredByUserId: 'user-1',
      images: [{
        url: 'https://cdn.example.com/item.jpg', role: 'product', label: null,
        sortOrder: 0, source: 'agent-final-scrape', isPrimary: true,
      }],
    };

    const first = await repository.upsertSourced(input);
    const replay = await repository.upsertSourced({ ...input, rawData: { ...input.rawData } });

    expect(replay.id).toBe(first.id);
    expect(tx.sourcingCandidate.create).toHaveBeenCalledOnce();
    expect(tx.candidateImage.createMany).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(imageCount).toBe(1);
  });

  it('bounds receipt recovery after a persistent unique conflict instead of recursing forever', async () => {
    const unique = { code: 'P2002' };
    const prisma = {
      $transaction: vi.fn()
        .mockRejectedValueOnce(unique)
        .mockRejectedValueOnce(unique)
        .mockRejectedValueOnce(new Error('must not make a third receipt attempt')),
    };
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never, undefined, undefined, draftsFake());

    await expect(repository.upsertSourcedWithIdempotencyReceipt(receiptInput()))
      .rejects.toBe(unique);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('finds only an active sourced candidate by source URL', async () => {
    const prisma = {
      sourcingCandidate: { findFirst: vi.fn().mockResolvedValue(candidateRow()) },
    };
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never, undefined, undefined, draftsFake());

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
    const channelListings = registeredCandidateIds([]);
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never, undefined, channelListings as never, draftsFake());

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

  it('excludes candidates with an active listing using the Channels owner read', async () => {
    const prisma = listPrisma();
    const channelListings = registeredCandidateIds(['listed-candidate']);
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never, undefined, channelListings as never, draftsFake());

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
        id: { notIn: ['listed-candidate'] },
      }),
    }));
    expect(channelListings.readRegisteredCandidateIds).toHaveBeenCalledWith(expect.any(Object), {
      organizationId: 'org-1',
    });
    expect(prisma.sourcingCandidate.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { notIn: ['listed-candidate'] } }),
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
        })),
      },
    };
    const candidateRegistrations = {
      readForCandidates: vi.fn().mockResolvedValue(new Map([
        ['candidate-1', { preparations: [preparation], registrationState: 'registered' }],
      ])),
    };
    const repository = new SourcingCandidateRepositoryAdapter(
      prisma as never,
      candidateRegistrations as never,
      registeredCandidateIds([]) as never,
    );

    const row = await repository.findById('candidate-1', 'org-1');

    expect(prisma.sourcingCandidate.findFirst).toHaveBeenCalledWith({
      where: { id: 'candidate-1', organizationId: 'org-1', isDeleted: false },
      include: {
        images: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
      },
    });
    expect(candidateRegistrations.readForCandidates).toHaveBeenCalledWith(
      'org-1',
      ['candidate-1'],
    );
    expect(row?.registrationTarget).toEqual(preparation);
    expect(row?.productPreparations).toEqual([preparation]);
    expect(row?.registrationTarget).not.toHaveProperty('masterId');
    // 초안 행은 'product_registered' 라고 말하지만 근거는 실행 장부다.
    expect(row?.registrationState).toBe('registered');
  });

  it('hydrates a sourced page through the registration owner while preserving page order and total', async () => {
    const rows = [
      candidateRow({ id: 'candidate-1', images: [] }),
      candidateRow({ id: 'candidate-2', name: 'Second toy', images: [] }),
    ];
    const tx = {
      sourcingCandidate: {
        count: vi.fn().mockResolvedValue(4),
        findMany: vi.fn().mockResolvedValue(rows),
      },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn(async (operation: unknown) => {
        if (typeof operation === 'function') return operation(tx);
        return Promise.all(operation as Array<Promise<unknown>>);
      }),
    };
    const candidateRegistrations = {
      readForCandidates: vi.fn().mockResolvedValue(new Map([
        ['candidate-1', {
          preparations: [],
          registrationState: 'none',
        }],
        ['candidate-2', {
          preparations: [{
            id: 'prep-2',
            sourceCandidateId: 'candidate-2',
            channelAccountId: 'account-2',
            sourceContentWorkspaceId: null,
            channelListingId: null,
            displayName: null,
            status: 'draft',
            selectedThumbnailUrl: null,
            selectedThumbnailGenerationId: null,
            selectedThumbnailGenerationCandidateId: null,
            selectedDetailPageArtifactId: null,
            selectedDetailPageRevisionId: null,
            selectedDetailPageGenerationId: null,
            registrationInput: {},
            createdAt: new Date('2026-05-17T00:00:00.000Z'),
            updatedAt: new Date('2026-05-17T00:00:00.000Z'),
          }],
          registrationState: 'preparing',
        }],
      ])),
    };
    const repository = new SourcingCandidateRepositoryAdapter(
      prisma as never,
      candidateRegistrations as never,
      registeredCandidateIds([]) as never,
    );

    const page = await repository.listSourced({
      organizationId: 'org-1',
      page: 2,
      limit: 2,
      sort: 'oldest',
    });

    expect(page.total).toBe(4);
    expect(page.items.map((item) => item.id)).toEqual(['candidate-1', 'candidate-2']);
    expect(page.items[1]?.registrationTarget?.sourceCandidateId).toBe('candidate-2');
    expect(page.items[1]?.registrationState).toBe('preparing');
    expect(prisma.sourcingCandidate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { createdAt: 'asc' },
      skip: 2,
      take: 2,
      where: expect.objectContaining({
        organizationId: 'org-1',
        status: 'sourced',
      }),
    }));
    expect(candidateRegistrations.readForCandidates).toHaveBeenCalledWith(
      'org-1',
      ['candidate-1', 'candidate-2'],
    );
  });

});

function receiptInput() {
  return {
    organizationId: 'org-1',
    capabilityKey: 'sourcing.ingestCandidate',
    idempotencyKey: 'owner:attempt:ingest',
    requestHash: 'a'.repeat(64),
    sourceUrl: 'https://detail.1688.com/offer/1.html',
    sourcePlatform: 'ALIBABA_1688',
    rawData: { source: 'agent_final_scrape' },
    name: 'Toy candidate',
    description: '',
    category: null,
    tags: [],
    thumbnailUrl: null,
    imageUrl: null,
    costCny: null,
    triggeredByUserId: 'user-1',
    images: [],
  };
}

function listPrisma() {
  const prisma = {
    sourcingCandidate: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (operation: unknown) => {
      if (typeof operation === 'function') return operation(prisma);
      return Promise.all(operation as Array<Promise<unknown>>);
    }),
  };
  return prisma;
}

function registeredCandidateIds(ids: string[]) {
  return { readRegisteredCandidateIds: vi.fn().mockResolvedValue(ids) };
}
