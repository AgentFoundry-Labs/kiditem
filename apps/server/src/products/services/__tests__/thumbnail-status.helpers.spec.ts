import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markReady, markApplied, resetToPending } from '../thumbnail-status.helpers';
import { expectValidInvariant } from './helpers';

describe('thumbnail-status helpers', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      thumbnailGeneration: {
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'g1', ...data })),
      },
    };
  });

  describe('markReady', () => {
    it('writes status=succeeded + phase=ready', async () => {
      const result = await markReady(prisma, 'g1');
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'g1' },
          data: expect.objectContaining({ status: 'succeeded', phase: 'ready' }),
        }),
      );
      expectValidInvariant(result);
    });

    it('merges extras (selectedUrl, candidates, editAnalysis)', async () => {
      await markReady(prisma, 'g1', { selectedUrl: '/x.jpg', candidates: [] as any });
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'succeeded',
            phase: 'ready',
            selectedUrl: '/x.jpg',
            candidates: [],
          }),
        }),
      );
    });

    it('forwards include option to Prisma', async () => {
      const include = { product: { select: { id: true } } };
      await markReady(prisma, 'g1', {}, { include });
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({ include }),
      );
    });
  });

  describe('markApplied', () => {
    it('writes status=succeeded + phase=applied', async () => {
      const result = await markApplied(prisma, 'g1');
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'g1' },
          data: { status: 'succeeded', phase: 'applied' },
        }),
      );
      expectValidInvariant(result);
    });

    it('forwards include option', async () => {
      const include = { product: { select: { name: true } } };
      await markApplied(prisma, 'g1', { include });
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({ include }),
      );
    });
  });

  describe('resetToPending', () => {
    it('writes status=pending + phase=null', async () => {
      const result = await resetToPending(prisma, 'g1');
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'g1' },
          data: expect.objectContaining({ status: 'pending', phase: null }),
        }),
      );
      expectValidInvariant(result);
    });

    it('merges candidates and selectedUrl extras', async () => {
      await resetToPending(prisma, 'g1', { candidates: [] as any, selectedUrl: null });
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'pending', phase: null, candidates: [], selectedUrl: null },
        }),
      );
    });
  });
});
