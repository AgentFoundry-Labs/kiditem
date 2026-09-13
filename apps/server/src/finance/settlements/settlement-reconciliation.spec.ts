import { describe, expect, it } from 'vitest';
import { classifySettlementDifference } from './settlement-reconciliation';

describe('classifySettlementDifference', () => {
  it.each([
    [100, 'matched'],
    [-100, 'matched'],
    [101, 'minor_diff'],
    [-1_000, 'minor_diff'],
    [1_001, 'mismatch'],
  ] as const)('classifies a %i KRW difference as %s', (difference, expected) => {
    expect(classifySettlementDifference(difference)).toBe(expected);
  });
});
