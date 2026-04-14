import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOptionMasterDto, UpdateOptionMasterDto } from './dto';

@Injectable()
export class OptionMastersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.optionMaster.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(companyId: string, dto: CreateOptionMasterDto) {
    return this.prisma.optionMaster.create({
      data: {
        companyId,
        name: dto.name,
        values: dto.values,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateOptionMasterDto, companyId: string) {
    const existing = await this.prisma.optionMaster.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException('옵션 마스터를 찾을 수 없습니다');
    }

    return this.prisma.optionMaster.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string, companyId: string) {
    const existing = await this.prisma.optionMaster.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException('옵션 마스터를 찾을 수 없습니다');
    }

    await this.prisma.optionMaster.delete({ where: { id } });
    return { ok: true };
  }
}
