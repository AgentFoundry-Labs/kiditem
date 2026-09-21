import type { ProductSourceChange } from '../../../../domain/product-source-change';
import type {
  MasterProductOperationsDetail,
  MasterProductOperationsListItem,
  MasterProductOperationsListQuery,
  ProductOperationsChannelProductCount,
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
  | 'abcGrade'
  | 'abcEvaluation'
  | 'contribution'
  | 'displayImageUrls'
  | 'inventory'
  | 'inventoryUnits'
  | 'channelListings'
> & {
  inventorySkuIds: string[];
  channelListings: ProductOperationsRepositoryListing[];
};

export type ProductOperationsRepositoryListItem = Omit<
  MasterProductOperationsListItem,
  | 'abc'
  | 'abcGrade'
  | 'abcEvaluation'
  | 'contribution'
  | 'depletion'
  | 'displayImageUrls'
  | 'channelOptionSummary'
  | 'inventoryUnits'
  | 'inventory'
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
  isPrimaryAccount: boolean;
  listingExternalId: string;
}>;

export const PRODUCT_OPERATIONS_REPOSITORY_PORT = Symbol(
  'PRODUCT_OPERATIONS_REPOSITORY_PORT',
);

export interface ProductOperationsRepositoryPort {
  correctSourceBinding(organizationId: string, masterProductId: string, change: ProductSourceChange): Promise<void>;
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
  updateProduct(
    organizationId: string,
    masterProductId: string,
    input: UpdateMasterProductInput,
  ): Promise<ProductOperationsRepositoryDetail>;
}
