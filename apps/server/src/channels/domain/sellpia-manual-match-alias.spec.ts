import { describe, expect, it } from 'vitest';
import { normalizeSellpiaManualMatchAlias } from './sellpia-manual-match-alias';

describe('normalizeSellpiaManualMatchAlias', () => {
  it('keeps pack quantities while folding presentation differences', () => {
    expect(normalizeSellpiaManualMatchAlias(' KY I&D 미니현미경 (2개) '))
      .toBe('kyid미니현미경2개');
  });
});
