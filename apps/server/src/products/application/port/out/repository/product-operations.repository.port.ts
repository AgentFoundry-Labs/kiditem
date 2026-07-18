import type {
  CreateMasterProductInput,
  CreateProductVariantInput,
  MasterProductOperationsDetail,
  MasterProductOperationsListItem,
  MasterProductOperationsListQuery,
  MasterProductOperationsListResponse,
  ProductVariantDetail,
  ProductVariantComponentDetail,
  ReplaceProductVariantRecipeInput,
  ProductVariantRecipeComponentInput,
  UpdateMasterProductInput,
  UpdateProductVariantInput,
} from '@kiditem/shared/product-operations';

export type ProductOperationsRepositoryComponent = Omit<
  ProductVariantComponentDetail,
  'currentStock' | 'activeCommitmentQuantity' | 'availableStock' | 'isActive'
>;

export type ProductOperationsRepositoryVariant = Omit<
  ProductVariantDetail,
  'components' | 'capacity' | 'warningState'
> & {
  components: ProductOperationsRepositoryComponent[];
};

export type ProductOperationsRepositoryDetail = Omit<
  MasterProductOperationsDetail,
  'inventoryStatus' | 'inventoryUnits' | 'variants'
> & {
  variants: ProductOperationsRepositoryVariant[];
};

export type ProductOperationsRepositoryListItem = Omit<
  MasterProductOperationsListItem,
  'depletion' | 'variantSummary' | 'inventoryUnits' | 'inventoryStatus'
> & {
  variants: ProductOperationsRepositoryVariant[];
};

export type ProductOperationsRepositoryListResult = {
  items: ProductOperationsRepositoryListItem[];
  page: number;
  limit: number;
};

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
  ): Promise<ProductOperationsRepositoryListResult>;
  getProduct(
    organizationId: string,
    masterProductId: string,
  ): Promise<ProductOperationsRepositoryDetail>;
  createProduct(input: {
    organizationId: string;
    userId: string;
    product: NormalizedCreateMasterProduct;
  }): Promise<ProductOperationsRepositoryDetail>;
  updateProduct(
    organizationId: string,
    masterProductId: string,
    input: UpdateMasterProductInput,
  ): Promise<ProductOperationsRepositoryDetail>;
  createVariant(input: {
    organizationId: string;
    userId: string;
    masterProductId: string;
    variant: NormalizedCreateProductVariant;
  }): Promise<ProductOperationsRepositoryVariant>;
  updateVariant(
    organizationId: string,
    productVariantId: string,
    input: UpdateProductVariantInput,
  ): Promise<ProductOperationsRepositoryVariant>;
  replaceRecipe(input: {
    organizationId: string;
    userId: string;
    productVariantId: string;
    components: ProductVariantRecipeComponentInput[];
    expectedRecipe: ReplaceProductVariantRecipeInput['expectedRecipe'];
  }): Promise<ProductOperationsRepositoryVariant>;
}
