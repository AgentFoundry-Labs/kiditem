import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import type { Prisma } from '@prisma/client';
import { paginationParams, type PaginatedResponse } from '../../common/pagination';
import { resolvePricing, resolveInventory } from '../../common/master-product-resolver';
import type { ProductListItem } from '@kiditem/shared';
import type {
  CreateProductInput,
  ProductWithRelations,
  ProductEnrichmentMaps,
  RevenueData,
  TrafficMetrics,
  T14Metrics,
  T14PrevMetrics,
} from './types';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  @OnEvent('products.classify-grades')
  async onClassifyGradesEvent(): Promise<void> {
    try {
      await this.classifyAbcGrades();
    } catch (err) {
      this.logger.warn('products.classify-grades 이벤트 처리 실패', err);
    }
  }

  async findAll(query: {
    grade?: string;
    status?: string;
    search?: string;
    company?: string;
    page?: string | number;
    limit?: string | number;
    maxProfitRate?: string | number;
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
            WHERE period_days = 1
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
          // t14: 최근 14일 트래픽 — period_days>=14 집계 레코드 우선, 없으면 일별(period_days=1) 합산
          this.prisma.$queryRaw<
            { product_id: string; revenue: number; sales_qty: number; orders: number; conversion_rate: number; date: string }[]
          >`
            WITH agg14 AS (
              SELECT DISTINCT ON (product_id)
                product_id, revenue, sales_qty, orders, views, conversion_rate, date
              FROM traffic_stats
              WHERE period_days >= 14 AND date >= ${t14Start}
              ORDER BY product_id, period_days DESC, date DESC
            ),
            daily_sum AS (
              SELECT
                ts.product_id,
                SUM(ts.revenue)::int AS revenue,
                SUM(ts.sales_qty)::int AS sales_qty,
                SUM(ts.orders)::int AS orders,
                SUM(ts.views)::int AS views,
                CASE WHEN SUM(ts.views) > 0 THEN ROUND(SUM(ts.orders)::numeric / SUM(ts.views) * 100, 2) ELSE 0 END AS conversion_rate,
                MAX(ts.date)::text AS date
              FROM traffic_stats ts
              WHERE ts.period_days = 1 AND ts.date >= ${t14Start}
                AND NOT EXISTS (SELECT 1 FROM agg14 a WHERE a.product_id = ts.product_id)
              GROUP BY ts.product_id
            )
            SELECT product_id, revenue::int, sales_qty::int, orders::int, conversion_rate, date::text FROM agg14
            UNION ALL
            SELECT product_id, revenue, sales_qty, orders, conversion_rate, date FROM daily_sum
          `,
          // t14prev: 이전 14일 트래픽 — period_days>=14 우선, 없으면 일별 합산
          this.prisma.$queryRaw<
            { product_id: string; revenue: number; sales_qty: number; orders: number; date: string }[]
          >`
            WITH agg14prev AS (
              SELECT DISTINCT ON (product_id)
                product_id, revenue, sales_qty, orders, date
              FROM traffic_stats
              WHERE period_days >= 14 AND date >= ${t14PrevStart} AND date < ${t14PrevEnd}
              ORDER BY product_id, period_days DESC, date DESC
            ),
            daily_prev AS (
              SELECT
                ts.product_id,
                SUM(ts.revenue)::int AS revenue,
                SUM(ts.sales_qty)::int AS sales_qty,
                SUM(ts.orders)::int AS orders,
                MAX(ts.date)::text AS date
              FROM traffic_stats ts
              WHERE ts.period_days = 1 AND ts.date >= ${t14PrevStart} AND ts.date < ${t14PrevEnd}
                AND NOT EXISTS (SELECT 1 FROM agg14prev a WHERE a.product_id = ts.product_id)
              GROUP BY ts.product_id
            )
            SELECT product_id, revenue::int, sales_qty::int, orders::int, date::text FROM agg14prev
            UNION ALL
            SELECT product_id, revenue, sales_qty, orders, date FROM daily_prev
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
        const maxRate =
          typeof maxProfitRate === 'number' ? maxProfitRate : parseFloat(maxProfitRate);
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

    // TrafficStats 폴백: ProfitLoss/Order 기반 이익이 없고 traffic revenue가 있으면 traffic 기반으로 수익 계산
    const trafficData = maps.traffic.get(p.id);
    if (trafficData && trafficData.revenue > 0 && trafficData.salesQty > 0 && !resolved.isCostMissing) {
      const tRevenue = trafficData.revenue;
      const tSalesQty = trafficData.salesQty;
      const commRate = resolved.commissionRate || 0.108;
      const tNetProfit = Math.round(
        tRevenue -
        resolved.costPrice * tSalesQty -
        tRevenue * commRate -
        (p.shippingCost ? Number(p.shippingCost) : 0) * tSalesQty,
      );
      // traffic 객체에 수익 정보 추가 (frontended에서 표시용)
      trafficData.netProfit = tNetProfit;
      trafficData.profitRate = tRevenue > 0 ? Math.round((tNetProfit / tRevenue) * 1000) / 10 : 0;
      // ProfitLoss/Order 기반 수익이 없으면 traffic 기반으로 폴백
      if (netProfit === 0) {
        netProfit = tNetProfit;
        if (revenue === 0) revenue = tRevenue;
      }
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
      pipelineStep: p.pipelineStep ?? null,
    } satisfies ProductListItem;
  }

  async create(body: CreateProductInput): Promise<any> {
    const { name, companyId } = body;
    if (!name || !companyId) {
      throw new BadRequestException('상품명과 회사는 필수입니다.');
    }

    const sellPrice = Number(body.sellPrice) || 0;
    const costPrice = Number(body.costPrice) || 0;
    const shippingCost = Number(body.shippingCost) || 0;
    const sku = body.sku || `AUTO-${Date.now()}`;

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
            category: body.category ?? null,
            sellPrice: sellPrice > 0 ? sellPrice : null,
            costPrice: costPrice > 0 ? costPrice : null,
            commissionRate:
              Number(body.commissionRate) > 0 ? Number(body.commissionRate) : null,
            shippingCost: shippingCost > 0 ? shippingCost : null,
            companyId,
            status: body.status ?? 'active',
            abcGrade: body.abcGrade ?? 'C',
            adTier: body.adTier ?? null,
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

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { company: true, inventory: true, masterProduct: { include: { inventory: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');

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
      data: { images: images as unknown as Prisma.InputJsonValue },
      select: { id: true, images: true },
    });
  }

  async updateDraftContent(id: string, body: Record<string, unknown>): Promise<any> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.product.update({
      where: { id },
      data: { draftContent: body as Prisma.InputJsonValue },
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
    gradeRevA: number;
    gradeRevB: number;
    gradeRevC: number;
    gradeAdA: number;
    gradeAdB: number;
    gradeAdC: number;
  }> {
    try {
      // statusFilter 허용 목록으로 화이트리스트 검증 (SQL Injection 방지)
      const ALLOWED_STATUSES = ['active', 'inactive', 'draft', 'discontinued'] as const;
      const safeStatus = ALLOWED_STATUSES.includes(statusFilter as typeof ALLOWED_STATUSES[number])
        ? statusFilter
        : null;

      // 1. Grade counts + total
      const gradeCounts = await this.prisma.$queryRaw<
        { abc_grade: string | null; cnt: number }[]
      >`
        SELECT p.abc_grade, COUNT(*)::int AS cnt
        FROM products p
        WHERE p.is_deleted = false
          AND (${safeStatus}::text IS NULL OR p.status = ${safeStatus})
        GROUP BY p.abc_grade
      `;

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
      const [minusRow] = await this.prisma.$queryRaw<{ cnt: number }[]>`
        SELECT COUNT(DISTINCT pl.product_id)::int AS cnt
        FROM profit_loss pl
        JOIN products p ON p.id = pl.product_id
        WHERE pl.net_profit < 0
          AND p.is_deleted = false
          AND (${safeStatus}::text IS NULL OR p.status = ${safeStatus})
      `;

      // 3. 3%이하 (0 <= profit rate <= 3%) — net_profit >= 0, revenue > 0, rate <= 3
      const [lowRow] = await this.prisma.$queryRaw<{ cnt: number }[]>`
        SELECT COUNT(DISTINCT pl.product_id)::int AS cnt
        FROM profit_loss pl
        JOIN products p ON p.id = pl.product_id
        WHERE pl.net_profit >= 0
          AND pl.revenue > 0
          AND (CAST(pl.net_profit AS FLOAT) / pl.revenue * 100) <= 3
          AND p.is_deleted = false
          AND (${safeStatus}::text IS NULL OR p.status = ${safeStatus})
      `;

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
      const [adRow] = await this.prisma.$queryRaw<{ ad_count: number; no_ad_count: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE p.ad_tier IS NOT NULL AND p.ad_tier != '')::int AS ad_count,
          COUNT(*) FILTER (WHERE p.ad_tier IS NULL OR p.ad_tier = '')::int AS no_ad_count
        FROM products p
        WHERE p.is_deleted = false
          AND (${safeStatus}::text IS NULL OR p.status = ${safeStatus})
      `;

      // 6. 등급별 14일 매출 — 상품당 최신 레코드 1건씩만 (이전 업로드 제외)
      const t14Start = new Date();
      t14Start.setDate(t14Start.getDate() - 14);

      const gradeRevRows = await this.prisma.$queryRaw<
        { abc_grade: string | null; total_revenue: number; total_ad_cost: number }[]
      >`
        WITH agg14 AS (
          SELECT DISTINCT ON (product_id) product_id, revenue
          FROM traffic_stats
          WHERE period_days >= 14 AND date >= ${t14Start}
          ORDER BY product_id, period_days DESC, date DESC
        ),
        daily_sum AS (
          SELECT ts.product_id, SUM(ts.revenue)::int AS revenue
          FROM traffic_stats ts
          WHERE ts.period_days = 1 AND ts.date >= ${t14Start}
            AND NOT EXISTS (SELECT 1 FROM agg14 a WHERE a.product_id = ts.product_id)
          GROUP BY ts.product_id
        ),
        traffic AS (
          SELECT product_id, revenue FROM agg14
          UNION ALL
          SELECT product_id, revenue FROM daily_sum
        )
        SELECT p.abc_grade,
               COALESCE(SUM(tr.revenue), 0)::float AS total_revenue,
               COALESCE(SUM(pl.ad_cost), 0)::float AS total_ad_cost
        FROM products p
        LEFT JOIN traffic tr ON tr.product_id = p.id
        LEFT JOIN (
          SELECT product_id, SUM(ad_cost)::float AS ad_cost
          FROM profit_loss
          GROUP BY product_id
        ) pl ON pl.product_id = p.id
        WHERE p.is_deleted = false
          AND (${safeStatus}::text IS NULL OR p.status = ${safeStatus})
        GROUP BY p.abc_grade
      `;

      let gradeRevA = 0, gradeRevB = 0, gradeRevC = 0;
      let gradeAdA = 0, gradeAdB = 0, gradeAdC = 0;
      for (const row of gradeRevRows) {
        if (row.abc_grade === 'A') { gradeRevA = Number(row.total_revenue); gradeAdA = Number(row.total_ad_cost); }
        else if (row.abc_grade === 'B') { gradeRevB = Number(row.total_revenue); gradeAdB = Number(row.total_ad_cost); }
        else if (row.abc_grade === 'C') { gradeRevC = Number(row.total_revenue); gradeAdC = Number(row.total_ad_cost); }
      }

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
        gradeRevA: Math.round(gradeRevA),
        gradeRevB: Math.round(gradeRevB),
        gradeRevC: Math.round(gradeRevC),
        gradeAdA: Math.round(gradeAdA),
        gradeAdB: Math.round(gradeAdB),
        gradeAdC: Math.round(gradeAdC),
      };
    } catch {
      throw new InternalServerErrorException('파이프라인 통계 조회 실패');
    }
  }

  /**
   * ABC 등급 자동 분류
   * A: 매출 상위 누적 75% 기여 상품
   * B: 다음 20% (75~95%)
   * C: 나머지 5% (95~100%) + 매출 없는 상품
   */
  async classifyAbcGrades(): Promise<{
    updated: number;
    summary: { A: number; B: number; C: number; new: number };
  }> {
    const t14Start = new Date();
    t14Start.setDate(t14Start.getDate() - 14);

    // 상품별 14일 매출 (period_days>=14 우선, 없으면 일별 합산)
    // 14일 미만 신상품은 ABC 분류에서 제외 (AND p.created_at < NOW() - INTERVAL '14 days')
    const revenueRows = await this.prisma.$queryRaw<
      { product_id: string; revenue: number }[]
    >`
      WITH agg14 AS (
        SELECT DISTINCT ON (product_id) product_id, revenue
        FROM traffic_stats
        WHERE period_days >= 14 AND date >= ${t14Start}
        ORDER BY product_id, period_days DESC, date DESC
      ),
      daily_sum AS (
        SELECT ts.product_id, SUM(ts.revenue)::int AS revenue
        FROM traffic_stats ts
        WHERE ts.period_days = 1 AND ts.date >= ${t14Start}
          AND NOT EXISTS (SELECT 1 FROM agg14 a WHERE a.product_id = ts.product_id)
        GROUP BY ts.product_id
      ),
      traffic AS (
        SELECT product_id, revenue FROM agg14
        UNION ALL
        SELECT product_id, revenue FROM daily_sum
      )
      SELECT p.id AS product_id, COALESCE(t.revenue, 0)::int AS revenue
      FROM products p
      LEFT JOIN traffic t ON t.product_id = p.id
      WHERE p.is_deleted = false AND p.status = 'active'
        AND p.created_at < NOW() - INTERVAL '14 days'
    `;

    // 매출 내림차순 정렬
    const sorted = [...revenueRows].sort(
      (a, b) => Number(b.revenue) - Number(a.revenue),
    );
    const totalRevenue = sorted.reduce((sum, r) => sum + Number(r.revenue), 0);

    // 누적 매출 기준 A/B/C 분류
    let cumulativeBefore = 0;
    const classified = sorted.map((r) => {
      const pct = totalRevenue > 0 ? cumulativeBefore / totalRevenue : 1;
      const grade = pct < 0.75 ? 'A' : pct < 0.95 ? 'B' : 'C';
      cumulativeBefore += Number(r.revenue);
      return { productId: r.product_id, newGrade: grade };
    });

    // 현재 등급 조회 (ABC 분류 대상 상품)
    const currentGrades = await this.prisma.product.findMany({
      where: {
        isDeleted: false,
        status: 'active',
        createdAt: { lte: new Date(Date.now() - 14 * 86400000) },
      },
      select: { id: true, abcGrade: true },
    });
    const gradeMap = new Map(currentGrades.map((p) => [p.id, p.abcGrade]));

    // 변경된 상품만 필터
    const changed = classified.filter(
      (c) => gradeMap.get(c.productId) !== c.newGrade,
    );

    if (changed.length > 0) {
      const now = new Date();
      await this.prisma.$transaction([
        ...changed.map((c) =>
          this.prisma.product.update({
            where: { id: c.productId },
            data: { abcGrade: c.newGrade },
          }),
        ),
        this.prisma.gradeHistory.createMany({
          data: changed.map((c) => ({
            productId: c.productId,
            oldGrade: gradeMap.get(c.productId) ?? null,
            newGrade: c.newGrade,
            score: 0,
            revenueScore: 0,
            marginScore: 0,
            velocityScore: 0,
            reason: 'auto_abc_revenue',
            calculatedAt: now,
          })),
        }),
      ]);
    }

    // 14일 미만 신상품 — abcGrade = 'NEW' 로 업데이트
    const newProducts = await this.prisma.product.findMany({
      where: {
        isDeleted: false,
        status: 'active',
        createdAt: { gt: new Date(Date.now() - 14 * 86400000) },
      },
      select: { id: true, abcGrade: true },
    });
    const newProductsToUpdate = newProducts.filter((p) => p.abcGrade !== 'NEW');
    if (newProductsToUpdate.length > 0) {
      await this.prisma.$transaction(
        newProductsToUpdate.map((p) =>
          this.prisma.product.update({
            where: { id: p.id },
            data: { abcGrade: 'NEW' },
          }),
        ),
      );
    }

    const summary = { A: 0, B: 0, C: 0, new: newProducts.length };
    for (const c of classified) {
      summary[c.newGrade as 'A' | 'B' | 'C']++;
    }

    return { updated: changed.length + newProductsToUpdate.length, summary };
  }

  /**
   * 손익 기반 상품 분류
   * - 적자: (매출 - 매입가 - 광고비 - 수수료 - 배송비) < 0
   * - 저마진: 0 ≤ 이익률 ≤ 3%
   *
   * TODO: 현재 상품별 광고비 미집계 (ad_cost는 profit_loss 테이블 월별 집계값 사용)
   *       상품별 일별 광고비 추적 연동 후 ad_cost 컬럼 업데이트 필요
   */
  async classifyProfitLossGrades(): Promise<{
    updated: number;
    minus: number;
    lowMargin: number;
    normal: number;
  }> {
    const rows = await this.prisma.$queryRaw<
      { product_id: string; revenue: number; cost_of_goods: number; ad_cost: number; net_profit: number; profit_rate: number }[]
    >`
      SELECT
        pl.product_id,
        COALESCE(SUM(pl.revenue), 0)::float          AS revenue,
        COALESCE(SUM(pl.cost_of_goods), 0)::float    AS cost_of_goods,
        COALESCE(SUM(pl.ad_cost), 0)::float          AS ad_cost,
        COALESCE(SUM(pl.net_profit), 0)::float       AS net_profit,
        CASE
          WHEN COALESCE(SUM(pl.revenue), 0) > 0
          THEN ROUND((COALESCE(SUM(pl.net_profit), 0) / SUM(pl.revenue) * 100)::numeric, 2)::float
          ELSE 0
        END AS profit_rate
      FROM profit_loss pl
      JOIN products p ON p.id = pl.product_id
      WHERE p.is_deleted = false AND p.status = 'active'
      GROUP BY pl.product_id
      HAVING COALESCE(SUM(pl.revenue), 0) > 0
    `;

    // 각 상품의 새 profitTag 계산
    const tagged = rows.map((row) => {
      const np = Number(row.net_profit);
      const rate = Number(row.profit_rate);
      const newTag = np < 0 ? 'minus' : rate <= 3 ? 'low_margin' : 'normal';
      return { productId: row.product_id, newTag };
    });

    // 현재 profitTag 조회
    const productIds = tagged.map((t) => t.productId);
    const currentTags = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, profitTag: true },
    });
    const tagMap = new Map(currentTags.map((p) => [p.id, p.profitTag]));

    // 변경된 것만 필터
    const changed = tagged.filter((t) => tagMap.get(t.productId) !== t.newTag);

    let minus = 0;
    let lowMargin = 0;
    let normal = 0;
    for (const t of tagged) {
      if (t.newTag === 'minus') minus++;
      else if (t.newTag === 'low_margin') lowMargin++;
      else normal++;
    }

    if (changed.length > 0) {
      await this.prisma.$transaction(
        changed.map((t) =>
          this.prisma.product.update({
            where: { id: t.productId },
            data: { profitTag: t.newTag },
          }),
        ),
      );
    }

    return { updated: changed.length, minus, lowMargin, normal };
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
