import { describe, expect, it, vi } from 'vitest';
import {
  readSalesProductOptionExecutionCounts,
  readUnresolvedCompositionOptionIds,
} from './registration-execution.reader';

describe('registration execution reader', () => {
  describe('readSalesProductOptionExecutionCounts', () => {
    it('reads only executions whose preparation belongs to the product', async () => {
      const findMany = vi.fn().mockResolvedValue([
        { submissionPayloadJson: { product: { options: [{ id: 'option-1' }] } } },
      ]);

      const counts = await readSalesProductOptionExecutionCounts({
        productRegistrationExecution: { findMany },
      } as never, { organizationId: 'org-1', salesProductId: 'product-1' });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          preparation: { salesProductId: 'product-1' },
        },
        select: { submissionPayloadJson: true },
      });
      expect(counts.get('option-1')).toBe(1);
    });
  });

  describe('readUnresolvedCompositionOptionIds', () => {
    it('reads only the selected external options from live uncertain composition executions', async () => {
      const findMany = vi.fn().mockResolvedValue([
        {
          submissionPayloadJson: {
            optionTransitions: [{ channelListingOptionId: 'option-a' }],
          },
        },
        {
          submissionPayloadJson: {
            optionTransitions: [{ channelListingOptionId: 'option-b' }],
          },
        },
      ]);

      const unresolved = await readUnresolvedCompositionOptionIds({
        productRegistrationExecution: { findMany },
      } as never, {
        organizationId: 'org-1',
        channelListingIds: ['listing-a', 'listing-b'],
      });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          channelListingId: { in: ['listing-a', 'listing-b'] },
          executionKind: 'composition_change',
          status: { in: ['executing', 'reconciling'] },
          providerOutcome: 'uncertain',
        },
        select: { submissionPayloadJson: true },
      });
      expect([...unresolved]).toEqual(['option-a', 'option-b']);
    });

    it('clears a composition hold after the ledger no longer returns a live uncertain execution', async () => {
      const findMany = vi.fn()
        .mockResolvedValueOnce([{
          submissionPayloadJson: {
            optionTransitions: [{ channelListingOptionId: 'option-a' }],
          },
        }])
        .mockResolvedValueOnce([]);
      const tx = { productRegistrationExecution: { findMany } } as never;
      const input = { organizationId: 'org-1', channelListingIds: ['listing-a'] };

      await expect(readUnresolvedCompositionOptionIds(tx, input))
        .resolves.toEqual(new Set(['option-a']));
      await expect(readUnresolvedCompositionOptionIds(tx, input))
        .resolves.toEqual(new Set());
    });

    it('returns no hold when preparing, not-started, or terminal executions are excluded by the ledger query', async () => {
      const findMany = vi.fn().mockResolvedValue([]);

      await expect(readUnresolvedCompositionOptionIds({
        productRegistrationExecution: { findMany },
      } as never, {
        organizationId: 'org-1',
        channelListingIds: ['listing-a'],
      })).resolves.toEqual(new Set());

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['executing', 'reconciling'] },
          providerOutcome: 'uncertain',
        }),
      }));
    });
  });
});
