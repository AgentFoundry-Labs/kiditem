import { describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../thumbnail-generation-ledger.repository.adapter';

const helperMocks = vi.hoisted(() => ({
  createPendingJob: vi.fn(),
}));

vi.mock('../thumbnail-generation-ledger.persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../thumbnail-generation-ledger.persistence')>()),
  createPendingJob: helperMocks.createPendingJob,
}));

describe('ThumbnailGenerationLedgerRepositoryAdapter', () => {
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
        subject: 'sales_product',
        salesProductId: 'sales-product-1',
        organizationId: 'org-1',
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
    helperMocks.createPendingJob.mockRejectedValueOnce({ code: 'P2002' });
    const repository = new ThumbnailGenerationLedgerRepositoryAdapter(
      prisma as never,
      directJobs as never, {} as never, {} as never);

    await expect(repository.openPendingDirectGeneration({
      subject: 'sales_product',
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
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

});
