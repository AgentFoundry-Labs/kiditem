import { describe, expect, it } from 'vitest';
import type {
  ParsedWingCatalogRow,
  ParsedWingCatalogSkippedRow,
} from '../../../application/service/coupang-wing-workbook.parser';
import { buildCoupangWingSnapshotCoverage } from './coupang-wing-snapshot';

describe('buildCoupangWingSnapshotCoverage', () => {
  it('retains recoverable skipped identities and disables only incomplete absence checks', () => {
    const validRows = [makeRow('P-VALID', 'S-VALID')];

    expect(buildCoupangWingSnapshotCoverage(validRows, [
      skipped('missing_sku_id', 'P-RECOVERED', null),
    ])).toEqual({
      externalProductIds: ['P-VALID', 'P-RECOVERED'],
      externalSkuIds: ['S-VALID'],
      canDeactivateUnseenProducts: true,
      canDeactivateUnseenSkus: false,
    });

    expect(buildCoupangWingSnapshotCoverage(validRows, [
      skipped('missing_product_id', null, 'S-RECOVERED'),
    ])).toEqual({
      externalProductIds: ['P-VALID'],
      externalSkuIds: ['S-VALID', 'S-RECOVERED'],
      canDeactivateUnseenProducts: false,
      canDeactivateUnseenSkus: true,
    });
  });

  it('does not authorize destructive absence checks for mixed or identity-less skips', () => {
    const validRows = [makeRow('P-VALID', 'S-VALID')];
    const mixed = buildCoupangWingSnapshotCoverage(validRows, [
      skipped('missing_sku_id', 'P-RECOVERED', null),
      skipped('missing_product_id', null, 'S-RECOVERED'),
    ]);
    const identityLess = buildCoupangWingSnapshotCoverage(validRows, [
      skipped('missing_product_id', null, null),
    ]);

    expect(mixed.canDeactivateUnseenProducts).toBe(false);
    expect(mixed.canDeactivateUnseenSkus).toBe(false);
    expect(identityLess.canDeactivateUnseenProducts).toBe(false);
    expect(identityLess.canDeactivateUnseenSkus).toBe(false);
  });

  it('keeps normal full-snapshot deactivation when every source row is valid', () => {
    expect(buildCoupangWingSnapshotCoverage(
      [makeRow('P-VALID', 'S-VALID')],
      [],
    )).toEqual({
      externalProductIds: ['P-VALID'],
      externalSkuIds: ['S-VALID'],
      canDeactivateUnseenProducts: true,
      canDeactivateUnseenSkus: true,
    });
  });
});

function skipped(
  reason: ParsedWingCatalogSkippedRow['reason'],
  externalProductId: string | null,
  externalSkuId: string | null,
): ParsedWingCatalogSkippedRow {
  return {
    rowNumber: 6,
    reason,
    externalProductId,
    externalSkuId,
  };
}

function makeRow(
  externalProductId: string,
  externalSkuId: string,
): ParsedWingCatalogRow {
  return {
    rowNumber: 5,
    externalProductId,
    registeredName: null,
    displayName: null,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: null,
    externalSkuId,
    optionName: null,
    skuStatus: null,
    modelNumber: null,
    barcode: null,
    rawJson: {},
  };
}
