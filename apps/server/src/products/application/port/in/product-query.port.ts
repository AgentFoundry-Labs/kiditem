import type { MasterProductOperationsDetail, MasterProductOperationsListResponse } from '@kiditem/shared/product-operations';
export const PRODUCT_QUERY_PORT = Symbol('PRODUCT_QUERY_PORT');
export interface ProductQueryPort {
  listProducts(organizationId: string, query: unknown): Promise<MasterProductOperationsListResponse>;
  getProduct(organizationId: string, masterProductId: string): Promise<MasterProductOperationsDetail>;
}
