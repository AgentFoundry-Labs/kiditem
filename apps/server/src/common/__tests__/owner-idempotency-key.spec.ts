import { describe, expect, it } from 'vitest';
import {
  canonicalOwnerInputHash,
  canonicalizeOwnerInput,
} from '../owner-idempotency-key';

describe('owner idempotency key', () => {
  it('uses canonical object order for the same owner input', () => {
    expect(canonicalOwnerInputHash({
      recommendationRunId: 'run-1', nested: { b: 2, a: 1 },
    })).toBe(canonicalOwnerInputHash({
      nested: { a: 1, b: 2 }, recommendationRunId: 'run-1',
    }));
  });

  it('rejects non-canonical values instead of silently serializing them', () => {
    expect(() => canonicalizeOwnerInput({ value: Number.NaN }))
      .toThrow('invalid_canonical_json');
    expect(() => canonicalizeOwnerInput({ value: undefined }))
      .toThrow('invalid_canonical_json');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeOwnerInput(cyclic))
      .toThrow('invalid_canonical_json');
  });
});
