import type { MasterProductOperationsDetail } from '@kiditem/shared/product-operations';
export const PRODUCT_SOURCE_BINDING_PORT = Symbol('PRODUCT_SOURCE_BINDING_PORT');
export interface ProductSourceBindingPort {
  correctSourceBinding(organizationId: string, masterProductId: string, input: unknown): Promise<MasterProductOperationsDetail>;
}
