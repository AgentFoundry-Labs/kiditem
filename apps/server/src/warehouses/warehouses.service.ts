import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.warehouse.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        code: dto.code,
        address: dto.address,
        manager: dto.manager,
        phone: dto.phone,
        isDefault: dto.isDefault ?? false,
        status: dto.status ?? 'active',
      },
    });
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const existing = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException('창고를 찾을 수 없습니다');
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    const existing = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException('창고를 찾을 수 없습니다');
    }

    await this.prisma.warehouse.delete({ where: { id } });
    return { ok: true };
  }
}
