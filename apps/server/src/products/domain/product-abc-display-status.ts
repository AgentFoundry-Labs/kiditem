import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  productAbcSaleAgeDays,
  type ProductAbcDisplayStatus,
} from '@kiditem/shared/product-abc';

/** Display labels consume owner-derived readiness; they never publish grades. */
export function productAbcDisplayStatus(
  hasEvaluation: boolean,
  mappingValid: boolean,
  status: {
    sellpia: { status: string };
    advertising: { status: string };
    actualCutoff: string | null;
  },
  saleStartDate: string | null,
): ProductAbcDisplayStatus {
  if (!mappingValid) return 'SOURCE_UNMAPPED';
  if (status.sellpia.status !== 'READY') return 'SELLPIA_SOURCE_STALE';
  if (status.advertising.status !== 'READY') return 'AD_SOURCE_STALE';
  if (hasEvaluation) return 'READY';
  const saleAge = productAbcSaleAgeDays(saleStartDate, status.actualCutoff);
  if (saleAge !== null && saleAge < PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.minimumSaleAgeDays) {
    return 'NEW';
  }
  return 'INSUFFICIENT_EVIDENCE';
}
