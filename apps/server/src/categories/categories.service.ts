import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.categoryMapping.findMany({
      where: { companyId },
      orderBy: { internalCategory: 'asc' },
    });
  }

  async create(dto: CreateCategoryDto) {
    return this.prisma.categoryMapping.create({
      data: {
        companyId: dto.companyId,
        internalCategory: dto.internalCategory,
        coupangCategoryId: dto.coupangCategoryId,
        coupangCategoryName: dto.coupangCategoryName,
        keywords: dto.keywords,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.categoryMapping.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException('카테고리 매핑을 찾을 수 없습니다');
    }

    return this.prisma.categoryMapping.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    const existing = await this.prisma.categoryMapping.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException('카테고리 매핑을 찾을 수 없습니다');
    }

    await this.prisma.categoryMapping.delete({ where: { id } });
    return { ok: true };
  }
}
