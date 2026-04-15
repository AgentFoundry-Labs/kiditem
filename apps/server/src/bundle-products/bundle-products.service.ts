import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBundleProductDto } from './dto';
import { resolvePricing } from '../common/master-product-resolver';

interface BundleItemJson {
  productId: string;
  quantity: number;
}

@Injectable()
export class BundleProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async analyze(companyId: string) {
    const bundles = await this.prisma.bundleProduct.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    const productIds = bundles.flatMap((b) =>
      ((b.items ?? []) as unknown as BundleItemJson[]).map((item) => item.productId),
    );

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, costPrice: true, costCny: true, sellPrice: true, commissionRate: true, masterProduct: { select: { costPrice: true, sellPrice: true, commissionRate: true } } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return bundles.map((bundle) => {
      const rawItems = (bundle.items ?? []) as unknown as BundleItemJson[];
      const items = rawItems.map((item) => {
        const product = productMap.get(item.productId);
        const resolved = product ? resolvePricing(product) : null;
        return {
          productId: item.productId,
          quantity: item.quantity,
          product: product
            ? { name: product.name, costPrice: resolved!.costPrice, sellPrice: resolved!.sellPrice }
            : null,
        };
      });
      const totalItemCost = items.reduce((sum, item) => {
        return sum + (item.product?.costPrice ?? 0) * item.quantity;
      }, 0);

      const profit = bundle.sellPrice - totalItemCost;
      const marginRate = bundle.sellPrice > 0
        ? Math.round((profit / bundle.sellPrice) * 10000) / 100
        : 0;

      return {
        ...bundle,
        items,
        totalItemCost,
        profit,
        marginRate,
      };
    });
  }

  async create(companyId: string, dto: CreateBundleProductDto) {
    return this.prisma.bundleProduct.create({
      data: {
        companyId,
        name: dto.name,
        sku: dto.sku,
        sellPrice: dto.sellPrice,
        items: dto.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      },
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
