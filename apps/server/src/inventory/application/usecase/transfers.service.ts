import { InventoryItemNotFoundError } from '../exception/inventory-operation.error';
import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSFERS_PORT,
  type CreateStockTransferInput,
  type TransfersPort,
} from '../port/in/warehouse/transfers.port';
import {
  TRANSFERS_REPOSITORY_PORT,
  type StockTransferRow,
  type TransfersRepositoryPort,
} from '../port/out/persistence/transfers.repository.port';
export { TRANSFERS_PORT } from '../port/in/warehouse/transfers.port';

@Injectable()
export class TransfersService implements TransfersPort {
  constructor(
    @Inject(TRANSFERS_REPOSITORY_PORT)
    private readonly repository: TransfersRepositoryPort,
  ) {}

  findAll(organizationId: string, query: { status?: string }): Promise<StockTransferRow[]> {
    return this.repository.listStockTransfers(organizationId, query.status);
  }

  async create(
    organizationId: string,
    dto: CreateStockTransferInput,
  ): Promise<StockTransferRow> {
    const inventorySku = await this.repository.findInventorySkuForTransfer(
      dto.sellpiaInventorySkuId,
      organizationId,
    );
    if (!inventorySku) throw new InventoryItemNotFoundError('Sellpia inventory SKU not found');

    const warehouseIds = [...new Set([
      dto.fromWarehouseId,
      dto.toWarehouseId,
    ])];
    const organizationWarehouseIds = await this.repository.findWarehouseIdsForTransfer(
      warehouseIds,
      organizationId,
    );
    if (organizationWarehouseIds.length !== warehouseIds.length) {
      throw new InventoryItemNotFoundError('Warehouse not found');
    }

    return this.repository.createStockTransfer(organizationId, {
      sellpiaInventorySkuId: dto.sellpiaInventorySkuId,
      optionName: inventorySku.optionName,
      fromWarehouseId: dto.fromWarehouseId,
      toWarehouseId: dto.toWarehouseId,
      quantity: dto.quantity,
      notes: dto.notes,
    });
  }

}
