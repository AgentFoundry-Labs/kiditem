import type { CandidateInventorySku } from '../../../../domain/channel-sku-candidate-ranking';

export const CHANNELS_INVENTORY_SKU_READ_PORT = Symbol(
  'CHANNELS_INVENTORY_SKU_READ_PORT',
);

export interface ChannelsInventorySkuReadPort {
  findByIds(organizationId: string, ids: string[]): Promise<CandidateInventorySku[]>;
  findBySellpiaCodes(
    organizationId: string,
    codes: string[],
  ): Promise<CandidateInventorySku[]>;
  findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<CandidateInventorySku[]>;
  search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<CandidateInventorySku[]>;
}
