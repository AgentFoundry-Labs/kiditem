import type { RepositoryTransaction } from '../transaction/repository-transaction';

export const INVENTORY_PRODUCT_OPTION_PROVISION_PORT =
  Symbol('InventoryProductOptionProvisionPort');

export type ProductOptionProvisionResult = {
  masterId: string;
  optionId: string;
};

export type CreateProvisionedProductInput = {
  masterName: string;
  optionName?: string | null;
  legacyCode: string;
  barcode?: string | null;
};

export type CreateProvisionedOptionInput = {
  masterProductId: string;
  optionName?: string | null;
  legacyCode: string;
  barcode?: string | null;
};

export type LinkProvisionedOptionInput = {
  productOptionId: string;
  legacyCode: string;
};

export interface InventoryProductOptionProvisionPort {
  createProductWithOption(
    tx: RepositoryTransaction | undefined,
    organizationId: string,
    input: CreateProvisionedProductInput,
  ): Promise<ProductOptionProvisionResult>;

  createOption(
    tx: RepositoryTransaction | undefined,
    organizationId: string,
    input: CreateProvisionedOptionInput,
  ): Promise<ProductOptionProvisionResult>;

  linkOption(
    tx: RepositoryTransaction | undefined,
    organizationId: string,
    input: LinkProvisionedOptionInput,
  ): Promise<ProductOptionProvisionResult>;
}
