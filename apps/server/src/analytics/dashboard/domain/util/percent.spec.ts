import { describe, expect, it } from 'vitest';

import {
  measuredPercent1,
  measuredPercent2,
  oneDecimalDifference,
  percentChange,
} from './percent';

describe('measuredPercent1', () => {
  it('rounds a measured ratio to one decimal place', () => {
    expect(measuredPercent1(10_000, 100_000)).toBe(10);
    expect(measuredPercent1(1, 3)).toBe(33.3);
    expect(measuredPercent1(2, 3)).toBe(66.7);
  });

  it('keeps a collected zero numerator as a measured zero', () => {
    expect(measuredPercent1(0, 100_000)).toBe(0);
  });

  it('reports an unavailable ratio instead of a fabricated zero', () => {
    // A zero/negative denominator is not evidence that the ratio is 0%.
    expect(measuredPercent1(10_000, 0)).toBeNull();
    expect(measuredPercent1(10_000, -5)).toBeNull();
    expect(measuredPercent1(null, 100_000)).toBeNull();
    expect(measuredPercent1(10_000, null)).toBeNull();
    expect(measuredPercent1(undefined, undefined)).toBeNull();
  });

  it('never returns NaN or Infinity for non-finite inputs', () => {
    expect(measuredPercent1(Number.NaN, 100)).toBeNull();
    expect(measuredPercent1(100, Number.NaN)).toBeNull();
    expect(measuredPercent1(100, Number.POSITIVE_INFINITY)).toBeNull();
    expect(measuredPercent1(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });
});

describe('measuredPercent2', () => {
  it('rounds a measured ratio to two decimal places', () => {
    expect(measuredPercent2(1_000_000, 100_000)).toBe(1000);
    expect(measuredPercent2(474, 3_083)).toBe(15.37);
  });

  it('keeps a collected zero numerator as a measured zero', () => {
    expect(measuredPercent2(0, 5_000)).toBe(0);
  });

  it('reports an unavailable ratio instead of a fabricated zero', () => {
    expect(measuredPercent2(100, 0)).toBeNull();
    expect(measuredPercent2(null, 5_000)).toBeNull();
    expect(measuredPercent2(100, null)).toBeNull();
  });
});

describe('percentChange', () => {
  it('reports the change as a percent of the previous value', () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(100, 100)).toBe(0);
  });

  it('is unavailable when either side or the base is missing', () => {
    expect(percentChange(null, 100)).toBeNull();
    expect(percentChange(100, null)).toBeNull();
    expect(percentChange(100, 0)).toBeNull();
  });

  it('keeps the direction of the change against a negative base only when asked', () => {
    // Recovering from -100 to -50 is an improvement, not a -50% decline.
    expect(percentChange(-50, -100, true)).toBe(50);
    // Without the flag a negative base is not a usable denominator.
    expect(percentChange(-50, -100)).toBeNull();
    expect(percentChange(0, 0, true)).toBeNull();
  });
});

describe('oneDecimalDifference', () => {
  it('subtracts two percents in percentage points', () => {
    expect(oneDecimalDifference(12.5, 10.2)).toBe(2.3);
    expect(oneDecimalDifference(0, 4.4)).toBe(-4.4);
  });

  it('is unavailable when either percent is unavailable', () => {
    expect(oneDecimalDifference(null, 10)).toBeNull();
    expect(oneDecimalDifference(10, null)).toBeNull();
  });
});
