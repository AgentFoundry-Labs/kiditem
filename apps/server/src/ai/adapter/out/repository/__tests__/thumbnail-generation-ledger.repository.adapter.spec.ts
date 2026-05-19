import { describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../thumbnail-generation-ledger.repository.adapter';

const helperMocks = vi.hoisted(() => ({
  createPendingEditJob: vi.fn(),
  lockGenerationForProcessing: vi.fn(),
  applyAgentSuccessResult: vi.fn(),
}));

vi.mock('../thumbnail-generation-ledger.persistence', () => ({
  createPendingEditJob: helperMocks.createPendingEditJob,
  lockGenerationForProcessing: helperMocks.lockGenerationForProcessing,
  applyAgentSuccessResult: helperMocks.applyAgentSuccessResult,
}));

describe('ThumbnailGenerationLedgerRepositoryAdapter', () => {
  it('opens pending editor jobs through the adapter-private Prisma helper', async () => {
    const prisma = {};
    const repository = new ThumbnailGenerationLedgerRepositoryAdapter(prisma as never);
    helperMocks.createPendingEditJob.mockResolvedValueOnce({ id: 'generation-1' });

    await expect(repository.openPendingEditorJob({
      organizationId: 'org-1',
      masterId: 'master-1',
      originalUrl: 'https://cdn.example.com/source.jpg',
      method: 'generate',
      inputMeta: { mode: 'edit' },
      editAnalysis: null,
      triggeredByUserId: 'user-1',
    })).resolves.toEqual({ id: 'generation-1' });

    expect(helperMocks.createPendingEditJob).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        organizationId: 'org-1',
        inputMeta: { mode: 'edit' },
      }),
    );
  });

  it('claims and projects Agent OS output through use-case-level methods', async () => {
    const prisma = {};
    const repository = new ThumbnailGenerationLedgerRepositoryAdapter(prisma as never);
    helperMocks.lockGenerationForProcessing.mockResolvedValueOnce({
      fromStatus: 'pending',
      fromPhase: null,
      attemptNumber: 1,
    });
    helperMocks.applyAgentSuccessResult.mockResolvedValueOnce({
      fromStatus: 'running',
      fromPhase: null,
      attemptNumber: 1,
    });

    await expect(repository.claimForAgentProjection({
      generationId: 'generation-1',
      organizationId: 'org-1',
    })).resolves.toEqual({
      fromStatus: 'pending',
      fromPhase: null,
      attemptNumber: 1,
    });
    await expect(repository.projectAgentSuccess({
      generationId: 'generation-1',
      organizationId: 'org-1',
      candidates: [],
      inputMeta: { agentRequestId: 'request-1' },
    })).resolves.toEqual({
      fromStatus: 'running',
      fromPhase: null,
      attemptNumber: 1,
    });

    expect(helperMocks.lockGenerationForProcessing).toHaveBeenCalledWith(
      prisma,
      'generation-1',
      'org-1',
    );
    expect(helperMocks.applyAgentSuccessResult).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        generationId: 'generation-1',
        organizationId: 'org-1',
        inputMeta: { agentRequestId: 'request-1' },
      }),
    );
  });

  it('reads parent alert metadata with organization scope', async () => {
    const prisma = {
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          inputMeta: {
            productGeneration: {
              mode: 'parent',
              productGenerationBatchId: 'batch-1',
              parentOperationKey: 'product-generation:batch-1',
              childKind: 'thumbnail',
            },
          },
        }),
      },
    };
    const repository = new ThumbnailGenerationLedgerRepositoryAdapter(prisma as never);

    await expect(repository.readParentAlertLink({
      organizationId: 'org-1',
      generationId: 'generation-1',
    })).resolves.toEqual({
      mode: 'parent',
      batchId: 'batch-1',
      parentOperationKey: 'product-generation:batch-1',
      childKind: 'thumbnail',
    });

    expect(prisma.thumbnailGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: 'generation-1', organizationId: 'org-1', isDeleted: false },
      select: { inputMeta: true },
    });
  });

  it('reads sourcing candidate job context with organization scope', async () => {
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'candidate-1',
          name: '후보',
          category: '완구',
          images: [],
        }),
      },
    };
    const repository = new ThumbnailGenerationLedgerRepositoryAdapter(prisma as never);

    await expect(repository.findSourceCandidateForJob('candidate-1', 'org-1')).resolves.toEqual({
      id: 'candidate-1',
      name: '후보',
      category: '완구',
      images: [],
    });

    expect(prisma.sourcingCandidate.findFirst).toHaveBeenCalledWith({
      where: { id: 'candidate-1', organizationId: 'org-1', isDeleted: false },
      select: {
        id: true,
        name: true,
        category: true,
        images: {
          where: { isDeleted: false },
          select: { id: true, url: true, storageKey: true },
        },
      },
    });
  });
});
