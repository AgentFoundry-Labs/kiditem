import type { ProductsRepositoryTransaction } from '../out/transaction/products-transaction.port';

export const PRODUCT_BUNDLE_STOCK_PORT = Symbol('ProductBundleStockPort');

export interface ProductBundleStockPort {
  recomputeForComponent(
    organizationId: string,
    componentOptionId: string,
    tx: ProductsRepositoryTransaction,
  ): Promise<string[]>;
}
