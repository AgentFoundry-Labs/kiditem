export const PRODUCT_MASTER_BARCODE_PORT = Symbol('PRODUCT_MASTER_BARCODE_PORT');

export interface ProductMasterBarcodePort {
  assertMasterBarcodeAvailable(input: {
    organizationId: string;
    masterId: string;
    barcode: string;
  }): Promise<void>;

  updateMasterBarcode(input: {
    organizationId: string;
    masterId: string;
    barcode: string;
  }): Promise<void>;
}
