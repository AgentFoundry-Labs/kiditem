import { describe, expect, it, vi } from 'vitest';
import { ProductPreparationRepositoryAdapter } from './candidate-registration.repository.adapter';
import type { PrismaService } from '../../../../prisma/prisma.service';

describe('ProductPreparationRepositoryAdapter candidate reads', () => {
  it('keeps the newest execution per preparation and orders candidate state by newest execution', async () => {
    const preparationRows = [
      preparationRow({
        id: 'preparation-1',
        salesProductId: 'draft-1',
        updatedAt: new Date('2026-08-01T00:02:00.000Z'),
        displayName: null,
      }),
      preparationRow({
        id: 'preparation-2',
        salesProductId: 'draft-1',
        updatedAt: new Date('2026-08-01T00:01:00.000Z'),
      }),
    // Prisma's predicate should exclude this row. Keep the guard in the
      // adapter as well because this is a cross-owner projection boundary.
      preparationRow({
        id: 'preparation-foreign',
        salesProductId: 'draft-foreign',
      }),
    ];
    const executionRows = [
      // The reader returns newest first across all preparations.
      executionRow({
        id: 'execution-2-new',
        registrationTargetId: 'preparation-2',
        status: 'succeeded',
        providerOutcome: 'succeeded',
        channelListingId: 'listing-2',
        createdAt: new Date('2026-08-01T00:04:00.000Z'),
      }),
      executionRow({
        id: 'execution-1-new',
        registrationTargetId: 'preparation-1',
        status: 'failed',
        providerOutcome: 'definitive_failure',
        createdAt: new Date('2026-08-01T00:03:00.000Z'),
      }),
      executionRow({
        id: 'execution-1-old',
        registrationTargetId: 'preparation-1',
        status: 'succeeded',
        providerOutcome: 'succeeded',
        channelListingId: 'old-listing',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ];
    const prisma = {
      salesProduct: {
        findMany: vi.fn().mockResolvedValue([{ id: 'draft-1', sourceCandidateId: 'candidate-1' }]),
      },
      registrationTarget: {
        findMany: vi.fn().mockResolvedValue(preparationRows),
      },
      productRegistrationExecution: {
        findMany: vi.fn().mockResolvedValue(executionRows),
      },
    };
    const repository = new ProductPreparationRepositoryAdapter(
      prisma as unknown as PrismaService,
      undefined as never,
      undefined as never,
    );

    const result = await repository.readForCandidates('org-1', [
      'candidate-1',
      'candidate-1',
    ]);
    const candidate = result.get('candidate-1');

    expect(prisma.salesProduct.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1', sourceCandidateId: { in: ['candidate-1'] } },
    }));
    expect(prisma.registrationTarget.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: 'org-1',
        salesProductId: { in: ['draft-1'] },
        archivedAt: null,
      },
    }));
    expect(prisma.productRegistrationExecution.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: 'org-1',
        registrationTargetId: { in: ['preparation-1', 'preparation-2'] },
      },
    }));
    expect(candidate?.preparations).toHaveLength(2);
    expect(candidate?.preparations[0]).toMatchObject({
      id: 'preparation-1',
      salesProductId: 'draft-1',
      sourceCandidateId: 'candidate-1',
      displayName: null,
      channelListingId: null,
      status: 'failed',
    });
    expect(candidate?.preparations[1]).toMatchObject({
      id: 'preparation-2',
      channelListingId: 'listing-2',
      status: 'registered',
    });
    // The old succeeded fact must not overwrite the newer failed fact, and
    // the newer preparation execution must drive the candidate aggregate.
    expect(candidate?.registrationState).toBe('registered');
    expect(result.has('candidate-foreign')).toBe(false);
    expect(result.has('candidate-1')).toBe(true);
  });

  it('returns empty owner-scoped entries without querying executions when no preparation matches', async () => {
    const prisma = {
      salesProduct: { findMany: vi.fn().mockResolvedValue([]) },
      registrationTarget: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      productRegistrationExecution: {
        findMany: vi.fn(),
      },
    };
    const repository = new ProductPreparationRepositoryAdapter(
      prisma as unknown as PrismaService,
      undefined as never,
      undefined as never,
    );

    const result = await repository.readForCandidates('org-1', ['candidate-1']);

    expect(result).toEqual(new Map([
      ['candidate-1', { preparations: [], registrationState: 'none' }],
    ]));
    expect(prisma.productRegistrationExecution.findMany).not.toHaveBeenCalled();
  });
});

function preparationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'preparation-1',
    salesProductId: 'draft-1',
    channelAccountId: 'account-1',
    displayName: 'Toy',
    archivedAt: null,
    selectedThumbnailUrl: null,
    selectedThumbnailGenerationId: null,
    selectedThumbnailGenerationCandidateId: null,
    selectedDetailPageArtifactId: null,
    selectedDetailPageRevisionId: null,
    selectedDetailPageGenerationId: null,
    registrationInput: {},
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function executionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'execution-1',
    registrationTargetId: 'preparation-1',
    channelAccountId: 'account-1',
    channelListingId: null,
    executionKind: 'external_wing',
    status: 'failed',
    providerOutcome: 'definitive_failure',
    providerSubmissionId: null,
    externalListingId: null,
    resultJson: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

/**
 * 몰에 나갈 대표 사진은 그 판매상품의 사진이어야 한다(KID-310). AI 쪽 검증이 약해진 자리를
 * Channels 가 받는다 — 손으로 적은 주소가 몰로 나가면 엉뚱한 상품이 올라간다.
 */
describe('ProductPreparationRepositoryAdapter selected thumbnail fence', () => {
  const TARGET = { id: 'target-1', organizationId: 'org-1', salesProductId: 'draft-1', channelAccountId: 'account-1',
    displayName: 'Toy', archivedAt: null, registrationInput: {}, updatedAt: new Date('2026-09-23T00:00:00.000Z'),
    selectedThumbnailUrl: null, selectedThumbnailGenerationId: null, selectedThumbnailGenerationCandidateId: null,
    selectedDetailPageArtifactId: null, selectedDetailPageRevisionId: null, selectedDetailPageGenerationId: null };

  function setup(allowedUrls: string[]) {
    const tx = {
      registrationTarget: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ salesProduct: { sourceCandidateId: null } })
          .mockResolvedValue(TARGET),
        update: vi.fn().mockResolvedValue(TARGET),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      productRegistrationExecution: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: vi.fn(async (run: (client: unknown) => Promise<unknown>) => run(tx)),
      salesProduct: { findFirst: vi.fn().mockResolvedValue({ imageUrls: [] }) },
    };
    const thumbnails = { listGeneratedThumbnailUrls: vi.fn().mockResolvedValue(allowedUrls) };
    const repository = new ProductPreparationRepositoryAdapter(
      prisma as never,
      { lock: vi.fn(), requireActive: vi.fn() } as never,
      { findSalesProductWorkspaceId: vi.fn().mockResolvedValue(null) } as never,
      thumbnails as never,
    );
    return { repository, tx, thumbnails };
  }

  const edit = (selectedThumbnailUrl: string) => ({
    organizationId: 'org-1',
    preparationId: 'target-1',
    userId: 'user-1',
    command: { kind: 'replace' as const, input: { selectedThumbnailUrl } },
  });

  it('⭐ refuses a thumbnail that belongs to neither the draft nor its generated candidates', async () => {
    const { repository, tx, thumbnails } = setup(['https://cdn.example.com/draft/1.jpg']);

    await expect(repository.replaceDraftInput(edit('https://cdn.example.com/other/9.jpg'), vi.fn() as never))
      .rejects.toThrow('대표 사진');

    expect(thumbnails.listGeneratedThumbnailUrls).toHaveBeenCalledWith('org-1', 'draft-1');
    expect(tx.registrationTarget.update).not.toHaveBeenCalled();
  });

  it('takes a thumbnail this product owns', async () => {
    const { repository, tx } = setup(['https://cdn.example.com/draft/1.jpg']);

    await repository.replaceDraftInput(
      edit('https://cdn.example.com/draft/1.jpg'),
      vi.fn().mockResolvedValue({
        selectedThumbnailUrl: 'https://cdn.example.com/draft/1.jpg',
        selectedThumbnailGenerationId: null, selectedThumbnailGenerationCandidateId: null,
        selectedDetailPageArtifactId: null, selectedDetailPageRevisionId: null, selectedDetailPageGenerationId: null,
      }) as never,
    );

    expect(tx.registrationTarget.update).toHaveBeenCalled();
  });
});
