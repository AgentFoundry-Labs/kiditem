import { Inject, Injectable } from '@nestjs/common';
import {
  SALES_PRODUCT_PORT,
  type SalesProductPort,
} from '../../../../channels/application/port/in/sales-product.port';
import type { SalesProductOwnerReadPort } from '../../../application/port/out/cross-domain/sales-product-owner.port';

/**
 * Channels answers whether a draft exists in this organization; its `get`
 * already throws `NotFoundException` for a missing or foreign row, which is
 * exactly the fence AI wants before it opens a workspace on that id.
 */
@Injectable()
export class SalesProductOwnerReadAdapter implements SalesProductOwnerReadPort {
  constructor(
    @Inject(SALES_PRODUCT_PORT)
    private readonly salesProducts: SalesProductPort,
  ) {}

  async assertOwner(input: { organizationId: string; salesProductId: string }): Promise<void> {
    await this.salesProducts.get(input.organizationId, input.salesProductId);
  }
}
