import type { StockTransferRow } from '../out/transfers.repository.port';

export const TRANSFERS_PORT = Symbol('TransfersPort');

export type CreateStockTransferInput = {
  optionId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string;
};

export type UpdateStockTransferInput = {
  status: string;
};

export interface TransfersPort {
  findAll(companyId: string, query: { status?: string }): Promise<StockTransferRow[]>;
  create(companyId: string, dto: CreateStockTransferInput): Promise<StockTransferRow>;
  update(
    id: string,
    dto: UpdateStockTransferInput,
    companyId: string,
  ): Promise<StockTransferRow>;
}
