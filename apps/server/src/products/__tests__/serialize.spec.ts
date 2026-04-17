// apps/server/src/products/__tests__/serialize.spec.ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { toSerializable } from '../util/serialize';

describe('toSerializable', () => {
  it('converts Date to ISO string', () => {
    const d = new Date('2026-04-17T10:00:00.000Z');
    expect(toSerializable(d)).toBe('2026-04-17T10:00:00.000Z');
  });

  it('converts Prisma.Decimal to number', () => {
    const d = new Prisma.Decimal('12.34');
    expect(toSerializable(d)).toBe(12.34);
  });

  it('recurses into arrays', () => {
    expect(toSerializable([new Date('2026-01-01T00:00:00.000Z'), 42])).toEqual([
      '2026-01-01T00:00:00.000Z', 42,
    ]);
  });

  it('recurses into plain objects', () => {
    const row = {
      id: 'abc',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      cost: new Prisma.Decimal('9.99'),
      nested: { flag: true },
    };
    expect(toSerializable(row)).toEqual({
      id: 'abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      cost: 9.99,
      nested: { flag: true },
    });
  });

  it('passes through primitives untouched', () => {
    expect(toSerializable(42)).toBe(42);
    expect(toSerializable('hello')).toBe('hello');
    expect(toSerializable(null)).toBe(null);
    expect(toSerializable(true)).toBe(true);
  });
});
