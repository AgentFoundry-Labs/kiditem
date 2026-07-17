import type {
  CreateMasterProductInput,
  CreateProductVariantInput,
  MasterProductOperationsDetail,
  MasterProductOperationsListQuery,
  MasterProductOperationsListResponse,
  ProductVariantDetail,
  UpdateMasterProductInput,
  UpdateProductVariantInput,
} from '@kiditem/shared/product-operations';

export interface ProductOperationsPort {
  listProducts(
    organizationId: string,
    query: unknown,
  ): Promise<MasterProductOperationsListResponse>;
  getProduct(
    organizationId: string,
    masterProductId: string,
  ): Promise<MasterProductOperationsDetail>;
  createProduct(
    organizationId: string,
    userId: string,
    input: CreateMasterProductInput,
  ): Promise<MasterProductOperationsDetail>;
  updateProduct(
    organizationId: string,
    masterProductId: string,
    input: UpdateMasterProductInput,
  ): Promise<MasterProductOperationsDetail>;
  createVariant(
    organizationId: string,
    userId: string,
    masterProductId: string,
    input: CreateProductVariantInput,
  ): Promise<ProductVariantDetail>;
  updateVariant(
    organizationId: string,
    productVariantId: string,
    input: UpdateProductVariantInput,
  ): Promise<ProductVariantDetail>;
}
