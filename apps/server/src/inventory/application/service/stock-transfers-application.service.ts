import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StockTransfersPersistence } from '../../adapter/out/prisma/stock-transfers.persistence';
import type { StockTransferRow } from '../../adapter/out/prisma/stock-transfers.persistence';
import {
  assertValidStockTransferTransition,
  InvalidStockTransferTransition,
} from '../../domain/policy/stock-transfer-transition';

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

@Injectable()
export class StockTransfersApplicationService {
  constructor(private readonly persistence: StockTransfersPersistence) {}

  findAll(companyId: string, query: { status?: string }): Promise<StockTransferRow[]> {
    return this.persistence.listStockTransfers(companyId, query.status);
  }

  async create(
    companyId: string,
    dto: CreateStockTransferInput,
  ): Promise<StockTransferRow> {
    const option = await this.persistence.findOptionForTransfer(dto.optionId, companyId);
    if (!option) throw new NotFoundException('Option not found');

    return this.persistence.createStockTransfer(companyId, {
      optionId: dto.optionId,
      optionName: option.optionName ?? '',
      fromWarehouseId: dto.fromWarehouseId,
      toWarehouseId: dto.toWarehouseId,
      quantity: dto.quantity,
      notes: dto.notes,
    });
  }

  async update(
    id: string,
    dto: UpdateStockTransferInput,
    companyId: string,
  ): Promise<StockTransferRow> {
    const existing = await this.persistence.findStockTransferById(id, companyId);
    if (!existing) throw new NotFoundException('재고 이동을 찾을 수 없습니다');

    try {
      assertValidStockTransferTransition(existing.status, dto.status);
    } catch (err) {
      if (err instanceof InvalidStockTransferTransition) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    return this.persistence.updateStockTransferStatus(
      id,
      dto.status,
      dto.status === 'completed',
    );
  }
}
