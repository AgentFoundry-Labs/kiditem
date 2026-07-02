import type { ProductsRepositoryTransaction } from '../out/transaction/products-transaction.port';

export const PRODUCT_OPTION_PROVISION_PORT = Symbol('ProductOptionProvisionPort');

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

export interface ProductOptionProvisionPort {
  createProductWithOption(
    tx: ProductsRepositoryTransaction | undefined,
    organizationId: string,
    input: CreateProvisionedProductInput,
  ): Promise<ProductOptionProvisionResult>;

  createOption(
    tx: ProductsRepositoryTransaction | undefined,
    organizationId: string,
    input: CreateProvisionedOptionInput,
  ): Promise<ProductOptionProvisionResult>;

  linkOption(
    tx: ProductsRepositoryTransaction | undefined,
    organizationId: string,
    input: LinkProvisionedOptionInput,
  ): Promise<ProductOptionProvisionResult>;
}
