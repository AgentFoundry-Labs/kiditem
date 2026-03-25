import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: {
    grade?: string;
    status?: string;
    search?: string;
    company?: string;
  }) {
    try {
      const { grade, status, search, company } = query;

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      let companyFilterId: string | undefined;
      if (company && company !== 'all') {
        const comp = await this.prisma.company.findFirst({
          where: { name: company },
          select: { id: true },
        });
        if (!comp) return [];
        companyFilterId = comp.id;
      }

      const where: Prisma.ProductWhereInput = {
        ...(grade && { abcGrade: grade }),
        ...(status && { status }),
        ...(search && { name: { contains: search } }),
        ...(companyFilterId && { companyId: companyFilterId }),
      };

      const productsData = await this.prisma.product.findMany({
        where,
        include: {
          company: true,
          inventory: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const plData = await this.prisma.profitLoss.findMany({
        where: { year, month },
      });

      const adsAgg = await this.prisma.ad.groupBy({
        by: ['productId'],
        _sum: { spend: true },
      });

      const thumbData = await this.prisma.thumbnail.findMany({
        select: { productId: true, ctr: true },
      });

      const reviewCounts = await this.prisma.review.groupBy({
        by: ['productId'],
        _count: true,
      });

      const orderCounts = await this.prisma.coupangOrderItem.groupBy({
        by: ['sellerProductId'],
        _count: true,
      });

      const plMap = new Map(plData.map((pl) => [pl.productId, pl]));
      const adsMap = new Map(
        adsAgg.map((a) => [a.productId, a._sum.spend ?? 0]),
      );
      const thumbMap = new Map(
        thumbData.map((t) => [t.productId, t.ctr ? Number(t.ctr) : 0]),
      );
      const reviewMap = new Map(
        reviewCounts.map((r) => [r.productId, r._count]),
      );
      const orderMap = new Map(
        orderCounts
          .filter((o) => o.sellerProductId !== null)
          .map((o) => [o.sellerProductId!, o._count]),
      );

      return productsData.map((p) => {
        const pl = plMap.get(p.id);
        const totalAdSpend = adsMap.get(p.id) ?? 0;
        const plRevenue = pl?.revenue ?? 0;
        const adRate = plRevenue > 0 ? (totalAdSpend / plRevenue) * 100 : 0;

        return {
          id: p.id,
          name: p.name,
          sku: null,
          category: p.category,
          company: p.company?.name ?? 'N/A',
          companyId: p.companyId,
          costPrice: p.costCny ? Number(p.costCny) : 0,
          sellPrice: p.sellPrice ?? 0,
          commissionRate: p.commissionRate ? Number(p.commissionRate) : 0,
          shippingCost: p.shippingCost ?? 0,
          status: p.status,
          abcGrade: p.abcGrade,
          adTier: p.adTier,
          currentStock: p.inventory?.currentStock ?? 0,
          reorderPoint: p.inventory?.reorderPoint ?? 0,
          avgDailySales: p.inventory?.dailySalesAvg ?? 0,
          revenue: plRevenue,
          netProfit: pl?.netProfit ?? 0,
          profitRate:
            plRevenue > 0
              ? Math.round(((pl?.netProfit ?? 0) / plRevenue) * 1000) / 10
              : 0,
          adRate: Math.round(adRate * 10) / 10,
          reviewCount: reviewMap.get(p.id) ?? 0,
          orderCount: orderMap.get(p.coupangProductId ?? '') ?? 0,
          thumbnailCTR: thumbMap.get(p.id) ?? 0,
        };
      });
    } catch {
      throw new InternalServerErrorException('상품 조회 실패');
    }
  }

  async create(body: Record<string, unknown>) {
    const name = body.name as string | undefined;
    const companyId = body.companyId as string | undefined;
    if (!name || !companyId) {
      throw new BadRequestException('상품명과 회사는 필수입니다.');
    }

    const sellPrice = Number(body.sellPrice) || 0;
    const shippingCost = Number(body.shippingCost) || 0;

    try {
      return await this.prisma.product.create({
        data: {
          name,
          category: (body.category as string) ?? null,
          sellPrice: sellPrice > 0 ? sellPrice : null,
          commissionRate:
            Number(body.commissionRate) > 0
              ? Number(body.commissionRate)
              : null,
          shippingCost: shippingCost > 0 ? shippingCost : null,
          companyId,
          status: (body.status as string) ?? 'active',
          abcGrade: (body.abcGrade as string) ?? 'C',
          adTier: (body.adTier as string) ?? null,
          inventory: {
            create: {
              companyId,
              currentStock: Math.max(0, Number(body.currentStock) || 0),
              leadTimeDays: Number(body.leadTimeDays) || 14,
            },
          },
        },
      });
    } catch {
      throw new InternalServerErrorException('상품 등록 실패');
    }
  }

  async findOne(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: { company: true, inventory: true },
    });
  }

  async remove(id: string) {
    return this.prisma.product.delete({ where: { id } });
  }
}
