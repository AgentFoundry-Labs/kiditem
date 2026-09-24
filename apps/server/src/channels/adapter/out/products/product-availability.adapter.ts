import { Inject, Injectable } from '@nestjs/common';
import { PRODUCT_AVAILABILITY_PORT, type ProductAvailabilityPort } from '../../../../products/application/port/in/product-availability.port';
import type { ChannelProductAvailabilityPort } from '../../../application/port/out/products/product-availability.port';

@Injectable()
export class ProductAvailabilityAdapter implements ChannelProductAvailabilityPort {
  constructor(@Inject(PRODUCT_AVAILABILITY_PORT) private readonly products: ProductAvailabilityPort) {}
  findByMasterProductIds(input: { organizationId: string; masterProductIds: string[] }) {
    return this.products.findByMasterProductIds(input);
  }
}
