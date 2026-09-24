import type {
  SalesProductMallCategoryAssignResult,
  SalesProductPublicImagePending,
  SalesProductMallSheetCategoryList,
  SalesProductMallSheetCheck,
  SalesProductMallSheetList,
} from '@kiditem/shared/sales-product';

export const SALES_PRODUCT_MALL_SHEET_PORT = Symbol(
  'SALES_PRODUCT_MALL_SHEET_PORT',
);
export interface MallSheetFile {
  buffer: Uint8Array;
  fileName: string;
  contentType: string;
  products: number;
  rows: number;
}
export interface SalesProductMallSheetPort {
  list(): SalesProductMallSheetList;
  check(
    organizationId: string,
    sheetKey: string,
    body: unknown,
  ): Promise<SalesProductMallSheetCheck>;
  file(
    organizationId: string,
    sheetKey: string,
    body: unknown,
  ): Promise<MallSheetFile>;
  assignCategory(
    organizationId: string,
    body: unknown,
  ): Promise<SalesProductMallCategoryAssignResult>;
  searchCategories(
    sheetKey: string,
    query: string,
    mallKey?: string,
  ): Promise<SalesProductMallSheetCategoryList>;
  pendingPublicImages(
    organizationId: string,
    body: unknown,
  ): Promise<SalesProductPublicImagePending>;
  savePublicImages(
    organizationId: string,
    body: unknown,
  ): Promise<{
    saved: number;
  }>;
}
