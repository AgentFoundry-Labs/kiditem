import type { StockTransferRow } from '../../out/repository/transfers.repository.port';

export const TRANSFERS_PORT = Symbol('TransfersPort');

export type CreateStockTransferInput = {
  sellpiaInventorySkuId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string;
};

export type UpdateStockTransferInput = {
  status: string;
};

export interface TransfersPort {
  findAll(organizationId: string, query: { status?: string }): Promise<StockTransferRow[]>;
  create(organizationId: string, dto: CreateStockTransferInput): Promise<StockTransferRow>;
  update(
    id: string,
    dto: UpdateStockTransferInput,
    organizationId: string,
  ): Promise<StockTransferRow>;
}
