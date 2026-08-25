import { createHash } from 'node:crypto';

/** Stable owner-input receipt hash, deliberately independent of an Attempt. */
export function canonicalOwnerInputHash(input: unknown): string {
  return createHash('sha256').update(canonicalOwnerInputJson(input)).digest('hex');
}

/**
 * RFC-8785-compatible JSON normalization used at every mutation boundary.
 * Callers hash this canonical representation; never hash caller-order JSON.
 */
export function canonicalOwnerInputJson(input: unknown): string {
  return JSON.stringify(canonicalizeOwnerInput(input));
}

export function canonicalizeOwnerInput(input: unknown): unknown {
  const seen = new WeakSet<object>();
  return canonicalize(input, seen);
}

function canonicalize(input: unknown, seen: WeakSet<object>): unknown {
  if (input === null || typeof input === 'string' || typeof input === 'boolean') {
    return input;
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('invalid_canonical_json');
    return input;
  }
  if (Array.isArray(input)) {
    if (seen.has(input)) throw new Error('invalid_canonical_json');
    seen.add(input);
    const result = input.map((item) => canonicalize(item, seen));
    seen.delete(input);
    return result;
  }
  if (input && typeof input === 'object') {
    if (seen.has(input) || Object.getPrototypeOf(input) !== Object.prototype) {
      throw new Error('invalid_canonical_json');
    }
    seen.add(input);
    const result = Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, value]) => [key, canonicalize(value, seen)]),
    );
    seen.delete(input);
    return result;
  }
  throw new Error('invalid_canonical_json');
}
