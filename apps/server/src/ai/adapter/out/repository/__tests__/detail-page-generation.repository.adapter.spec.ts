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
        sourceCandidateId: null,
        triggeredByUserId: 'user-1',
        templateId: 'bold-vertical',
        rawInput: { rawTitle: '상품' } as never,
        imageUrls: ['https://cdn.example.com/input.jpg'],
        rawTitle: '상품',
        sourceReferences: [],
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
        data: [expect.objectContaining({ contentAssetId: 'asset-1', contentGenerationId: 'generation-1' })],
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
});
