import type {
  ProductOperationsDataSourceStatus,
  ProductOperationsDataStatus,
  ProductOperationsPeriodDays,
} from '@kiditem/shared/product-operations';

export const PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT = Symbol(
  'PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT',
);

export type ProductOperationsDataStatusFacts = {
  displayDataAsOf: string | null;
  sources: Record<
    'traffic' | 'advertising' | 'sellpiaProfit' | 'abc',
    ProductOperationsDataSourceStatus
  >;
  abcSummary: ProductOperationsDataStatus['abcSummary'];
};

export interface ProductOperationsDataStatusRepositoryPort {
  read(
    organizationId: string,
    periodDays: ProductOperationsPeriodDays,
  ): Promise<ProductOperationsDataStatusFacts>;
}
