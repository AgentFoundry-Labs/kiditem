import { describe, expect, it } from 'vitest';
import { SourcingOperationResultSchema } from './operation-result.js';

describe('SourcingOperationResultSchema', () => {
  const valid = {
    outcome: 'partial',
    summary: {
      discovered: 8,
      accepted: 5,
      duplicate: 1,
      unchanged: 0,
      failed: 2,
    },
    sources: [
      {
        source: 'wing_catalog',
        outcome: 'partial',
        accepted: 5,
        failed: 2,
        errorCode: 'provider_partial',
      },
    ],
    snapshotGeneratedAt: '2026-08-14T00:00:00.000Z',
  } as const;

  it('accepts the bounded safe sourcing summary', () => {
    expect(SourcingOperationResultSchema.parse(valid)).toEqual(valid);
  });

  it('rejects arbitrary result fields and unsafe unbounded details', () => {
    expect(SourcingOperationResultSchema.safeParse({
      ...valid,
      rawRows: [{ secret: 'must not render' }],
    }).success).toBe(false);
    expect(SourcingOperationResultSchema.safeParse({
      ...valid,
      sources: [{ ...valid.sources[0], source: 'x'.repeat(121) }],
    }).success).toBe(false);
  });

  it('rejects failed as a successful top-level outcome', () => {
    expect(SourcingOperationResultSchema.safeParse({
      ...valid,
      outcome: 'failed',
    }).success).toBe(false);
  });
});
