import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeProductPreparationPayload,
  freezeProductPreparationPayload,
  hashProductPreparationPayload,
} from './product-preparation-payload';

describe('product preparation submission payload', () => {
  it('sorts object keys recursively while preserving array order', () => {
    const canonical = canonicalizeProductPreparationPayload({
      z: 1,
      nested: { second: true, first: 'a' },
      items: [{ y: 2, x: 1 }, 'tail'],
      a: null,
    });

    expect(canonical).toBe(
      '{"a":null,"items":[{"x":1,"y":2},"tail"],"nested":{"first":"a","second":true},"z":1}',
    );
  });

  it('produces the same SHA-256 hash for semantically identical object ordering', () => {
    const left = { payload: { name: 'Boots', price: 21900 }, account: 'wing' };
    const right = { account: 'wing', payload: { price: 21900, name: 'Boots' } };
    const expected = createHash('sha256')
      .update(canonicalizeProductPreparationPayload(left))
      .digest('hex');

    expect(hashProductPreparationPayload(left)).toBe(expected);
    expect(hashProductPreparationPayload(right)).toBe(expected);
  });

  it('returns an immutable JSON-compatible snapshot and its matching hash', () => {
    const source = { listingPayload: { price: 21900, tags: ['kids', 'rain'] } };
    const frozen = freezeProductPreparationPayload(source);
    source.listingPayload.price = 1;

    expect(frozen.payload).toEqual({
      listingPayload: { price: 21900, tags: ['kids', 'rain'] },
    });
    expect(frozen.canonicalJson).toBe(
      '{"listingPayload":{"price":21900,"tags":["kids","rain"]}}',
    );
    expect(frozen.hash).toBe(hashProductPreparationPayload(frozen.payload));
    expect(() => {
      (frozen.payload.listingPayload as { price: number }).price = 2;
    }).toThrow();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, undefined, new Date()])(
    'rejects non-JSON values (%s)',
    (value) => {
      expect(() => canonicalizeProductPreparationPayload({ value })).toThrow();
    },
  );
});
