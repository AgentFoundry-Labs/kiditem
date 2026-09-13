import { describe, expect, it } from 'vitest';
import { financeCostInputState } from './finance-basis.js';

describe('financeCostInputState', () => {
  const component = (lines: number, notAppliedLines: number, unmeasuredLines: number) =>
    ({ lines, notAppliedLines, unmeasuredLines });

  it.each([
    [component(0, 0, 0), 'empty'],
    [component(3, 3, 0), 'not_applied'],
    [component(3, 1, 0), 'measured'],
    [component(3, 1, 2), 'not_measured'],
    [component(3, 0, 1), 'partial'],
  ] as const)('derives %o as %s', (input, expected) => {
    expect(financeCostInputState(input)).toBe(expected);
  });
});
