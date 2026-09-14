import { describe, expect, it } from 'vitest';
import { deriveRankChange } from './rank-change';

describe('deriveRankChange', () => {
  it('withholds movement when either business-day rank was not measured', () => {
    expect(deriveRankChange(12, null)).toEqual({
      change: null,
      direction: null,
    });
    expect(deriveRankChange(null, 12)).toEqual({
      change: null,
      direction: null,
    });
  });

  it('derives direction from two measured ranks', () => {
    expect(deriveRankChange(8, 12)).toEqual({
      change: 4,
      direction: 'rising',
    });
    expect(deriveRankChange(15, 12)).toEqual({
      change: -3,
      direction: 'falling',
    });
    expect(deriveRankChange(12, 12)).toEqual({
      change: 0,
      direction: 'steady',
    });
  });
});
