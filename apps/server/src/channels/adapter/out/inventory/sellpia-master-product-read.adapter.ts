import { Inject, Injectable } from '@nestjs/common';
import {
  SELLPIA_MASTER_PRODUCT_READ_PORT,
  type SellpiaMasterProductReadModel,
  type SellpiaMasterProductReadPort,
} from '../../../../inventory/application/port/in/stock/sellpia-master-product-read.port';
import type { CandidateSellpiaMasterProduct } from '../../../domain/channel-sku-candidate-ranking';
import type { ChannelsSellpiaMasterProductReadPort } from '../../../application/port/out/cross-domain/sellpia-master-product-read.port';

@Injectable()
export class ChannelsSellpiaMasterProductReadAdapter
implements ChannelsSellpiaMasterProductReadPort {
  constructor(
    @Inject(SELLPIA_MASTER_PRODUCT_READ_PORT)
    private readonly inventory: SellpiaMasterProductReadPort,
  ) {}

  async findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<CandidateSellpiaMasterProduct[]> {
    return this.map(this.inventory.findByIds(organizationId, ids));
  }

  async findBySellpiaCodes(
    organizationId: string,
    codes: string[],
  ): Promise<CandidateSellpiaMasterProduct[]> {
    return this.map(this.inventory.findByCodes(organizationId, codes));
  }

  async findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<CandidateSellpiaMasterProduct[]> {
    return this.map(this.inventory.findByBarcodes(organizationId, barcodes));
  }

  async search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<CandidateSellpiaMasterProduct[]> {
    return this.map(this.inventory.search(organizationId, query, limit));
  }

  private async map(
    rows: Promise<SellpiaMasterProductReadModel[]>,
  ): Promise<CandidateSellpiaMasterProduct[]> {
    return (await rows).map((row) => ({
      id: row.id,
      sellpiaProductCode: row.code,
      name: row.name,
      optionName: row.optionName,
      barcode: row.barcode,
      currentStock: row.currentStock,
      purchasePrice: row.purchasePrice,
    }));
  }
}
