import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBundleProductDto } from './dto';

@Injectable()
export class BundleProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async analyze(companyId: string) {
    const bundles = await this.prisma.bundleProduct.findMany({
      where: { companyId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, costPrice: true, sellPrice: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return bundles.map((bundle) => {
      const totalItemCost = bundle.items.reduce((sum, item) => {
        return sum + (item.product.costPrice ?? 0) * item.quantity;
      }, 0);

      const profit = bundle.sellPrice - totalItemCost;
      const marginRate = bundle.sellPrice > 0
        ? Math.round((profit / bundle.sellPrice) * 10000) / 100
        : 0;

      return {
        ...bundle,
        totalItemCost,
        profit,
        marginRate,
      };
    });
  }

  async create(dto: CreateBundleProductDto) {
    return this.prisma.bundleProduct.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        sku: dto.sku,
        sellPrice: dto.sellPrice,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    });
  }

  async delete(id: string) {
    const existing = await this.prisma.bundleProduct.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException('번들 상품을 찾을 수 없습니다');
    }

    await this.prisma.bundleProduct.delete({ where: { id } });
    return { ok: true };
  }
}
