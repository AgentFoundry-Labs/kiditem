import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ProductMasterBarcodePort } from '../port/in/master-barcode.port';
import {
  MASTER_PRODUCT_REPOSITORY_PORT,
  type MasterProductRepositoryPort,
} from '../port/out/master-product.repository.port';
import {
  PRODUCT_OPTION_REPOSITORY_PORT,
  type ProductOptionRepositoryPort,
} from '../port/out/product-option.repository.port';
import {
  PRODUCTS_TRANSACTION_PORT,
  type ProductsRepositoryTransaction,
  type ProductsTransactionPort,
} from '../port/out/products-transaction.port';

@Injectable()
export class MasterBarcodeService implements ProductMasterBarcodePort {
  constructor(
    @Inject(MASTER_PRODUCT_REPOSITORY_PORT)
    private readonly masters: MasterProductRepositoryPort,
    @Inject(PRODUCT_OPTION_REPOSITORY_PORT)
    private readonly options: ProductOptionRepositoryPort,
    @Inject(PRODUCTS_TRANSACTION_PORT)
    private readonly transactions: ProductsTransactionPort,
  ) {}

  async updateMasterBarcode(input: {
    organizationId: string;
    masterId: string;
    barcode: string;
  }): Promise<void> {
    const barcode = input.barcode.trim();
    if (!barcode) return;

    await this.transactions.run(async (tx) => {
      await this.assertAvailableTx(tx, input.organizationId, input.masterId, barcode);

      await this.masters.update({
        organizationId: input.organizationId,
        id: input.masterId,
        data: { barcode },
        tx,
      });
    });
  }

  async assertMasterBarcodeAvailable(input: {
    organizationId: string;
    masterId: string;
    barcode: string;
  }): Promise<void> {
    const barcode = input.barcode.trim();
    if (!barcode) return;

    await this.transactions.run((tx) =>
      this.assertAvailableTx(tx, input.organizationId, input.masterId, barcode),
    );
  }

  private async assertAvailableTx(
    tx: ProductsRepositoryTransaction,
    organizationId: string,
    masterId: string,
    barcode: string,
  ): Promise<void> {
    const masterOwners = await this.masters.findActiveBarcodeOwners({
      organizationId,
      barcode,
      tx,
    });
    const otherMaster = masterOwners.find((owner) => owner.id !== masterId);
    if (otherMaster) {
      throw new ConflictException(
        `이미 다른 상품에서 사용 중인 바코드입니다. (${otherMaster.code})`,
      );
    }

    const optionOwner = await this.options.findActiveByBarcode(tx, organizationId, barcode);
    if (optionOwner && optionOwner.masterId !== masterId) {
      throw new ConflictException(
        `이미 다른 옵션에서 사용 중인 바코드입니다. (${optionOwner.sku})`,
      );
    }
  }
}
