import { describe, expect, it } from 'vitest';
import {
  SellpiaManualMatchPlanSchema,
  SellpiaManualMatchRowSchema,
} from './sellpia-manual-match';

const plan = () => ({
  sourceType: 'sellpia_product_manual_match' as const,
  parserVersion: 'sellpia-manual-match-v1' as const,
  sourceOrigin: 'https://kiditem.sellpia.com' as const,
  sourcePath: '/product_manual_match.html' as const,
  targetCount: 2,
  targetCodes: ['10423-1', '6402-1'],
});

describe('SellpiaManualMatchPlanSchema', () => {
  it('accepts the frozen, sorted target set', () => {
    expect(SellpiaManualMatchPlanSchema.parse(plan())).toEqual(plan());
  });

  it('rejects a count that does not match or an unsorted, duplicated target set', () => {
    expect(() => SellpiaManualMatchPlanSchema.parse({ ...plan(), targetCount: 3 })).toThrow();
    expect(() => SellpiaManualMatchPlanSchema.parse({ ...plan(), targetCodes: ['6402-1', '10423-1'] })).toThrow();
    expect(() => SellpiaManualMatchPlanSchema.parse({ ...plan(), targetCount: 2, targetCodes: ['6402-1', '6402-1'] })).toThrow();
  });
});

describe('SellpiaManualMatchRowSchema', () => {
  it('accepts one allowlisted match row and rejects extra fields or a non-Sellpia code', () => {
    const row = { productCode: '6402-1', aliasTitle: '크리스마스 아동양말 대 2개', itemCount: 2, matchedType: 'M' as const, evidenceCount: 1 };
    expect(SellpiaManualMatchRowSchema.parse(row)).toEqual(row);
    expect(() => SellpiaManualMatchRowSchema.parse({ ...row, matchMd5: 'a'.repeat(32) })).toThrow();
    expect(() => SellpiaManualMatchRowSchema.parse({ ...row, productCode: 'ABC' })).toThrow();
  });
});
