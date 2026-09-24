import { describe, expect, it } from 'vitest';
import { countFrozenSalesProductOptionReferences } from './registration-execution-state';

describe('registration execution state', () => {
  describe('countFrozenSalesProductOptionReferences', () => {
    it('counts each option once per immutable target execution', () => {
      const counts = countFrozenSalesProductOptionReferences([
        {
          submissionPayloadJson: {
            product: { options: [{ id: 'option-1' }, { id: 'option-2' }, { id: 'option-1' }] },
          },
        },
        {
          submissionPayloadJson: {
            product: { options: [{ id: 'option-1' }] },
          },
        },
        { submissionPayloadJson: { registrationInput: { optionLinks: [] } } },
      ]);

      expect([...counts.entries()]).toEqual([
        ['option-1', 2],
        ['option-2', 1],
      ]);
    });

    it('ignores malformed and non-target snapshots', () => {
      const counts = countFrozenSalesProductOptionReferences([
        { submissionPayloadJson: null },
        { submissionPayloadJson: { product: { options: [{ id: 7 }, {}] } } },
        // 공급가 목록은 snapshot 에서 빠졌다 — 그 모양의 옛 payload 는 옵션을 붙들지 않는다.
        { submissionPayloadJson: { supplyPrices: [{ salesProductOptionId: 'option-3' }] } },
      ]);

      expect([...counts.entries()]).toEqual([]);
    });
  });
});
