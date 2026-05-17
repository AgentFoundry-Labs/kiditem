import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  PRODUCT_BUNDLE_STOCK_PORT,
  type ProductBundleStockPort,
} from '../../../../products/application/port/in/bundle-stock.port';
import type { BundleStockPort } from '../../../application/port/out/bundle-stock.port';
import type { RepositoryTransaction } from '../../../application/port/out/repository-transaction';

// Cross-owner-domain bridge to products. Inventory's stock-mutation flow calls
// products' owner-side bundle-stock port only through this adapter, which keeps
// the products dependency invisible to application/service/** code.
@Injectable()
export class BundleStockAdapter implements BundleStockPort {
  constructor(
    @Inject(PRODUCT_BUNDLE_STOCK_PORT)
    private readonly bundleStock: ProductBundleStockPort,
  ) {}

  recomputeForComponent(
    organizationId: string,
    componentOptionId: string,
    tx: RepositoryTransaction,
  ): Promise<string[]> {
    return this.bundleStock.recomputeForComponent(
      organizationId,
      componentOptionId,
      tx as Prisma.TransactionClient,
    );
  }
}
