export const PRODUCTS_TRANSACTION_PORT = Symbol('PRODUCTS_TRANSACTION_PORT');

declare const productsRepositoryTransactionBrand: unique symbol;

export type ProductsRepositoryTransaction = {
  readonly [productsRepositoryTransactionBrand]?: never;
};

export interface ProductsTransactionPort {
  run<T>(
    fn: (tx: ProductsRepositoryTransaction) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>;
}
