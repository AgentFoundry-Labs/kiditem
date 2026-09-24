import { ChannelIntegrityAdapter } from '../../adapter/out/integrity/channel-integrity.adapter';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeRegistrationSubmissionPayload,
  freezeProductRegistrationPayload,
  hashRegistrationSubmissionPayload,
} from './registration-submission-payload';

const channelIntegrity = new ChannelIntegrityAdapter();

describe('product preparation submission payload', () => {
  it('preserves the persisted UTF-8 canonical payload hash', () => {
    const value = { name: '한글', b: [2, 1], a: null };
    const expected = 'e60a056d4483503f16faf87bb661ca5651f04d604eae99c7429ab677e22b0388';
    expect(hashRegistrationSubmissionPayload(value, channelIntegrity.sha256)).toBe(expected);
    expect(freezeProductRegistrationPayload(value, channelIntegrity.sha256).hash).toBe(expected);
  });

  it('sorts object keys recursively while preserving array order', () => {
    const canonical = canonicalizeRegistrationSubmissionPayload({
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
      .update(canonicalizeRegistrationSubmissionPayload(left))
      .digest('hex');

    expect(hashRegistrationSubmissionPayload(left, channelIntegrity.sha256)).toBe(expected);
    expect(hashRegistrationSubmissionPayload(right, channelIntegrity.sha256)).toBe(expected);
  });

  it('returns an immutable JSON-compatible snapshot and its matching hash', () => {
    const source = { listingPayload: { price: 21900, tags: ['kids', 'rain'] } };
    const frozen = freezeProductRegistrationPayload(source, channelIntegrity.sha256);
    source.listingPayload.price = 1;

    expect(frozen.payload).toEqual({
      listingPayload: { price: 21900, tags: ['kids', 'rain'] },
    });
    expect(frozen.canonicalJson).toBe(
      '{"listingPayload":{"price":21900,"tags":["kids","rain"]}}',
    );
    expect(frozen.hash).toBe(hashRegistrationSubmissionPayload(frozen.payload, channelIntegrity.sha256));
    expect(() => {
      (frozen.payload.listingPayload as { price: number }).price = 2;
    }).toThrow();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, undefined, new Date()])(
    'rejects non-JSON values (%s)',
    (value) => {
      expect(() => canonicalizeRegistrationSubmissionPayload({ value })).toThrow();
    },
  );
});
