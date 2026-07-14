import type {
  SellpiaMasterProductReadModel,
  SellpiaMasterProductReadPort,
} from '../../in/stock/sellpia-master-product-read.port';

export const SELLPIA_MASTER_PRODUCT_READ_REPOSITORY_PORT = Symbol(
  'SELLPIA_MASTER_PRODUCT_READ_REPOSITORY_PORT',
);

export type SellpiaMasterProductReadRepositoryPort = SellpiaMasterProductReadPort;
export type { SellpiaMasterProductReadModel };
