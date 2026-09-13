import { describe, expect, it } from 'vitest';
import { compareNullableLast } from './nullable-sort';

describe('compareNullableLast', () => {
  it('orders measured values by direction and keeps unavailable values last either way', () => {
    const values = [3, null, 1, null, 2];

    expect([...values].sort((a, b) => compareNullableLast(a, b, 'desc'))).toEqual([3, 2, 1, null, null]);
    expect([...values].sort((a, b) => compareNullableLast(a, b, 'asc'))).toEqual([1, 2, 3, null, null]);
  });

  it('never ranks an unavailable value as a zero', () => {
    expect([0, null, -1].sort((a, b) => compareNullableLast(a, b, 'asc'))).toEqual([-1, 0, null]);
  });
});
