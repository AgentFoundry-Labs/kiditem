import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_MASTER_BARCODE_PORT,
  type ProductMasterBarcodePort,
} from '../../../../products/application/port/in/master-barcode.port';
import type { ChannelsProductMasterBarcodePort } from '../../../application/port/out/product-master-barcode.port';

@Injectable()
export class ChannelsProductMasterBarcodeAdapter implements ChannelsProductMasterBarcodePort {
  constructor(
    @Inject(PRODUCT_MASTER_BARCODE_PORT)
    private readonly products: ProductMasterBarcodePort,
  ) {}

  assertMasterBarcodeAvailable(input: {
    organizationId: string;
    masterId: string;
    barcode: string;
  }): Promise<void> {
    return this.products.assertMasterBarcodeAvailable(input);
  }

  updateMasterBarcode(input: {
    organizationId: string;
    masterId: string;
    barcode: string;
  }): Promise<void> {
    return this.products.updateMasterBarcode(input);
  }
}
