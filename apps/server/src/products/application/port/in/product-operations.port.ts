import type {
  CreateMasterProductInput,
  MasterProductOperationsDetail,
  MasterProductOperationsListResponse,
  ReplaceChannelOptionInventoryInput,
  UpdateMasterProductInput,
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
  replaceChannelOptionInventory(
    organizationId: string,
    channelListingOptionId: string,
    input: ReplaceChannelOptionInventoryInput,
  ): Promise<MasterProductOperationsDetail>;
}
