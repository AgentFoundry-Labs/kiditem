import { describe, expect, it } from 'vitest';
import { canonicalJson } from './sourcing-stable-json';

describe('canonicalJson', () => {
  it('sorts object keys recursively without reordering arrays', () => {
    expect(
      canonicalJson({
        z: { beta: 2, alpha: 1 },
        a: [{ y: 2, x: 1 }, { b: 2, a: 1 }],
      }),
    ).toBe('{"a":[{"x":1,"y":2},{"a":1,"b":2}],"z":{"alpha":1,"beta":2}}');
  });
});
