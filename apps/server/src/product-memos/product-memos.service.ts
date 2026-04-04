import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductMemoDto, UpdateProductMemoDto } from './dto';

@Injectable()
export class ProductMemosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productId: string) {
    return this.prisma.productMemo.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateProductMemoDto) {
    return this.prisma.productMemo.create({
      data: {
        productId: dto.productId,
        content: dto.content,
        author: dto.author,
        memoType: dto.memoType ?? 'general',
      },
    });
  }

  async update(id: string, dto: UpdateProductMemoDto) {
    const existing = await this.prisma.productMemo.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('메모를 찾을 수 없습니다');

    return this.prisma.productMemo.update({
      where: { id },
      data: { isResolved: dto.isResolved },
    });
  }
}
