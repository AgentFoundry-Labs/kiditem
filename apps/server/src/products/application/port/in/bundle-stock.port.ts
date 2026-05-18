import type { ProductsRepositoryTransaction } from '../out/products-transaction.port';

export const PRODUCT_BUNDLE_STOCK_PORT = Symbol('ProductBundleStockPort');

export interface ProductBundleStockPort {
  recomputeForComponent(
    organizationId: string,
    componentOptionId: string,
    tx: ProductsRepositoryTransaction,
  ): Promise<string[]>;
}
