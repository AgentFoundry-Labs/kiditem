import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  applyDirectSuccessResult,
  deleteGeneration,
  lockGenerationForProcessing,
  markGenerationFailed,
  removeCandidate,
  replaceGenerationResult,
  resetGenerationForReEdit,
} from '../thumbnail-generation-ledger.persistence';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const GENERATION_ID = '22222222-2222-4222-8222-222222222222';
const CANDIDATE_ID = '33333333-3333-4333-8333-333333333333';

function setup(status = 'succeeded') {
  const lockedGeneration = {
    id: GENERATION_ID,
    status,
    phase: status === 'succeeded' ? 'ready' : null,
    attemptCount: 1,
    selectedUrl: 'https://cdn.example.com/adopted.png',
  };
  const tx = {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([lockedGeneration])
      .mockResolvedValue([{ id: CANDIDATE_ID, url: lockedGeneration.selectedUrl }]),
    contentWorkspaceThumbnailSelection: {
      findFirst: vi.fn().mockResolvedValue({ id: 'selection-1' }),
    },
    thumbnailGeneration: {
      findFirst: vi.fn().mockResolvedValue({
        id: GENERATION_ID,
        status,
        phase: status === 'succeeded' ? 'ready' : null,
        attemptCount: 1,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    thumbnailGenerationCandidate: {
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    thumbnailGenerationInputImage: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: vi.fn((operation: (scope: typeof tx) => unknown) => operation(tx)),
    thumbnailGeneration: tx.thumbnailGeneration,
  };
  return { prisma, tx };
}

describe('thumbnail generation adopted provenance persistence', () => {
  it('soft-deletes an unadopted generation after locking and rechecking provenance', async () => {
    const { prisma, tx } = setup();
    tx.contentWorkspaceThumbnailSelection.findFirst.mockResolvedValueOnce(null);

    await expect(deleteGeneration(
      prisma as never,
      GENERATION_ID,
      ORGANIZATION_ID,
    )).resolves.toBeUndefined();

    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.contentWorkspaceThumbnailSelection.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.contentWorkspaceThumbnailSelection.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      tx.thumbnailGeneration.updateMany.mock.invocationCallOrder[0],
    );
    expect(tx.thumbnailGeneration.updateMany).toHaveBeenCalledWith({
      where: { id: GENERATION_ID, organizationId: ORGANIZATION_ID, isDeleted: false },
      data: { isDeleted: true, deletedAt: expect.any(Date) },
    });
  });

  it('rejects soft-deleting an adopted generation with an explicit conflict', async () => {
    const { prisma, tx } = setup();

    await expect(deleteGeneration(
      prisma as never,
      GENERATION_ID,
      ORGANIZATION_ID,
    )).rejects.toBeInstanceOf(ConflictException);

    expect(tx.thumbnailGeneration.updateMany).not.toHaveBeenCalled();
  });

  it('rejects removing an adopted candidate before any physical delete', async () => {
    const { prisma, tx } = setup();

    await expect(removeCandidate(prisma as never, {
      id: GENERATION_ID,
      organizationId: ORGANIZATION_ID,
      candidateUrl: 'https://cdn.example.com/adopted.png',
    })).rejects.toBeInstanceOf(ConflictException);

    expect(tx.thumbnailGenerationCandidate.deleteMany).not.toHaveBeenCalled();
    expect(tx.thumbnailGeneration.updateMany).not.toHaveBeenCalled();
  });

  it('computes the last-candidate and selected-url decisions from locked database state', async () => {
    const { prisma, tx } = setup();
    tx.contentWorkspaceThumbnailSelection.findFirst.mockResolvedValueOnce(null);

    await expect(removeCandidate(prisma as never, {
      id: GENERATION_ID,
      organizationId: ORGANIZATION_ID,
      candidateUrl: 'https://cdn.example.com/adopted.png',
    })).resolves.toEqual({ generationDeleted: true, remaining: 0 });

    expect(tx.thumbnailGenerationCandidate.count).toHaveBeenCalledWith({
      where: { generationId: GENERATION_ID, organizationId: ORGANIZATION_ID },
    });
    expect(tx.thumbnailGeneration.updateMany).toHaveBeenCalledWith({
      where: {
        id: GENERATION_ID,
        organizationId: ORGANIZATION_ID,
        isDeleted: false,
      },
      data: {
        selectedUrl: null,
        isDeleted: true,
        deletedAt: expect.any(Date),
      },
    });
  });

  it('rejects re-edit reset before deleting adopted candidates', async () => {
    const { prisma, tx } = setup();

    await expect(resetGenerationForReEdit(prisma as never, {
      id: GENERATION_ID,
      organizationId: ORGANIZATION_ID,
      purpose: 'quality',
      variantKey: 'auto',
    })).rejects.toBeInstanceOf(ConflictException);

    expect(tx.thumbnailGenerationCandidate.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects retrying an adopted generation before claiming it as running', async () => {
    const { prisma, tx } = setup('pending');

    await expect(lockGenerationForProcessing(
      prisma as never,
      GENERATION_ID,
      ORGANIZATION_ID,
    )).rejects.toBeInstanceOf(ConflictException);

    expect(tx.thumbnailGeneration.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['legacy', (prisma: never) => replaceGenerationResult(prisma, {
      generationId: GENERATION_ID,
      organizationId: ORGANIZATION_ID,
      candidates: [],
      inputImages: [],
      inputMeta: {},
      editAnalysis: null,
    })],
    ['direct', (prisma: never) => applyDirectSuccessResult(prisma, {
      generationId: GENERATION_ID,
      organizationId: ORGANIZATION_ID,
      candidates: [],
      inputMeta: {},
    })],
  ])('rejects %s result replacement before deleting adopted candidates', async (_kind, replace) => {
    const { prisma, tx } = setup('running');

    await expect(replace(prisma as never)).rejects.toBeInstanceOf(ConflictException);

    expect(tx.thumbnailGenerationCandidate.deleteMany).not.toHaveBeenCalled();
  });

  it('does not swallow the conflict when an adopted generation would become failed', async () => {
    const { prisma, tx } = setup('running');

    await expect(markGenerationFailed(
      prisma as never,
      GENERATION_ID,
      ORGANIZATION_ID,
      'provider failed',
    )).rejects.toBeInstanceOf(ConflictException);

    expect(tx.thumbnailGeneration.updateMany).not.toHaveBeenCalled();
  });
});
