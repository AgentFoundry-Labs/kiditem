import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  TRANSFERS_PORT,
  type CreateStockTransferInput,
  type TransfersPort,
  type UpdateStockTransferInput,
} from '../port/in/warehouse/transfers.port';
import {
  TRANSFERS_REPOSITORY_PORT,
  type StockTransferRow,
  type TransfersRepositoryPort,
} from '../port/out/repository/transfers.repository.port';
import {
  assertValidStockTransferTransition,
  InvalidStockTransferTransition,
} from '../../domain/policy/stock-transfer-transition';

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
      dto.inventorySkuId,
      organizationId,
    );
    if (!inventorySku) throw new NotFoundException('InventorySku not found');

    const warehouseIds = [...new Set([
      dto.fromWarehouseId,
      dto.toWarehouseId,
    ])];
    const organizationWarehouseIds = await this.repository.findWarehouseIdsForTransfer(
      warehouseIds,
      organizationId,
    );
    if (organizationWarehouseIds.length !== warehouseIds.length) {
      throw new NotFoundException('Warehouse not found');
    }

    return this.repository.createStockTransfer(organizationId, {
      inventorySkuId: dto.inventorySkuId,
      optionId: inventorySku.legacyOptionId,
      optionName: inventorySku.optionName,
      fromWarehouseId: dto.fromWarehouseId,
      toWarehouseId: dto.toWarehouseId,
      quantity: dto.quantity,
      notes: dto.notes,
    });
  }

  async update(
    id: string,
    dto: UpdateStockTransferInput,
    organizationId: string,
  ): Promise<StockTransferRow> {
    const existing = await this.repository.findStockTransferById(id, organizationId);
    if (!existing) throw new NotFoundException('재고 이동을 찾을 수 없습니다');

    try {
      assertValidStockTransferTransition(existing.status, dto.status);
    } catch (err) {
      if (err instanceof InvalidStockTransferTransition) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    return this.repository.updateStockTransferStatus(
      id,
      dto.status,
      dto.status === 'completed',
    );
  }
}
