import type {
  CreateMasterProductInput,
  CreateProductVariantInput,
  MasterProductOperationsDetail,
  MasterProductOperationsListQuery,
  MasterProductOperationsListResponse,
  ProductVariantDetail,
  ProductVariantRecipeComponentInput,
  UpdateMasterProductInput,
  UpdateProductVariantInput,
} from '@kiditem/shared/product-operations';

export type NormalizedCreateProductVariant = Omit<
  CreateProductVariantInput,
  'optionLabel' | 'isDefault' | 'isActive' | 'components'
> & {
  optionLabel: string | null;
  isDefault: boolean;
  isActive: boolean;
  components: ProductVariantRecipeComponentInput[];
};

export type NormalizedCreateMasterProduct = Omit<
  CreateMasterProductInput,
  'variants'
> & {
  variants: NormalizedCreateProductVariant[];
};

export const PRODUCT_OPERATIONS_REPOSITORY_PORT = Symbol(
  'PRODUCT_OPERATIONS_REPOSITORY_PORT',
);

export interface ProductOperationsRepositoryPort {
  listProducts(
    organizationId: string,
    query: MasterProductOperationsListQuery,
  ): Promise<MasterProductOperationsListResponse>;
  getProduct(
    organizationId: string,
    masterProductId: string,
  ): Promise<MasterProductOperationsDetail>;
  createProduct(input: {
    organizationId: string;
    userId: string;
    product: NormalizedCreateMasterProduct;
  }): Promise<MasterProductOperationsDetail>;
  updateProduct(
    organizationId: string,
    masterProductId: string,
    input: UpdateMasterProductInput,
  ): Promise<MasterProductOperationsDetail>;
  createVariant(input: {
    organizationId: string;
    userId: string;
    masterProductId: string;
    variant: NormalizedCreateProductVariant;
  }): Promise<ProductVariantDetail>;
  updateVariant(
    organizationId: string,
    productVariantId: string,
    input: UpdateProductVariantInput,
  ): Promise<ProductVariantDetail>;
  replaceRecipe(input: {
    organizationId: string;
    userId: string;
    productVariantId: string;
    components: ProductVariantRecipeComponentInput[];
  }): Promise<ProductVariantDetail>;
}
