import { describe, it, expect } from 'vitest';
import { toSerializable } from '../serialize';

describe('toSerializable — BigInt guard (Plan B1 #4)', () => {
  it('safe-range BigInt → Number', () => {
    const input = { count: BigInt(42) };
    const result = toSerializable(input);
    expect(result).toEqual({ count: 42 });
    expect(typeof (result as any).count).toBe('number');
  });

  it('unsafe-range BigInt (> MAX_SAFE_INTEGER) → String', () => {
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
    const input = { count: huge };
    const result = toSerializable(input);
    expect((result as any).count).toBe(huge.toString());
    expect(typeof (result as any).count).toBe('string');
  });

  it('unsafe-range negative BigInt → String', () => {
    const tinyNeg = BigInt(Number.MIN_SAFE_INTEGER) - BigInt(1);
    const input = { count: tinyNeg };
    const result = toSerializable(input);
    expect((result as any).count).toBe(tinyNeg.toString());
  });

  it('nested BigInt in array', () => {
    const input = [{ n: BigInt(7) }, { n: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(5) }];
    const result = toSerializable(input) as any[];
    expect(result[0].n).toBe(7);
    expect(typeof result[1].n).toBe('string');
  });
});
