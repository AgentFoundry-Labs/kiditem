import type { SellpiaProductSalesSummary } from '@kiditem/shared/dashboard';

/**
 * The depletion read `/api/sellpia-product-sales` serves, for in-process
 * readers. The dashboard's findings pick declining and reorder-needed products
 * out of it; the trend, reorder, and months-left verdicts stay this owner's.
 */
export interface SellpiaProductSalesSummaryReadPort {
  getSummary(organizationId: string): Promise<SellpiaProductSalesSummary>;
}

export const SELLPIA_PRODUCT_SALES_SUMMARY_READ_PORT = Symbol(
  'SELLPIA_PRODUCT_SALES_SUMMARY_READ_PORT',
);
