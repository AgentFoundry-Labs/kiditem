import type { CoupangCatalogPlanResult } from '@kiditem/shared/sales-product';

export const SALES_PRODUCT_COUPANG_CATALOG_PORT = Symbol(
  'SALES_PRODUCT_COUPANG_CATALOG_PORT',
);
export interface CoupangCatalogFile {
  buffer: Uint8Array;
  fileName: string;
  contentType: string;
  changedCells: number;
  changedRows: number;
}
export interface SalesProductCoupangCatalogPort {
  plan(
    organizationId: string,
    file: Uint8Array | undefined,
  ): Promise<CoupangCatalogPlanResult>;
  file(
    organizationId: string,
    file: Uint8Array | undefined,
    fileName?: string,
  ): Promise<CoupangCatalogFile>;
}
