import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_OPTION_PROVISION_PORT,
  type CreateProvisionedOptionInput,
  type CreateProvisionedProductInput,
  type LinkProvisionedOptionInput,
  type ProductOptionProvisionPort,
  type ProductOptionProvisionResult,
} from '../port/in/product-option-provision.port';
import {
  MASTER_CODE_PORT,
  type MasterCodePort,
} from '../port/out/repository/master-code.port';
import {
  MASTER_PRODUCT_REPOSITORY_PORT,
  type MasterProductRepositoryPort,
} from '../port/out/repository/master-product.repository.port';
import {
  PRODUCTS_TRANSACTION_PORT,
  type ProductsRepositoryTransaction,
  type ProductsTransactionPort,
} from '../port/out/transaction/products-transaction.port';
import { OptionsService } from './options.service';

export { PRODUCT_OPTION_PROVISION_PORT } from '../port/in/product-option-provision.port';

@Injectable()
export class ProductOptionProvisionService implements ProductOptionProvisionPort {
  constructor(
    @Inject(MASTER_PRODUCT_REPOSITORY_PORT)
    private readonly masters: MasterProductRepositoryPort,
    @Inject(MASTER_CODE_PORT)
    private readonly codeSvc: MasterCodePort,
    @Inject(PRODUCTS_TRANSACTION_PORT)
    private readonly transactions: ProductsTransactionPort,
    private readonly optionsSvc: OptionsService,
  ) {}

  createProductWithOption(
    tx: ProductsRepositoryTransaction | undefined,
    organizationId: string,
    input: CreateProvisionedProductInput,
  ): Promise<ProductOptionProvisionResult> {
    const exec = async (repoTx: ProductsRepositoryTransaction) => {
      const code = await this.codeSvc.generate(repoTx);
      const master = await this.masters.createPromoted({
        organizationId,
        tx: repoTx,
        images: [],
        data: {
          organizationId,
          code,
          name: input.masterName,
          description: '',
          legacyCode: input.legacyCode,
          barcode: normalizedBarcode(input.barcode),
          lifecycleState: 'active',
        },
      });
      const option = await this.optionsSvc.create(
        organizationId,
        {
          masterId: master.id,
          optionName: input.optionName ?? undefined,
          legacyCode: input.legacyCode,
          barcode: normalizedBarcode(input.barcode) ?? undefined,
        },
        repoTx,
      );
      return { masterId: master.id, optionId: option.id };
    };
    return tx ? exec(tx) : this.transactions.run(exec, { timeout: 15000 });
  }

  async createOption(
    tx: ProductsRepositoryTransaction | undefined,
    organizationId: string,
    input: CreateProvisionedOptionInput,
  ): Promise<ProductOptionProvisionResult> {
    const exec = async (repoTx: ProductsRepositoryTransaction) => {
      const option = await this.optionsSvc.create(
        organizationId,
        {
          masterId: input.masterProductId,
          optionName: input.optionName ?? undefined,
          legacyCode: input.legacyCode,
          barcode: normalizedBarcode(input.barcode) ?? undefined,
        },
        repoTx,
      );
      return { masterId: option.masterId, optionId: option.id };
    };
    return tx ? exec(tx) : this.transactions.run(exec, { timeout: 15000 });
  }

  async linkOption(
    tx: ProductsRepositoryTransaction | undefined,
    organizationId: string,
    input: LinkProvisionedOptionInput,
  ): Promise<ProductOptionProvisionResult> {
    const exec = async (repoTx: ProductsRepositoryTransaction) => {
      const option = await this.optionsSvc.update(
        organizationId,
        input.productOptionId,
        { legacyCode: input.legacyCode },
        repoTx,
      );
      if (option.isBundle) {
        throw new BadRequestException('Sellpia candidate cannot link to a bundle option');
      }
      return { masterId: option.masterId, optionId: option.id };
    };
    return tx ? exec(tx) : this.transactions.run(exec, { timeout: 15000 });
  }
}

function normalizedBarcode(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  return /^\d{13}$/.test(text) ? text : null;
}
