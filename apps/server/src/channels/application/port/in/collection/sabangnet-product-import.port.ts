import type {
  SabangnetImportPreview,
  SabangnetImportSelection,
} from '@kiditem/shared/sales-product';

export const SABANGNET_PRODUCT_IMPORT_PORT = Symbol(
  'SABANGNET_PRODUCT_IMPORT_PORT',
);
export interface UploadedWorkbook {
  originalname: string;
  buffer: Uint8Array;
}
export interface SabangnetProductImportPort {
  import(
    organizationId: string,
    files: readonly UploadedWorkbook[],
    dryRun: boolean,
    selections?: SabangnetImportSelection,
  ): Promise<SabangnetImportPreview>;
}
