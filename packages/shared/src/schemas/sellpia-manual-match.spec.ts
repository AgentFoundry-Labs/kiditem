import { describe, expect, it } from 'vitest';
import {
  SellpiaManualMatchSnapshotSchema,
} from './sellpia-manual-match';

const snapshot = () => ({
  source: 'sellpia_product_manual_match' as const,
  version: 1 as const,
  targetCount: 2,
  targetCodes: ['10423-1', '6402-1'],
  rowCount: 2,
  rows: [
    {
      productCode: '10423-1',
      aliasTitle: '3000 DIY 층층 3D 데코스티커',
      itemCount: 1,
      matchedType: 'M' as const,
      evidenceCount: 4,
    },
    {
      productCode: '6402-1',
      aliasTitle: '크리스마스 아동양말 대 2개',
      itemCount: 2,
      matchedType: 'M' as const,
      evidenceCount: 1,
    },
  ],
});

describe('SellpiaManualMatchSnapshotSchema', () => {
  it('accepts a complete sorted allowlisted manual-match snapshot', () => {
    expect(SellpiaManualMatchSnapshotSchema.parse(snapshot())).toEqual(snapshot());
  });

  it('rejects partial, duplicate, or foreign-code evidence', () => {
    expect(() => SellpiaManualMatchSnapshotSchema.parse({
      ...snapshot(),
      targetCount: 3,
    })).toThrow();
    expect(() => SellpiaManualMatchSnapshotSchema.parse({
      ...snapshot(),
      rows: [snapshot().rows[0], snapshot().rows[0]],
    })).toThrow();
    expect(() => SellpiaManualMatchSnapshotSchema.parse({
      ...snapshot(),
      rows: [{ ...snapshot().rows[0], productCode: '9999-1' }, snapshot().rows[1]],
    })).toThrow();
  });
});
