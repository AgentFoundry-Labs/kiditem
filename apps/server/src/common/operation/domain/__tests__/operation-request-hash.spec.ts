import { describe, expect, it } from 'vitest';
import { operationRequestHash } from '../operation-request-hash';

describe('operation begin request hash', () => {
  it('is the SHA-256 of the canonical kind, scope and fileHash', () => {
    // sha256('{"fileHash":null,"kind":"test.echo","scope":{"a":1,"b":[2,3]}}')
    expect(operationRequestHash({ kind: 'test.echo', scope: { b: [2, 3], a: 1 } }))
      .toBe('e10da3265e9306c701c073ec7b7eecc20ff77b75ad7b2d60d0558d241e0617ae');
  });

  it('ignores scope key order and changes with any of kind, scope or fileHash', () => {
    const base = operationRequestHash({ kind: 'test.echo', scope: { a: 1, b: 2 } });
    expect(operationRequestHash({ kind: 'test.echo', scope: { b: 2, a: 1 } })).toBe(base);
    expect(operationRequestHash({ kind: 'test.other', scope: { a: 1, b: 2 } })).not.toBe(base);
    expect(operationRequestHash({ kind: 'test.echo', scope: { a: 1, b: 3 } })).not.toBe(base);
    expect(operationRequestHash({ kind: 'test.echo', scope: { a: 1, b: 2 }, fileHash: 'f'.repeat(64) })).not.toBe(base);
  });
});
