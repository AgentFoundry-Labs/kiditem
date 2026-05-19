export const CHANNELS_PRODUCT_MASTER_BARCODE_PORT = Symbol(
  'CHANNELS_PRODUCT_MASTER_BARCODE_PORT',
);

export interface ChannelsProductMasterBarcodePort {
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
