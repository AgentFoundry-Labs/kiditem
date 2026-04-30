import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  TRANSFERS_PORT,
  type CreateStockTransferInput,
  type TransfersPort,
  type UpdateStockTransferInput,
} from '../port/in/transfers.port';
import {
  TRANSFERS_REPOSITORY_PORT,
  type StockTransferRow,
  type TransfersRepositoryPort,
} from '../port/out/transfers.repository.port';
import {
  assertValidStockTransferTransition,
  InvalidStockTransferTransition,
} from '../../domain/policy/stock-transfer-transition';

export { TRANSFERS_PORT } from '../port/in/transfers.port';

@Injectable()
export class TransfersService implements TransfersPort {
  constructor(
    @Inject(TRANSFERS_REPOSITORY_PORT)
    private readonly repository: TransfersRepositoryPort,
  ) {}

  findAll(companyId: string, query: { status?: string }): Promise<StockTransferRow[]> {
    return this.repository.listStockTransfers(companyId, query.status);
  }

  async create(
    companyId: string,
    dto: CreateStockTransferInput,
  ): Promise<StockTransferRow> {
    const option = await this.repository.findOptionForTransfer(dto.optionId, companyId);
    if (!option) throw new NotFoundException('Option not found');

    return this.repository.createStockTransfer(companyId, {
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
    const existing = await this.repository.findStockTransferById(id, companyId);
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
