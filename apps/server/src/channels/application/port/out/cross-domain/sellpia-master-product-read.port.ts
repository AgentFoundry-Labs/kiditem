import type { CandidateSellpiaMasterProduct } from '../../../../domain/channel-sku-candidate-ranking';

export const CHANNELS_SELLPIA_MASTER_PRODUCT_READ_PORT = Symbol(
  'CHANNELS_SELLPIA_MASTER_PRODUCT_READ_PORT',
);

export interface ChannelsSellpiaMasterProductReadPort {
  findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<CandidateSellpiaMasterProduct[]>;
  findBySellpiaCodes(
    organizationId: string,
    codes: string[],
  ): Promise<CandidateSellpiaMasterProduct[]>;
  findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<CandidateSellpiaMasterProduct[]>;
  findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<CandidateSellpiaMasterProduct[]>;
  search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<CandidateSellpiaMasterProduct[]>;
}
