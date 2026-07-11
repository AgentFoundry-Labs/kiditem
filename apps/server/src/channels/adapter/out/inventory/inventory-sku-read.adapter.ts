import { Inject, Injectable } from '@nestjs/common';
import {
  INVENTORY_SKU_READ_PORT,
  type InventorySkuReadModel,
  type InventorySkuReadPort,
} from '../../../../inventory/application/port/in/stock/inventory-sku-read.port';
import type { CandidateInventorySku } from '../../../domain/channel-sku-candidate-ranking';
import type { ChannelsInventorySkuReadPort } from '../../../application/port/out/cross-domain/inventory-sku-read.port';

@Injectable()
export class ChannelsInventorySkuReadAdapter implements ChannelsInventorySkuReadPort {
  constructor(
    @Inject(INVENTORY_SKU_READ_PORT)
    private readonly inventory: InventorySkuReadPort,
  ) {}

  async findByIds(organizationId: string, ids: string[]): Promise<CandidateInventorySku[]> {
    return this.map(this.inventory.findByIds(organizationId, ids));
  }

  async findBySellpiaCodes(
    organizationId: string,
    codes: string[],
  ): Promise<CandidateInventorySku[]> {
    return this.map(this.inventory.findBySellpiaCodes(organizationId, codes));
  }

  async findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<CandidateInventorySku[]> {
    return this.map(this.inventory.findByBarcodes(organizationId, barcodes));
  }

  async search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<CandidateInventorySku[]> {
    return this.map(this.inventory.search(organizationId, query, limit));
  }

  private async map(
    rows: Promise<InventorySkuReadModel[]>,
  ): Promise<CandidateInventorySku[]> {
    return (await rows).map((row) => ({
      id: row.id,
      sellpiaProductCode: row.sellpiaProductCode,
      name: row.name,
      optionName: row.optionName,
      barcode: row.barcode,
      reportedStock: row.reportedStock,
    }));
  }
}
