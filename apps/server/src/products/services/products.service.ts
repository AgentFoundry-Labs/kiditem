import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import type { Prisma } from '@prisma/client';
import { paginationParams, type PaginatedResponse } from '../../common/pagination';
import { resolvePricing, resolveInventory } from '../../common/master-product-resolver';
import type { ProductListItem } from '@kiditem/shared';
import type {
  ProductWithRelations,
  ProductEnrichmentMaps,
  RevenueData,
  TrafficMetrics,
  T14Metrics,
  T14PrevMetrics,
} from './types';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  async findAll(query: {
    grade?: string;
    status?: string;
    search?: string;
    company?: string;
    page?: string;
    limit?: string;
    maxProfitRate?: string;
    period?: string;
    orderBy?: string;
  }): Promise<PaginatedResponse<Record<string, unknown>>> {
    try {
      const { grade, status, search, company, maxProfitRate } = query;
      const { page, limit, skip } = paginationParams(query);

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const periodDays = Number(query.period) || 7;
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - periodDays);

      // t14 / t14prev 기간 계산
      const t14Start = new Date();
      t14Start.setDate(t14Start.getDate() - 14);
      const t14PrevStart = new Date();
      t14PrevStart.setDate(t14PrevStart.getDate() - 28);
      const t14PrevEnd = new Date();
      t14PrevEnd.setDate(t14PrevEnd.getDate() - 14);

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
      const [plData, revenueData, adsAgg, thumbData, reviewCounts, trafficAgg, gradeScoreData, t14Agg, t14PrevAgg] =
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
          this.prisma.$queryRaw<
            {
              product_id: string;
              visitors: number;
              views: number;
              cart_adds: number;
              orders: number;
              sales_qty: number;
              revenue: number;
            }[]
          >`
            SELECT
              product_id,
              SUM(visitors)::int AS visitors,
              SUM(views)::int AS views,
              SUM(cart_adds)::int AS cart_adds,
              SUM(orders)::int AS orders,
              SUM(sales_qty)::int AS sales_qty,
              SUM(revenue)::int AS revenue
            FROM traffic_stats
            WHERE period_days = ${periodDays}
              AND date >= ${periodStart}
            GROUP BY product_id
          `,
          this.prisma.$queryRaw<
            { product_id: string; score: number }[]
          >`
            SELECT DISTINCT ON (product_id)
              product_id, score::float AS score
            FROM grade_histories
            ORDER BY product_id, calculated_at DESC
          `,
          // t14: 최근 14일 트래픽
          this.prisma.$queryRaw<
            { product_id: string; revenue: number; sales_qty: number; orders: number; conversion_rate: number; date: string }[]
          >`
            SELECT
              product_id,
              SUM(revenue)::int AS revenue,
              SUM(sales_qty)::int AS sales_qty,
              SUM(orders)::int AS orders,
              CASE WHEN SUM(views) > 0 THEN ROUND(SUM(orders)::numeric / SUM(views) * 100, 2) ELSE 0 END AS conversion_rate,
              MAX(date)::text AS date
            FROM traffic_stats
            WHERE date >= ${t14Start}
            GROUP BY product_id
          `,
          // t14prev: 이전 14일 트래픽 (14~28일 전)
          this.prisma.$queryRaw<
            { product_id: string; revenue: number; sales_qty: number; orders: number; date: string }[]
          >`
            SELECT
              product_id,
              SUM(revenue)::int AS revenue,
              SUM(sales_qty)::int AS sales_qty,
              SUM(orders)::int AS orders,
              MAX(date)::text AS date
            FROM traffic_stats
            WHERE date >= ${t14PrevStart} AND date < ${t14PrevEnd}
            GROUP BY product_id
          `,
        ]);

      const maps: ProductEnrichmentMaps = {
        profitLoss: new Map(plData.map((pl) => [pl.productId, pl])),
        revenue: new Map(
          revenueData.map((r): [string, RevenueData] => [
            r.seller_product_id,
            { revenue: Number(r.revenue), orderCount: Number(r.order_count) },
          ]),
        ),
        ads: new Map(
          adsAgg.map((a) => [a.productId, a._sum.spend ?? 0]),
        ),
        thumbnails: new Map(
          thumbData.map((t) => [t.productId, t.ctr ? Number(t.ctr) : 0]),
        ),
        reviews: new Map(
          reviewCounts.map((r) => [r.productId, r._count]),
        ),
        traffic: new Map(
          trafficAgg.map((t): [string, TrafficMetrics] => [
            t.product_id,
            {
              visitors: Number(t.visitors) || 0,
              views: Number(t.views) || 0,
              cartAdds: Number(t.cart_adds) || 0,
              orders: Number(t.orders) || 0,
              salesQty: Number(t.sales_qty) || 0,
              revenue: Number(t.revenue) || 0,
            },
          ]),
        ),
        gradeScores: new Map(
          gradeScoreData.map((g) => [g.product_id, Number(g.score)]),
        ),
        t14: new Map(
          t14Agg.map((t): [string, T14Metrics] => [t.product_id, {
            revenue: Number(t.revenue) || 0,
            salesQty: Number(t.sales_qty) || 0,
            orders: Number(t.orders) || 0,
            conversionRate: Number(t.conversion_rate) || 0,
            date: t.date,
          }]),
        ),
        t14Prev: new Map(
          t14PrevAgg.map((t): [string, T14PrevMetrics] => [t.product_id, {
            revenue: Number(t.revenue) || 0,
            salesQty: Number(t.sales_qty) || 0,
            orders: Number(t.orders) || 0,
            date: t.date,
          }]),
        ),
      };

      const sortByRevenue = !query.orderBy || query.orderBy === 'revenue';

      if (maxProfitRate !== undefined) {
        const maxRate = parseFloat(maxProfitRate);
        const allProducts = await this.prisma.product.findMany({
          where,
          include: { company: true, inventory: true, masterProduct: { include: { inventory: true } } },
          orderBy: { createdAt: 'desc' },
        });
        const allEnriched = allProducts.map((p) => this.enrichProduct(p, maps));
        const filtered = allEnriched.filter((p) => p.profitRate <= maxRate);
        if (sortByRevenue) filtered.sort((a, b) => b.revenue - a.revenue);
        const total = filtered.length;
        const items = filtered.slice(skip, skip + limit);
        return { items, total, page, limit };
      }

      const total = await this.prisma.product.count({ where });

      let productsData: ProductWithRelations[];
      if (sortByRevenue) {
        const nowYear = now.getFullYear();
        const nowMonth = now.getMonth() + 1;
        const whereConditions: string[] = ['p.is_deleted = false'];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (grade) {
          whereConditions.push(`p.abc_grade = $${paramIdx++}`);
          params.push(grade);
        }
        if (status) {
          whereConditions.push(`p.status = $${paramIdx++}`);
          params.push(status);
        }
        if (search) {
          whereConditions.push(`p.name ILIKE $${paramIdx++}`);
          params.push(`%${search}%`);
        }
        if (companyFilterId) {
          whereConditions.push(`p.company_id = $${paramIdx++}::uuid`);
          params.push(companyFilterId);
        }

        const whereClause = whereConditions.join(' AND ');

        const sortedIds = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT p.id
           FROM products p
           LEFT JOIN profit_loss pl ON pl.product_id = p.id AND pl.year = ${nowYear} AND pl.month = ${nowMonth}
           WHERE ${whereClause}
           ORDER BY COALESCE(pl.revenue, 0) DESC, p.created_at DESC
           OFFSET ${skip} LIMIT ${limit}`,
          ...params,
        );

        if (sortedIds.length === 0) {
          return { items: [], total, page, limit };
        }

        const idList = sortedIds.map((r) => r.id);
        const products = await this.prisma.product.findMany({
          where: { id: { in: idList } },
          include: { company: true, inventory: true, masterProduct: { include: { inventory: true } } },
        });

        const idOrder = new Map(idList.map((id, i) => [id, i]));
        productsData = products.sort(
          (a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0),
        );
      } else {
        productsData = await this.prisma.product.findMany({
          where,
          include: { company: true, inventory: true, masterProduct: { include: { inventory: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        });
      }

      const items = productsData.map((p) => this.enrichProduct(p, maps));
      return { items, total, page, limit };
    } catch {
      throw new InternalServerErrorException('상품 조회 실패');
    }
  }

  private enrichProduct(
    p: ProductWithRelations,
    maps: ProductEnrichmentMaps,
  ) {
    const pl = maps.profitLoss.get(p.id);
    const orderData = maps.revenue.get(p.coupangProductId ?? '');
    const totalAdSpend = maps.ads.get(p.id) ?? 0;

    const resolved = resolvePricing(p);
    const resolvedInv = resolveInventory(p);

    let revenue: number;
    let netProfit = 0;
    let orderCount: number;

    if (pl) {
      revenue = pl.revenue;
      netProfit = pl.netProfit;
      orderCount = orderData?.orderCount ?? pl.orderCount;
    } else if (orderData) {
      revenue = orderData.revenue;
      orderCount = orderData.orderCount;
      const comm = Math.round(
        revenue * (resolved.commissionRate ?? 0.108),
      );
      const cogs = resolved.costPrice * orderCount;
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
      brand: p.brand ?? null,
      company: p.company?.name ?? 'N/A',
      companyId: p.companyId,
      costPrice: resolved.costPrice,
      sellPrice: resolved.sellPrice,
      commissionRate: resolved.commissionRate,
      shippingCost: p.shippingCost ?? 0,
      status: p.status,
      abcGrade: p.abcGrade,
      adTier: p.adTier,
      currentStock: resolvedInv.currentStock,
      reorderPoint: resolvedInv.reorderPoint,
      avgDailySales: p.inventory?.dailySalesAvg ? Number(p.inventory.dailySalesAvg) : 0,
      revenue,
      netProfit,
      profitRate:
        revenue > 0
          ? Math.round((netProfit / revenue) * 1000) / 10
          : 0,
      adRate: Math.round(adRate * 10) / 10,
      reviewCount: maps.reviews.get(p.id) ?? 0,
      orderCount,
      thumbnailCTR: maps.thumbnails.get(p.id) ?? 0,
      traffic: maps.traffic.get(p.id) ?? null,
      t14: maps.t14.get(p.id) ?? null,
      t14prev: maps.t14Prev.get(p.id) ?? null,
      thumbnailUrl: p.thumbnailUrl ?? null,
      imageUrl: p.imageUrl ?? null,
      coupangProductId: p.coupangProductId ?? null,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      gradeScore: maps.gradeScores.get(p.id) ?? null,
      healthScore: p.healthScore ?? null,
      masterProductId: p.masterProductId ?? null,
      isCostMissing: resolved.isCostMissing,
    } satisfies ProductListItem;
  }

  async create(body: Record<string, unknown>): Promise<any> {
    const name = body.name as string | undefined;
    const companyId = body.companyId as string | undefined;
    if (!name || !companyId) {
      throw new BadRequestException('상품명과 회사는 필수입니다.');
    }

    const sellPrice = Number(body.sellPrice) || 0;
    const costPrice = Number(body.costPrice) || 0;
    const shippingCost = Number(body.shippingCost) || 0;
    const sku = (body.sku as string) || `AUTO-${Date.now()}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const masterProduct = await tx.masterProduct.create({
          data: {
            companyId,
            sku,
            name,
            costPrice: costPrice > 0 ? costPrice : null,
            sellPrice: sellPrice > 0 ? sellPrice : null,
          },
        });

        return await tx.product.create({
          data: {
            name,
            category: (body.category as string) ?? null,
            sellPrice: sellPrice > 0 ? sellPrice : null,
            costPrice: costPrice > 0 ? costPrice : null,
            commissionRate:
              Number(body.commissionRate) > 0
                ? Number(body.commissionRate)
                : null,
            shippingCost: shippingCost > 0 ? shippingCost : null,
            companyId,
            status: (body.status as string) ?? 'active',
            abcGrade: (body.abcGrade as string) ?? 'C',
            adTier: (body.adTier as string) ?? null,
            masterProductId: masterProduct.id,
            inventory: {
              create: {
                companyId,
                currentStock: Math.max(0, Number(body.currentStock) || 0),
                leadTimeDays: Number(body.leadTimeDays) || 14,
              },
            },
          },
        });
      });
    } catch {
      throw new InternalServerErrorException('상품 등록 실패');
    }
  }

  async findOne(id: string): Promise<any> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { company: true, inventory: true, masterProduct: { include: { inventory: true } } },
    });
    if (!product) return null;

    const resolved = resolvePricing(product);
    return {
      ...product,
      costPrice: resolved.costPrice,
      sellPrice: resolved.sellPrice,
      commissionRate: resolved.commissionRate,
      isCostMissing: resolved.isCostMissing,
    };
  }

  async remove(id: string): Promise<any> {
    return this.prisma.product.delete({ where: { id } });
  }

  async updateImages(
    productId: string,
    images: Array<{ url: string; role: string; label?: string; sortOrder?: number }>,
  ) {
    if (images.length > 20) {
      throw new BadRequestException('이미지는 최대 20개까지 등록 가능합니다');
    }
    return this.prisma.product.update({
      where: { id: productId },
      data: { images: images as any },
      select: { id: true, images: true },
    });
  }

  async updateDraftContent(id: string, body: Record<string, unknown>): Promise<any> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.product.update({
      where: { id },
      data: { draftContent: body as any },
    });
  }

  async getPreview(id: string): Promise<{ template: string | null; data: unknown; images: unknown }> {
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
    seed?: { seed_hook_text?: string; seed_hook_title_sub?: string; seed_hero_image?: string; color_image_urls?: string[] },
  ): Promise<{ ok: true; taskId: string }> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new BadRequestException('상품을 찾을 수 없습니다.');
    }

    const result = await this.agentRegistry.runByType('content', {
      extra: {
        productId: id,
        generation_mode: 'full',
        ...(seed?.seed_hook_text && { seed_hook_text: seed.seed_hook_text }),
        ...(seed?.seed_hook_title_sub && { seed_hook_title_sub: seed.seed_hook_title_sub }),
        ...(seed?.seed_hero_image && { seed_hero_image: seed.seed_hero_image }),
        ...(seed?.color_image_urls?.length && { color_image_urls: seed.color_image_urls }),
      },
    });

    return { ok: true, taskId: result.taskId };
  }

  async getPipelineStats(statusFilter?: string): Promise<{
    total: number;
    gradeA: number;
    gradeB: number;
    gradeC: number;
    minus: number;
    low: number;
    gradeChangeA: number;
    gradeChangeB: number;
    gradeChangeC: number;
    adCount: number;
    noAdCount: number;
  }> {
    try {
      const statusWhere = statusFilter && statusFilter !== 'all'
        ? `AND p.status = '${statusFilter}'`
        : '';

      // 1. Grade counts + total
      const gradeCounts = await this.prisma.$queryRawUnsafe<
        { abc_grade: string | null; cnt: number }[]
      >(`
        SELECT p.abc_grade, COUNT(*)::int AS cnt
        FROM products p
        WHERE p.is_deleted = false ${statusWhere}
        GROUP BY p.abc_grade
      `);

      let total = 0;
      let gradeA = 0;
      let gradeB = 0;
      let gradeC = 0;
      for (const row of gradeCounts) {
        const cnt = Number(row.cnt);
        total += cnt;
        if (row.abc_grade === 'A') gradeA = cnt;
        else if (row.abc_grade === 'B') gradeB = cnt;
        else if (row.abc_grade === 'C') gradeC = cnt;
      }

      // 2. 적자 (net_profit < 0) — distinct product count
      const [minusRow] = await this.prisma.$queryRawUnsafe<{ cnt: number }[]>(`
        SELECT COUNT(DISTINCT pl.product_id)::int AS cnt
        FROM profit_loss pl
        JOIN products p ON p.id = pl.product_id
        WHERE pl.net_profit < 0
          AND p.is_deleted = false ${statusWhere}
      `);

      // 3. 3%이하 (0 <= profit rate <= 3%) — net_profit >= 0, revenue > 0, rate <= 3
      const [lowRow] = await this.prisma.$queryRawUnsafe<{ cnt: number }[]>(`
        SELECT COUNT(DISTINCT pl.product_id)::int AS cnt
        FROM profit_loss pl
        JOIN products p ON p.id = pl.product_id
        WHERE pl.net_profit >= 0
          AND pl.revenue > 0
          AND (CAST(pl.net_profit AS FLOAT) / pl.revenue * 100) <= 3
          AND p.is_deleted = false ${statusWhere}
      `);

      // 4. Grade changes — net change per grade from grade_histories
      const gradeChanges = await this.prisma.$queryRaw<
        { grade: string; net_change: number }[]
      >`
        SELECT grade, SUM(dir)::int AS net_change
        FROM (
          SELECT new_grade AS grade, 1 AS dir FROM grade_histories
          UNION ALL
          SELECT old_grade AS grade, -1 AS dir FROM grade_histories WHERE old_grade IS NOT NULL
        ) sub
        WHERE grade IS NOT NULL
        GROUP BY grade
      `;

      const changeMap: Record<string, number> = {};
      for (const row of gradeChanges) {
        changeMap[row.grade] = Number(row.net_change);
      }

      // 5. Ad counts
      const [adRow] = await this.prisma.$queryRawUnsafe<{ ad_count: number; no_ad_count: number }[]>(`
        SELECT
          COUNT(*) FILTER (WHERE p.ad_tier IS NOT NULL AND p.ad_tier != '')::int AS ad_count,
          COUNT(*) FILTER (WHERE p.ad_tier IS NULL OR p.ad_tier = '')::int AS no_ad_count
        FROM products p
        WHERE p.is_deleted = false ${statusWhere}
      `);

      return {
        total,
        gradeA,
        gradeB,
        gradeC,
        minus: Number(minusRow?.cnt ?? 0),
        low: Number(lowRow?.cnt ?? 0),
        gradeChangeA: changeMap['A'] ?? 0,
        gradeChangeB: changeMap['B'] ?? 0,
        gradeChangeC: changeMap['C'] ?? 0,
        adCount: Number(adRow?.ad_count ?? 0),
        noAdCount: Number(adRow?.no_ad_count ?? 0),
      };
    } catch {
      throw new InternalServerErrorException('파이프라인 통계 조회 실패');
    }
  }

  async triggerImageGeneration(id: string): Promise<{ ok: true; taskId: string }> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (!product.draftContent) {
      throw new BadRequestException(
        'draftContent가 없습니다. 먼저 AI 재가공을 실행하세요.',
      );
    }
    const result = await this.agentRegistry.runByType('content', {
      extra: {
        productId: id,
        generation_mode: 'image',
        draftContent: product.draftContent,
      },
    });
    await this.prisma.product.update({
      where: { id },
      data: { pipelineStep: 'images_generating' },
    });
    return { ok: true, taskId: result.taskId };
  }
}
