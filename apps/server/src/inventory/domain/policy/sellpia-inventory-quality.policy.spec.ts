import { describe, expect, it } from 'vitest';
import {
  evaluateSellpiaInventoryQuality,
  type SellpiaInventoryQualityInput,
} from './sellpia-inventory-quality.policy';

const FILE_HASH = 'a'.repeat(64);

describe('evaluateSellpiaInventoryQuality', () => {
  it('hard-blocks a row loss of exactly 30 percent', () => {
    const result = evaluateSellpiaInventoryQuality(makeInput({
      previousRowCount: 10,
      incomingProductCodes: codes(7),
      previousActiveProductCodes: codes(10),
    }));

    expect(result.blocked).toBe(true);
    expect(result.report.issues).toContainEqual(expect.objectContaining({
      code: 'row_loss_threshold_exceeded',
      severity: 'error',
      count: 3,
    }));
  });

  it('hard-blocks when exactly 30 percent of active product codes disappear', () => {
    const result = evaluateSellpiaInventoryQuality(makeInput({
      previousRowCount: 10,
      previousActiveProductCodes: codes(10),
      incomingProductCodes: [...codes(7), 'NEW-1', 'NEW-2', 'NEW-3'],
    }));

    expect(result.blocked).toBe(true);
    expect(result.report.issues).toContainEqual(expect.objectContaining({
      code: 'active_code_loss_threshold_exceeded',
      severity: 'error',
      count: 3,
    }));
  });

  it('warns on churn from 10 percent through less than 30 percent', () => {
    const result = evaluateSellpiaInventoryQuality(makeInput({
      previousRowCount: 10,
      previousActiveProductCodes: codes(10),
      incomingProductCodes: [...codes(9), 'NEW-1'],
    }));

    expect(result.blocked).toBe(false);
    expect(result.report.issues).toContainEqual(expect.objectContaining({
      code: `${FILE_HASH}:snapshot_churn`,
      severity: 'warning',
      count: 2,
    }));
  });

  it('records bounded missing-field and inactive-recipe warnings with stable identities', () => {
    const input = makeInput({
      facts: [
        { code: 'missing_name', rowNumber: 2, productCode: 'SP-1' },
        { code: 'missing_barcode', rowNumber: 2, productCode: 'SP-1' },
        { code: 'missing_price', rowNumber: 2, productCode: 'SP-1' },
      ],
      confirmedReferencedProductCodes: ['SP-INACTIVE'],
    });

    const first = evaluateSellpiaInventoryQuality(input);
    const second = evaluateSellpiaInventoryQuality(input);

    expect(first).toEqual(second);
    for (const warningCode of [
      'missing_name',
      'missing_barcode',
      'missing_price',
      'inactive_recipe_reference',
    ]) {
      expect(first.report.issues).toContainEqual(expect.objectContaining({
        code: `${FILE_HASH}:${warningCode}`,
        severity: 'warning',
      }));
    }
  });

  it('does not block the first valid snapshot without a baseline', () => {
    const result = evaluateSellpiaInventoryQuality(makeInput({
      previousRowCount: 0,
      previousActiveProductCodes: [],
    }));

    expect(result.blocked).toBe(false);
  });

  it('bounds sampled product codes to the shared quality-report contract', () => {
    const longCode = `SP-${'X'.repeat(150)}`;
    const result = evaluateSellpiaInventoryQuality(makeInput({
      facts: [{ code: 'missing_name', rowNumber: 2, productCode: longCode }],
    }));

    expect(result.report.issues[0]?.sampleProductCodes[0]).toHaveLength(100);
  });
});

function makeInput(
  overrides: Partial<SellpiaInventoryQualityInput> = {},
): SellpiaInventoryQualityInput {
  return {
    fileHash: FILE_HASH,
    previousRowCount: 1,
    previousActiveProductCodes: ['SP-1'],
    incomingProductCodes: ['SP-1'],
    facts: [],
    confirmedReferencedProductCodes: [],
    ...overrides,
  };
}

function codes(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `SP-${index}`);
}
