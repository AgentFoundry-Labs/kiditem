import type { Prisma } from '@prisma/client';

export const PRODUCT_BUNDLE_STOCK_PORT = Symbol('ProductBundleStockPort');

export interface ProductBundleStockPort {
  recomputeForComponent(
    organizationId: string,
    componentOptionId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string[]>;
}
