import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateWarehouseData,
  WarehouseListItem,
  WarehouseRow,
  WarehouseUpdateData,
  WarehousesRepositoryPort,
} from '../../../application/port/out/repository/warehouses.repository.port';

@Injectable()
export class WarehousesRepositoryAdapter implements WarehousesRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listWarehouses(organizationId: string): Promise<WarehouseListItem[]> {
    const rows = await this.prisma.warehouse.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: { shipments: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return rows.map(({ _count, ...rest }) => ({
      ...rest,
      shipmentCount: _count.shipments,
    }));
  }

  findWarehouseById(id: string, organizationId: string): Promise<WarehouseRow | null> {
    return this.prisma.warehouse.findFirst({ where: { id, organizationId } });
  }

  createWarehouse(organizationId: string, data: CreateWarehouseData): Promise<WarehouseRow> {
    return this.prisma.warehouse.create({
      data: {
        organizationId,
        name: data.name,
        code: data.code,
        address: data.address,
        manager: data.manager,
        phone: data.phone,
        isDefault: data.isDefault ?? false,
        status: data.status ?? 'active',
      },
    });
  }

  updateWarehouse(id: string, data: WarehouseUpdateData): Promise<WarehouseRow> {
    return this.prisma.warehouse.update({ where: { id }, data });
  }

  async deleteWarehouse(id: string): Promise<void> {
    await this.prisma.warehouse.delete({ where: { id } });
  }
}
