import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

export type WarehouseRow = Prisma.WarehouseGetPayload<{}>;
export type WarehouseListItem = WarehouseRow & { shipmentCount: number };

@Injectable()
export class WarehousesPersistence {
  constructor(private readonly prisma: PrismaService) {}

  async listWarehouses(companyId: string): Promise<WarehouseListItem[]> {
    const rows = await this.prisma.warehouse.findMany({
      where: { companyId },
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

  findWarehouseById(id: string, companyId: string): Promise<WarehouseRow | null> {
    return this.prisma.warehouse.findFirst({ where: { id, companyId } });
  }

  createWarehouse(
    companyId: string,
    data: {
      name: string;
      code?: string;
      address?: string;
      manager?: string;
      phone?: string;
      isDefault?: boolean;
      status?: string;
    },
  ): Promise<WarehouseRow> {
    return this.prisma.warehouse.create({
      data: {
        companyId,
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

  updateWarehouse(
    id: string,
    data: Prisma.WarehouseUpdateInput,
  ): Promise<WarehouseRow> {
    return this.prisma.warehouse.update({ where: { id }, data });
  }

  async deleteWarehouse(id: string): Promise<void> {
    await this.prisma.warehouse.delete({ where: { id } });
  }
}
