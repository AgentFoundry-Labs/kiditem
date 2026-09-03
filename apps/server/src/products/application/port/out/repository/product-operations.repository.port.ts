import type {
  CreateMasterProductInput,
  MasterProductOperationsDetail,
  MasterProductOperationsListItem,
  MasterProductOperationsListQuery,
  ProductOperationsChannelProductCount,
  ReplaceChannelOptionInventoryInput,
  UpdateMasterProductInput,
} from '@kiditem/shared/product-operations';

type ProductChannelListing = MasterProductOperationsDetail['channelListings'][number];
type ProductChannelOption = ProductChannelListing['options'][number];
type ProductChannelInventoryComponent = ProductChannelOption['inventoryComponents'][number];

export type ProductOperationsRepositoryComponent = Omit<
  ProductChannelInventoryComponent,
  'currentStock' | 'availableStock' | 'isActive'
>;

export type ProductOperationsRepositoryOption = Omit<
  ProductChannelOption,
  'capacity' | 'inventoryComponents'
> & {
  inventoryComponents: ProductOperationsRepositoryComponent[];
};

export type ProductOperationsRepositoryListing = Omit<
  ProductChannelListing,
  'options'
> & {
  options: ProductOperationsRepositoryOption[];
};

export type ProductOperationsRepositoryDetail = Omit<
  MasterProductOperationsDetail,
  | 'abc'
  | 'contribution'
  | 'displayImageUrls'
  | 'inventoryStatus'
  | 'inventoryUnits'
  | 'channelListings'
> & {
  inventorySkuIds: string[];
  channelListings: ProductOperationsRepositoryListing[];
};

export type ProductOperationsRepositoryListItem = Omit<
  MasterProductOperationsListItem,
  | 'abc'
  | 'contribution'
  | 'depletion'
  | 'displayImageUrls'
  | 'channelOptionSummary'
  | 'inventoryUnits'
  | 'inventoryStatus'
  | 'activeChannels'
> & {
  abcCreatedAt: Date;
  activeChannelProducts: Array<Omit<ProductOperationsChannelProductCount, 'count'>>;
  inventorySkuIds: string[];
  inventoryOptions: ProductOperationsRepositoryOption[];
};

export type ProductOperationsRepositoryListResult = {
  items: ProductOperationsRepositoryListItem[];
  page: number;
  limit: number;
  sellingChannelProducts: Array<Omit<ProductOperationsChannelProductCount, 'count'>>;
};

export type ProductOperationsDisplayMediaTarget = Readonly<{
  masterProductId: string;
  channelListingId: string;
  isOrigin: boolean;
  isPrimaryAccount: boolean;
  listingExternalId: string;
}>;

export type ChannelOptionInventoryReplacementResult = Readonly<{
  masterProductId: string | null;
}>;

export const PRODUCT_OPERATIONS_REPOSITORY_PORT = Symbol(
  'PRODUCT_OPERATIONS_REPOSITORY_PORT',
);

export interface ProductOperationsRepositoryPort {
  listDisplayMediaTargets(
    organizationId: string,
    masterProductIds: string[],
  ): Promise<ProductOperationsDisplayMediaTarget[]>;
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
    product: CreateMasterProductInput;
  }): Promise<ProductOperationsRepositoryDetail>;
  updateProduct(
    organizationId: string,
    masterProductId: string,
    input: UpdateMasterProductInput,
  ): Promise<ProductOperationsRepositoryDetail>;
  replaceChannelOptionInventory(input: {
    organizationId: string;
    channelListingOptionId: string;
    components: ReplaceChannelOptionInventoryInput['components'];
  }): Promise<ChannelOptionInventoryReplacementResult>;
}
