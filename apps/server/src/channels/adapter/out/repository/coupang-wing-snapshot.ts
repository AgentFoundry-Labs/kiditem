import type {
  ParsedWingCatalogRow,
  ParsedWingCatalogSkippedRow,
} from '../../../application/service/coupang-wing-workbook.parser';

export type CoupangWingSnapshotCoverage = {
  externalProductIds: string[];
  externalSkuIds: string[];
  canDeactivateUnseenProducts: boolean;
  canDeactivateUnseenSkus: boolean;
};

export function buildCoupangWingSnapshotCoverage(
  rows: ParsedWingCatalogRow[],
  skippedRows: ParsedWingCatalogSkippedRow[],
): CoupangWingSnapshotCoverage {
  const externalProductIds = new Set(rows.map((row) => row.externalProductId));
  const externalSkuIds = new Set(rows.map((row) => row.externalSkuId));

  for (const skippedRow of skippedRows) {
    if (skippedRow.externalProductId) {
      externalProductIds.add(skippedRow.externalProductId);
    }
    if (skippedRow.externalSkuId) {
      externalSkuIds.add(skippedRow.externalSkuId);
    }
  }

  return {
    externalProductIds: [...externalProductIds],
    externalSkuIds: [...externalSkuIds],
    canDeactivateUnseenProducts: skippedRows.every(
      (row) => Boolean(row.externalProductId),
    ),
    canDeactivateUnseenSkus: skippedRows.every(
      (row) => Boolean(row.externalSkuId),
    ),
  };
}
