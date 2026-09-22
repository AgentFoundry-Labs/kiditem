import { describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../thumbnail-generation-ledger.repository.adapter';

const helperMocks = vi.hoisted(() => ({
  createPendingEditJob: vi.fn(),
  createPendingSalesProductJob: vi.fn(),
  createPendingStandaloneJob: vi.fn(),
  persistPendingInputImages: vi.fn(),
  lockGenerationForProcessing: vi.fn(),
  applyDirectSuccessResult: vi.fn(),
}));

vi.mock('../thumbnail-generation-ledger.persistence', () => ({
  createPendingEditJob: helperMocks.createPendingEditJob,
  createPendingSalesProductJob: helperMocks.createPendingSalesProductJob,
  createPendingStandaloneJob: helperMocks.createPendingStandaloneJob,
  persistPendingInputImages: helperMocks.persistPendingInputImages,
  lockGenerationForProcessing: helperMocks.lockGenerationForProcessing,
  applyDirectSuccessResult: helperMocks.applyDirectSuccessResult,
}));

describe('ThumbnailGenerationLedgerRepositoryAdapter', () => {
  it('opens pending editor jobs through the adapter-private Prisma helper', async () => {
    const prisma = {};
    const repository = new ThumbnailGenerationLedgerRepositoryAdapter(prisma as never, {} as never, {} as never, {} as never);
    helperMocks.createPendingEditJob.mockResolvedValueOnce({
      id: 'generation-1',
    });

    await expect(
      repository.openPendingEditorJob({
        organizationId: 'org-1',
        contentWorkspaceId: 'workspace-1',
        originalUrl: 'https://cdn.example.com/source.jpg',
        method: 'generate',
        inputMeta: { mode: 'edit' },
        editAnalysis: null,
        triggeredByUserId: 'user-1',
      }),
    ).resolves.toEqual({ id: 'generation-1' });

    expect(helperMocks.createPendingEditJob).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        organizationId: 'org-1',
        inputMeta: { mode: 'edit' },
      }),
    );
  });

  it('atomically opens the generation, records inputs, and creates a held direct job', async () => {
    const tx = {};
    const prisma = {
      $transaction: vi.fn(async (callback: (scope: object) => Promise<unknown>) => callback(tx)),
    };
    const directJobs = {
      createInScope: vi.fn().mockResolvedValue({ id: 'direct-job-1' }),
    };
    const repository = new ThumbnailGenerationLedgerRepositoryAdapter(prisma as never, directJobs as never, {} as never, {} as never);
    helperMocks.createPendingEditJob.mockResolvedValueOnce({ id: 'generation-1' });
    helperMocks.persistPendingInputImages.mockResolvedValueOnce(undefined);

    await expect(
      repository.openPendingDirectGeneration({
        subject: 'editor',
        organizationId: 'org-1',
        contentWorkspaceId: 'workspace-1',
        originalUrl: 'https://cdn.example.com/source.jpg',
        method: 'generate',
        inputMeta: { mode: 'edit' },
        editAnalysis: null,
        triggeredByUserId: 'user-1',
        inputImages: [],
        directJob: {
          jobType: 'thumbnail_generate',
          payload: {
            jobType: 'thumbnail_generate',
            models: { image: 'gemini-image-model' },
            input: { inputs: [], productName: '상품' },
          } as never,
          status: 'held',
          scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
        },
      }),
    ).resolves.toEqual({
      status: 'created',
      generationId: 'generation-1',
      directJobId: 'direct-job-1',
      releaseRequired: true,
    });

    expect(helperMocks.createPendingEditJob).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ organizationId: 'org-1', contentWorkspaceId: 'workspace-1' }),
    );
    expect(helperMocks.persistPendingInputImages).toHaveBeenCalledWith(tx, {
      generationId: 'generation-1',
      organizationId: 'org-1',
      inputImages: [],
    });
    expect(directJobs.createInScope).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: 'org-1',
        sourceResourceId: 'generation-1',
        status: 'held',
      }),
    );
  });

  it('reuses a deterministic product-generation thumbnail and does not release a pending job again', async () => {
    const existing = {
      id: '11111111-1111-4111-8111-111111111111',
      isDeleted: false,
      inputMeta: { productGenerationRequestHash: 'a'.repeat(64) },
    };
    const tx = {
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
      aiDirectJob: {
        findFirst: vi.fn().mockResolvedValue({ id: 'direct-job-1', status: 'pending' }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (scope: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repository = new ThumbnailGenerationLedgerRepositoryAdapter(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      repository.openPendingDirectGeneration({
        subject: 'candidate',
        organizationId: 'org-1',
        sourceCandidateId: 'candidate-1',
        contentWorkspaceId: 'workspace-1',
        originalUrl: 'https://cdn.example.com/source.jpg',
        method: 'generate',
        inputMeta: { mode: 'edit', productGenerationRequestHash: 'a'.repeat(64) },
        triggeredByUserId: 'user-1',
        inputImages: [],
        productGenerationIdentity: {
          generationId: existing.id,
          requestHash: 'a'.repeat(64),
        },
        directJob: {
          jobType: 'thumbnail_generate',
          payload: {
            jobType: 'thumbnail_generate',
            models: { image: 'gemini-image-model' },
            input: { inputs: [], productName: '상품' },
          } as never,
          status: 'held',
          scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
        },
      }),
    ).resolves.toEqual({
      status: 'existing',
      generationId: existing.id,
      directJobId: 'direct-job-1',
      releaseRequired: false,
    });

    expect(tx.thumbnailGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: existing.id, organizationId: 'org-1' },
      select: { id: true, isDeleted: true, inputMeta: true },
    });
  });

  it('persists a new product-generation thumbnail at its deterministic child id', async () => {
    const generationId = '11111111-1111-4111-8111-111111111111';
    const tx = {
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (scope: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const directJobs = {
      createInScope: vi.fn().mockResolvedValue({ id: 'direct-job-1' }),
    };
    helperMocks.createPendingSalesProductJob.mockResolvedValueOnce({ id: generationId });
    helperMocks.persistPendingInputImages.mockResolvedValueOnce(undefined);
    const repository = new ThumbnailGenerationLedgerRepositoryAdapter(prisma as never, directJobs as never, {} as never, {} as never);

    await expect(repository.openPendingDirectGeneration({
      subject: 'sales_product',
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
      productName: '상품',
      contentWorkspaceId: 'workspace-1',
      originalUrl: 'https://cdn.example.com/source.jpg',
      method: 'generate',
      inputMeta: { productGenerationRequestHash: 'a'.repeat(64) },
      triggeredByUserId: 'user-1',
      inputImages: [],
      productGenerationIdentity: { generationId, requestHash: 'a'.repeat(64) },
      directJob: {
        jobType: 'thumbnail_generate',
        payload: {
          jobType: 'thumbnail_generate',
          models: { image: 'gemini-image-model' },
          input: { inputs: [], productName: '상품' },
        } as never,
        status: 'held',
        scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
      },
    })).resolves.toMatchObject({ status: 'created', generationId });

    expect(helperMocks.createPendingSalesProductJob).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: generationId }),
    );
  });

  it('re-reads the committed deterministic thumbnail child after a create race', async () => {
    const identity = {
      generationId: '11111111-1111-4111-8111-111111111111',
      requestHash: 'a'.repeat(64),
    };
    const tx = {
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (scope: typeof tx) => Promise<unknown>) => callback(tx)),
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: identity.generationId,
          isDeleted: false,
          inputMeta: { productGenerationRequestHash: identity.requestHash },
        }),
      },
      aiDirectJob: {
        findFirst: vi.fn().mockResolvedValue({ id: 'direct-job-1', status: 'held' }),
      },
    };
    const directJobs = { createInScope: vi.fn() };
    helperMocks.createPendingSalesProductJob.mockRejectedValueOnce({ code: 'P2002' });
    const repository = new ThumbnailGenerationLedgerRepositoryAdapter(
      prisma as never,
      directJobs as never, {} as never, {} as never);

    await expect(repository.openPendingDirectGeneration({
      subject: 'sales_product',
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
      productName: '상품',
      contentWorkspaceId: 'workspace-1',
      originalUrl: 'https://cdn.example.com/source.jpg',
      method: 'generate',
      inputMeta: { productGenerationRequestHash: identity.requestHash },
      triggeredByUserId: 'user-1',
      inputImages: [],
      productGenerationIdentity: identity,
      directJob: {
        jobType: 'thumbnail_generate',
        payload: {
          jobType: 'thumbnail_generate',
          models: { image: 'gemini-image-model' },
          input: { inputs: [], productName: '상품' },
        } as never,
        status: 'held',
        scheduledFor: new Date('2026-07-19T00:00:00.000Z'),
      },
    })).resolves.toEqual({
      status: 'existing',
      generationId: identity.generationId,
      directJobId: 'direct-job-1',
      releaseRequired: true,
    });

    expect(prisma.thumbnailGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: identity.generationId, organizationId: 'org-1' },
      select: { id: true, isDeleted: true, inputMeta: true },
    });
    expect(directJobs.createInScope).not.toHaveBeenCalled();
  });

  it('claims and projects direct output through use-case-level methods', async () => {
    const prisma = {};
    const repository = new ThumbnailGenerationLedgerRepositoryAdapter(prisma as never, {} as never, {} as never, {} as never);
    helperMocks.lockGenerationForProcessing.mockResolvedValueOnce({
      fromStatus: 'pending',
      fromPhase: null,
      attemptNumber: 1,
    });
    helperMocks.applyDirectSuccessResult.mockResolvedValueOnce({
      fromStatus: 'running',
      fromPhase: null,
      attemptNumber: 1,
    });

    await expect(
      repository.claimForDirectProjection({
        generationId: 'generation-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      fromStatus: 'pending',
      fromPhase: null,
      attemptNumber: 1,
    });
    await expect(
      repository.projectDirectSuccess({
        generationId: 'generation-1',
        organizationId: 'org-1',
        candidates: [],
        inputMeta: { aiJobId: 'request-1' },
      }),
    ).resolves.toEqual({
      fromStatus: 'running',
      fromPhase: null,
      attemptNumber: 1,
    });

    expect(helperMocks.lockGenerationForProcessing).toHaveBeenCalledWith(prisma, 'generation-1', 'org-1');
    expect(helperMocks.applyDirectSuccessResult).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        generationId: 'generation-1',
        organizationId: 'org-1',
        inputMeta: { aiJobId: 'request-1' },
      }),
    );
  });

});
