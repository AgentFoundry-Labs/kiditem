import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_OPTION_PROVISION_PORT,
  type CreateProvisionedOptionInput,
  type CreateProvisionedProductInput,
  type LinkProvisionedOptionInput,
  type ProductOptionProvisionPort,
  type ProductOptionProvisionResult,
} from '../../../../products/application/port/in/product-option-provision.port';
import type { ProductsRepositoryTransaction } from '../../../../products/application/port/out/transaction/products-transaction.port';
import type {
  InventoryProductOptionProvisionPort,
} from '../../../application/port/out/cross-domain/product-option-provision.port';
import type { RepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

@Injectable()
export class ProductOptionProvisionAdapter implements InventoryProductOptionProvisionPort {
  constructor(
    @Inject(PRODUCT_OPTION_PROVISION_PORT)
    private readonly provision: ProductOptionProvisionPort,
  ) {}

  createProductWithOption(
    tx: RepositoryTransaction | undefined,
    organizationId: string,
    input: CreateProvisionedProductInput,
  ): Promise<ProductOptionProvisionResult> {
    return this.provision.createProductWithOption(
      tx as ProductsRepositoryTransaction | undefined,
      organizationId,
      input,
    );
  }

  createOption(
    tx: RepositoryTransaction | undefined,
    organizationId: string,
    input: CreateProvisionedOptionInput,
  ): Promise<ProductOptionProvisionResult> {
    return this.provision.createOption(
      tx as ProductsRepositoryTransaction | undefined,
      organizationId,
      input,
    );
  }

  linkOption(
    tx: RepositoryTransaction | undefined,
    organizationId: string,
    input: LinkProvisionedOptionInput,
  ): Promise<ProductOptionProvisionResult> {
    return this.provision.linkOption(
      tx as ProductsRepositoryTransaction | undefined,
      organizationId,
      input,
    );
  }
}
