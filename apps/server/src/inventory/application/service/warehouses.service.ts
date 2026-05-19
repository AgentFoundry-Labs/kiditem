import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  WAREHOUSES_PORT,
  type CreateWarehouseInput,
  type UpdateWarehouseInput,
  type WarehousesPort,
} from '../port/in/warehouse/warehouses.port';
import {
  WAREHOUSES_REPOSITORY_PORT,
  type WarehouseListItem,
  type WarehouseRow,
  type WarehousesRepositoryPort,
} from '../port/out/repository/warehouses.repository.port';

export { WAREHOUSES_PORT } from '../port/in/warehouse/warehouses.port';

@Injectable()
export class WarehousesService implements WarehousesPort {
  constructor(
    @Inject(WAREHOUSES_REPOSITORY_PORT)
    private readonly repository: WarehousesRepositoryPort,
  ) {}

  findAll(organizationId: string): Promise<WarehouseListItem[]> {
    return this.repository.listWarehouses(organizationId);
  }

  create(organizationId: string, dto: CreateWarehouseInput): Promise<WarehouseRow> {
    return this.repository.createWarehouse(organizationId, dto);
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateWarehouseInput,
  ): Promise<WarehouseRow> {
    const existing = await this.repository.findWarehouseById(id, organizationId);
    if (!existing) throw new BadRequestException('창고를 찾을 수 없습니다');
    return this.repository.updateWarehouse(id, dto);
  }

  async delete(id: string, organizationId: string): Promise<{ ok: true }> {
    const existing = await this.repository.findWarehouseById(id, organizationId);
    if (!existing) throw new BadRequestException('창고를 찾을 수 없습니다');
    await this.repository.deleteWarehouse(id);
    return { ok: true };
  }
}
