import { describe, expect, it, vi } from 'vitest';
import { DetailPageGenerationRepositoryAdapter } from '../detail-page-generation.repository.adapter';

describe('DetailPageGenerationRepositoryAdapter', () => {
  it('atomically creates the generation ledger, provenance, and held direct job', async () => {
    const tx = {
      contentGenerationGroup: {
        create: vi.fn().mockResolvedValue({ id: 'group-1' }),
      },
      contentGeneration: {
        create: vi.fn().mockResolvedValue({
          id: 'generation-1',
          status: 'PROCESSING',
          generationGroup: { id: 'group-1', contentWorkspaceId: 'workspace-1' },
        }),
      },
      contentGenerationSource: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (scope: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const contentAssets = {
      recordDetailPageInputAssetsInScope: vi.fn().mockResolvedValue([
        { id: 'asset-1', assetKey: 'input:0', role: 'detail', label: 'Input 1' },
      ]),
    };
    const directJobs = {
      createInScope: vi.fn().mockResolvedValue({ id: 'direct-job-1' }),
    };
    const repository = new DetailPageGenerationRepositoryAdapter(
      prisma as never,
      contentAssets as never,
      directJobs as never,
    );

    await expect(
      repository.openProcessingGenerationLedger({
        organizationId: 'org-1',
        contentWorkspaceId: 'workspace-1',
        sourceCandidateId: 'candidate-1',
        triggeredByUserId: 'user-1',
        templateId: 'bold-vertical',
        rawInput: { rawTitle: '상품' } as never,
        imageUrls: ['https://cdn.example.com/input.jpg'],
        rawTitle: '상품',
        sourceReferences: [
          {
            sourceType: 'sourcing_candidate',
            sourceCandidateId: 'candidate-1',
            label: '상품 후보',
          },
        ],
        directJob: {
          jobType: 'detail_page_generate',
          payload: { jobType: 'detail_page_generate' } as never,
          status: 'held',
          scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'created',
        directJobId: 'direct-job-1',
        row: expect.objectContaining({ id: 'generation-1' }),
      }),
    );

    expect(contentAssets.recordDetailPageInputAssetsInScope).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ organizationId: 'org-1', generationGroupId: 'group-1' }),
    );
    expect(tx.contentGenerationSource.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            sourceType: 'sourcing_candidate',
            sourceCandidateId: 'candidate-1',
            contentGenerationId: 'generation-1',
          }),
          expect.objectContaining({
            sourceType: 'input_asset',
            contentAssetId: 'asset-1',
            contentGenerationId: 'generation-1',
          }),
        ],
      }),
    );
    expect(directJobs.createInScope).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: 'org-1',
        sourceResourceId: 'generation-1',
        status: 'held',
      }),
    );
  });

  it('reuses a deterministic product-generation row only when its request hash matches', async () => {
    const existing = {
      id: '11111111-1111-4111-8111-111111111111',
      isDeleted: false,
      generationInput: { productGenerationRequestHash: 'a'.repeat(64) },
    };
    const tx = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      aiDirectJob: {
        findFirst: vi.fn().mockResolvedValue({ id: 'direct-job-1', status: 'pending' }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (scope: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repository = new DetailPageGenerationRepositoryAdapter(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      repository.openProcessingGenerationLedger({
        organizationId: 'org-1',
        contentWorkspaceId: 'workspace-1',
        sourceCandidateId: null,
        triggeredByUserId: 'user-1',
        templateId: 'bold-vertical',
        rawInput: { rawTitle: '상품', productGenerationRequestHash: 'a'.repeat(64) } as never,
        imageUrls: ['https://cdn.example.com/input.jpg'],
        rawTitle: '상품',
        sourceReferences: [],
        productGenerationIdentity: {
          generationId: existing.id,
          requestHash: 'a'.repeat(64),
        },
        directJob: {
          jobType: 'detail_page_generate',
          payload: { jobType: 'detail_page_generate' } as never,
          status: 'held',
          scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
        },
      }),
    ).resolves.toEqual({
      status: 'existing',
      row: existing,
      directJobId: 'direct-job-1',
      releaseRequired: false,
    });

    expect(tx.contentGeneration.findFirst).toHaveBeenCalledWith({
      where: {
        id: existing.id,
        organizationId: 'org-1',
      },
      include: expect.anything(),
    });
  });

  it('rejects a deterministic product-generation row with a different request hash', async () => {
    const tx = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: '11111111-1111-4111-8111-111111111111',
          isDeleted: false,
          generationInput: { productGenerationRequestHash: 'a'.repeat(64) },
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (scope: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repository = new DetailPageGenerationRepositoryAdapter(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      repository.openProcessingGenerationLedger({
        organizationId: 'org-1',
        contentWorkspaceId: 'workspace-1',
        sourceCandidateId: null,
        triggeredByUserId: 'user-1',
        templateId: 'bold-vertical',
        rawInput: { rawTitle: '상품', productGenerationRequestHash: 'b'.repeat(64) } as never,
        imageUrls: ['https://cdn.example.com/input.jpg'],
        rawTitle: '상품',
        sourceReferences: [],
        productGenerationIdentity: {
          generationId: '11111111-1111-4111-8111-111111111111',
          requestHash: 'b'.repeat(64),
        },
        directJob: {
          jobType: 'detail_page_generate',
          payload: { jobType: 'detail_page_generate' } as never,
          status: 'held',
          scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow('product_generation_idempotency_conflict');
  });

  it('re-reads the committed deterministic detail child after a create race', async () => {
    const identity = {
      generationId: '11111111-1111-4111-8111-111111111111',
      requestHash: 'a'.repeat(64),
    };
    const winner = {
      id: identity.generationId,
      isDeleted: false,
      generationInput: { productGenerationRequestHash: identity.requestHash },
      generationGroup: { id: 'group-1', contentWorkspaceId: 'workspace-1' },
    };
    const tx = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue({ code: 'P2002' }),
      },
      contentGenerationGroup: {
        create: vi.fn().mockResolvedValue({ id: 'group-1' }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (scope: typeof tx) => Promise<unknown>) => callback(tx)),
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue(winner),
      },
      aiDirectJob: {
        findFirst: vi.fn().mockResolvedValue({ id: 'direct-job-1', status: 'held' }),
      },
    };
    const repository = new DetailPageGenerationRepositoryAdapter(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(repository.openProcessingGenerationLedger({
      organizationId: 'org-1',
      contentWorkspaceId: 'workspace-1',
      sourceCandidateId: null,
      triggeredByUserId: 'user-1',
      templateId: 'bold-vertical',
      rawInput: { rawTitle: '상품', productGenerationRequestHash: identity.requestHash } as never,
      imageUrls: [],
      rawTitle: '상품',
      sourceReferences: [],
      productGenerationIdentity: identity,
      directJob: {
        jobType: 'detail_page_generate',
        payload: { jobType: 'detail_page_generate' } as never,
        status: 'held',
        scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
      },
    })).resolves.toEqual({
      status: 'existing',
      row: winner,
      directJobId: 'direct-job-1',
      releaseRequired: true,
    });

    expect(prisma.contentGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: identity.generationId, organizationId: 'org-1' },
      include: expect.anything(),
    });
  });
});
