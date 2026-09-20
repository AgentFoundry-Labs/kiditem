import type { StockTransferRow } from '../../out/persistence/transfers.repository.port';

export const TRANSFERS_PORT = Symbol('TransfersPort');

export type CreateStockTransferInput = {
  sellpiaInventorySkuId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string;
};

export interface TransfersPort {
  findAll(organizationId: string, query: { status?: string }): Promise<StockTransferRow[]>;
  create(organizationId: string, dto: CreateStockTransferInput): Promise<StockTransferRow>;
}
