import { Inject, Injectable } from '@nestjs/common';
import {
  MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
  type MarketplaceRegistrationRepositoryPort,
  type RegisterConfirmedListingInput,
} from '../port/out/channel-listing.repository.port';
import {
  CHANNELS_PRODUCT_MASTER_BARCODE_PORT,
  type ChannelsProductMasterBarcodePort,
} from '../port/out/product-master-barcode.port';

export interface RegisterConfirmedMarketplaceListingInput
  extends RegisterConfirmedListingInput {
  productBarcode?: string | null;
}

@Injectable()
export class MarketplaceRegistrationService {
  constructor(
    @Inject(MARKETPLACE_REGISTRATION_REPOSITORY_PORT)
    private readonly repository: MarketplaceRegistrationRepositoryPort,
    @Inject(CHANNELS_PRODUCT_MASTER_BARCODE_PORT)
    private readonly productBarcodes: ChannelsProductMasterBarcodePort,
  ) {}

  async registerConfirmedListing(
    organizationId: string,
    input: RegisterConfirmedMarketplaceListingInput,
  ) {
    const { productBarcode, ...listingInput } = input;
    const barcode = productBarcode?.trim();
    if (barcode) {
      await this.productBarcodes.assertMasterBarcodeAvailable({
        organizationId,
        masterId: input.masterId,
        barcode,
      });
    }

    const listing = await this.repository.registerConfirmedListing(organizationId, listingInput);
    if (barcode) {
      await this.productBarcodes.updateMasterBarcode({
        organizationId,
        masterId: input.masterId,
        barcode,
      });
    }
    return listing;
  }
}
