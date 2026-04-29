import { BadRequestException, Injectable } from '@nestjs/common';
import { WarehousesPersistence } from '../../adapter/out/prisma/warehouses.persistence';
import type {
  WarehouseListItem,
  WarehouseRow,
} from '../../adapter/out/prisma/warehouses.persistence';

export type CreateWarehouseInput = {
  name: string;
  code?: string;
  address?: string;
  manager?: string;
  phone?: string;
  isDefault?: boolean;
  status?: string;
};

export type UpdateWarehouseInput = Partial<CreateWarehouseInput>;

@Injectable()
export class WarehousesApplicationService {
  constructor(private readonly persistence: WarehousesPersistence) {}

  findAll(companyId: string): Promise<WarehouseListItem[]> {
    return this.persistence.listWarehouses(companyId);
  }

  create(companyId: string, dto: CreateWarehouseInput): Promise<WarehouseRow> {
    return this.persistence.createWarehouse(companyId, dto);
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateWarehouseInput,
  ): Promise<WarehouseRow> {
    const existing = await this.persistence.findWarehouseById(id, companyId);
    if (!existing) throw new BadRequestException('창고를 찾을 수 없습니다');
    return this.persistence.updateWarehouse(id, dto);
  }

  async delete(id: string, companyId: string): Promise<{ ok: true }> {
    const existing = await this.persistence.findWarehouseById(id, companyId);
    if (!existing) throw new BadRequestException('창고를 찾을 수 없습니다');
    await this.persistence.deleteWarehouse(id);
    return { ok: true };
  }
}
