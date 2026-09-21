import type { MasterProductOperationsDetail } from '@kiditem/shared/product-operations';
export const PRODUCT_METADATA_PORT = Symbol('PRODUCT_METADATA_PORT');
export interface ProductMetadataPort {
  updateProduct(organizationId: string, masterProductId: string, input: unknown): Promise<MasterProductOperationsDetail>;
}
