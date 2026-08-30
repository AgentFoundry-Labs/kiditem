import { describe, expect, it } from 'vitest';
import {
  canonicalizeSourcingIntelligenceJson,
  hashSourcingIntelligenceJson,
} from './sourcing-intelligence-hash';

describe('sourcing intelligence canonical hash', () => {
  it('is stable across object key order', () => {
    expect(hashSourcingIntelligenceJson({ b: 2, a: { y: 2, x: 1 } })).toBe(
      hashSourcingIntelligenceJson({ a: { x: 1, y: 2 }, b: 2 }),
    );
  });

  it('rejects undefined, non-finite numbers, and circular references', () => {
    expect(() => canonicalizeSourcingIntelligenceJson({ value: undefined })).toThrow(
      /undefined/,
    );
    expect(() => canonicalizeSourcingIntelligenceJson({ value: Number.NaN })).toThrow(
      /finite/,
    );
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalizeSourcingIntelligenceJson(circular)).toThrow(/circular/);
  });

  it('preserves prototype-looking keys in provenance hashes', () => {
    const value = Object.create(null) as Record<string, unknown>;
    value.a = 1;
    value.__proto__ = 'source-controlled-value';

    expect(canonicalizeSourcingIntelligenceJson(value)).toBe(
      '{"__proto__":"source-controlled-value","a":1}',
    );
    expect(hashSourcingIntelligenceJson(value)).not.toBe(
      hashSourcingIntelligenceJson({ a: 1 }),
    );
  });
});
