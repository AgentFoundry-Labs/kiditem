import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { paginationParams, type PaginatedResponse } from '../common/pagination';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: {
    grade?: string;
    status?: string;
    search?: string;
    company?: string;
    page?: string;
    limit?: string;
    maxProfitRate?: string;
  }): Promise<PaginatedResponse<Record<string, unknown>>> {
    try {
      const { grade, status, search, company, maxProfitRate } = query;
      const { page, limit, skip } = paginationParams(query);

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      let companyFilterId: string | undefined;
      if (company && company !== 'all') {
        const comp = await this.prisma.company.findFirst({
          where: { name: company },
          select: { id: true },
        });
        if (!comp) return { items: [], total: 0, page, limit };
        companyFilterId = comp.id;
      }

      const where: Prisma.ProductWhereInput = {
        ...(grade && { abcGrade: grade }),
        ...(status && { status }),
        ...(search && { name: { contains: search } }),
        ...(companyFilterId && { companyId: companyFilterId }),
      };

      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 1);

      // Enrichment 쿼리 (전역 집계 — 페이지네이션과 무관)
      const [plData, revenueData, adsAgg, thumbData, reviewCounts] =
        await Promise.all([
          this.prisma.profitLoss.findMany({ where: { year, month } }),
          this.prisma.$queryRaw<
            {
              seller_product_id: string;
              revenue: number;
              order_count: number;
            }[]
          >`
            SELECT
              coi.seller_product_id,
              SUM(coi.order_price)::int AS revenue,
              COUNT(DISTINCT co.id)::int AS order_count
            FROM coupang_order_items coi
            JOIN coupang_orders co ON co.id = coi.order_id
            WHERE coi.seller_product_id IS NOT NULL
              AND co.ordered_at >= ${monthStart}
              AND co.ordered_at < ${monthEnd}
            GROUP BY coi.seller_product_id
          `,
          this.prisma.ad.groupBy({ by: ['productId'], _sum: { spend: true } }),
          this.prisma.thumbnail.findMany({
            select: { productId: true, ctr: true },
          }),
          this.prisma.review.groupBy({ by: ['productId'], _count: true }),
        ]);

      const plMap = new Map(plData.map((pl) => [pl.productId, pl]));
      const revenueMap = new Map(
        revenueData.map((r) => [
          r.seller_product_id,
          { revenue: Number(r.revenue), orderCount: Number(r.order_count) },
        ]),
      );
      const adsMap = new Map(
        adsAgg.map((a) => [a.productId, a._sum.spend ?? 0]),
      );
      const thumbMap = new Map(
        thumbData.map((t) => [t.productId, t.ctr ? Number(t.ctr) : 0]),
      );
      const reviewMap = new Map(
        reviewCounts.map((r) => [r.productId, r._count]),
      );

      // maxProfitRate 필터: 계산 필드이므로 전체 로드 후 필터+페이지네이션
      if (maxProfitRate !== undefined) {
        const maxRate = parseFloat(maxProfitRate);
        const allProducts = await this.prisma.product.findMany({
          where,
          include: { company: true, inventory: true },
          orderBy: { createdAt: 'desc' },
        });
        const allEnriched = allProducts.map((p) => this.enrichProduct(p, plMap, revenueMap, adsMap, thumbMap, reviewMap));
        const filtered = allEnriched.filter((p) => p.profitRate <= maxRate);
        const total = filtered.length;
        const items = filtered.slice(skip, skip + limit);
        return { items, total, page, limit };
      }

      // 일반 경로: count + skip/take
      const [total, productsData] = await Promise.all([
        this.prisma.product.count({ where }),
        this.prisma.product.findMany({
          where,
          include: { company: true, inventory: true },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      const items = productsData.map((p) => this.enrichProduct(p, plMap, revenueMap, adsMap, thumbMap, reviewMap));
      return { items, total, page, limit };
    } catch {
      throw new InternalServerErrorException('상품 조회 실패');
    }
  }

  private enrichProduct(
    p: any,
    plMap: Map<string, any>,
    revenueMap: Map<string, { revenue: number; orderCount: number }>,
    adsMap: Map<string, number>,
    thumbMap: Map<string, number>,
    reviewMap: Map<string, number>,
  ) {
    const pl = plMap.get(p.id);
    const orderData = revenueMap.get(p.coupangProductId ?? '');
    const totalAdSpend = adsMap.get(p.id) ?? 0;

    let revenue: number;
    let netProfit: number;
    let orderCount: number;

    if (pl) {
      revenue = pl.revenue;
      netProfit = pl.netProfit;
      orderCount = orderData?.orderCount ?? pl.orderCount;
    } else if (orderData) {
      revenue = orderData.revenue;
      orderCount = orderData.orderCount;
      const comm = Math.round(
        revenue * (p.commissionRate ? Number(p.commissionRate) : 0.108),
      );
      const cogs = p.costCny
        ? Math.round(Number(p.costCny) * 190 * orderCount)
        : 0;
      const ship = (p.shippingCost ?? 0) * orderCount;
      netProfit = revenue - comm - cogs - ship - totalAdSpend;
    } else {
      revenue = 0;
      netProfit = 0;
      orderCount = 0;
    }

    const adRate = revenue > 0 ? (totalAdSpend / revenue) * 100 : 0;

    return {
      id: p.id,
      name: p.name,
      sku: p.coupangProductId ?? null,
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
      revenue,
      netProfit,
      profitRate:
        revenue > 0
          ? Math.round((netProfit / revenue) * 1000) / 10
          : 0,
      adRate: Math.round(adRate * 10) / 10,
      reviewCount: reviewMap.get(p.id) ?? 0,
      orderCount,
      thumbnailCTR: thumbMap.get(p.id) ?? 0,
    };
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

  async updateDraftContent(id: string, body: Record<string, unknown>) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.product.update({
      where: { id },
      data: { draftContent: body as any },
    });
  }

  async getPreview(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    const rawData = (product.rawData as Record<string, unknown>) || {};
    const data = product.processedData || product.draftContent || rawData;
    const template =
      product.processedData || product.draftContent ? 'bold-vertical' : null;
    return {
      template,
      data,
      images: rawData['images'] || [],
    };
  }

  async triggerContentDraft(
    id: string,
    seed?: { seed_hook_text?: string; seed_hook_title_sub?: string; seed_hero_image?: string },
  ) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new BadRequestException('상품을 찾을 수 없습니다.');
    }

    const task = await this.prisma.agentTask.create({
      data: {
        agentType: 'content',
        input: {
          productId: id,
          generation_mode: 'full',
          ...(seed?.seed_hook_text && { seed_hook_text: seed.seed_hook_text }),
          ...(seed?.seed_hook_title_sub && { seed_hook_title_sub: seed.seed_hook_title_sub }),
          ...(seed?.seed_hero_image && { seed_hero_image: seed.seed_hero_image }),
        } as any,
      },
    });

    await this.prisma.$executeRawUnsafe(
      `SELECT pg_notify('new_agent_task', $1)`,
      task.id,
    );

    return { taskId: task.id };
  }

  async triggerImageGeneration(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (!product.draftContent) {
      throw new BadRequestException(
        'draftContent가 없습니다. 먼저 AI 재가공을 실행하세요.',
      );
    }
    const task = await this.prisma.agentTask.create({
      data: {
        agentType: 'content',
        input: {
          productId: id,
          generation_mode: 'image',
          draftContent: product.draftContent,
        } as any,
      },
    });
    await this.prisma.$executeRawUnsafe(
      `SELECT pg_notify('new_agent_task', $1)`,
      task.id,
    );
    await this.prisma.product.update({
      where: { id },
      data: { pipelineStep: 'images_generating' },
    });
    return { taskId: task.id };
  }
}
