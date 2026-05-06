import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ProductManagementListItem,
  ProductManagementListResponse,
  ProductManagementPipelineCounts,
} from '@kiditem/shared/product';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPerListingMetrics } from '../../../common/per-listing-profit';
import { ListMastersQuery } from '../../dto/list-masters.query';
import { MASTER_WITH_IMAGES, type MasterWithImageRows } from '../../adapter/out/prisma/master-product.query';
import { withImageRows } from '../../mapper/master-product.mapper';
import {
  EMPTY_METRICS,
  daysAgo,
  isActiveAdTarget,
  isActiveText,
  isCleanupText,
  isInactiveText,
  mergeMetric,
  previousWindowStart,
  ratioToPercent,
  toTrafficSnapshot,
  type ManagementFacts,
  type MetricSums,
  type ProductManagementGradeInfo,
} from './product-management.read-model';

export type { ProductManagementListItem, ProductManagementPipelineCounts } from '@kiditem/shared/product';

type CategoryGroupKey = NonNullable<ListMastersQuery['categoryGroup']>;

const CATEGORY_GROUP_FILTERS: Record<CategoryGroupKey, string[]> = {
  season: ['계절용품/시즌용품', '신학기용품', '어린이날', '어버이날/스승의날', '여름용품', '가을운동회', '할로윈데이', '겨울용품', '크리스마스용품', '명절용품/설날/추석'],
  stationery: ['문구용품/노트/문구세트/색종이', '노트/공책/수첩/스케치북', '문구세트', '크레파스/물감', '색종이/색도화지', '화이트보드/메모보드', '팬시스티커', '지우개', '자류/가위/칼', '연필깎이', '풀/본드/접착제', '필기류', '필통', '기타사무용품'],
  toy: ['완구/블록/퍼즐/보드/젤리괴물', '완구', '비눗방울', '블록', '퍼즐', '종이퍼즐', '보드게임', '라켓/캐치볼', '주물럭/젤리괴물/슬라임', '큐브/팽이', '칼라링/슬링키', '탱탱볼/요요볼', '기타활동완구'],
  bag: ['보조가방/책가방/가방류', '보조가방', '크로스백', '비치가방'],
  'music-art-sports': ['음악용품/미술용품/체육용품', '악기류', '미술용품', '색종이/색상지/도화지/마분지', '배드민턴/라켓류', '캐치볼/프로펠라/원반류'],
  learning: ['학습교재/수업교재', '수업교재(종이)', '수업교재(나무)', '수업교재(기타)', '컬러룬(풍선)색칠하기', '색칠놀이(기타)', '역할놀이', '비즈/생크림공예', '십자수/뜨게질', '점토/클레이', '학습교구'],
  fancy: ['팬시/앨범/지갑/거울/악세서리', '팬시', '다용도꽂이/정리함', '앨범/액자', '지갑/동전지갑', '악세서리/반지/목걸이', '포장지류/선물상자', '시계', '저금통', '컵/텀블러/물병', '우산/우비'],
  craft: ['만들기재료/클레이/비즈', '리본/비드/줄/끈', '폼폼이/모루', '고무재료', '나무재료', '종이재료', '천재료', '플라스틱재료', '쇠/핀재료', '찍찍이/벨크로', '스티로폼재료', '기타만들기재료'],
  kindergarten: ['유치원용품/티셔츠/시설교구용품/도시락', '원아수첩/명찰/기타', '앞치마/토시/덧신', '도시락/간식접시/물병', '역할놀이교구/손인형', '시설교구', '단체티셔츠/모자', '상장류', '공부상'],
  snack: ['커피류/시리얼/간식류/사탕류', '시리얼', '과자류', '사탕류', '음료(차)'],
};

const GRADE_WEIGHT: Record<'A' | 'B' | 'C', number> = { A: 3, B: 2, C: 1 };

@Injectable()
export class ProductManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    q: ListMastersQuery,
  ): Promise<ProductManagementListResponse> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const matchingIds = await this.resolveAdvancedFilterMasterIds(organizationId, q);
    const where = this.masterWhere(organizationId, q, matchingIds);
    if (matchingIds !== null && matchingIds.length === 0) {
      return { items: [], total: 0, page, limit, nextCursor: null } satisfies ProductManagementListResponse;
    }
    const gradeByMaster = await this.gradeByMaster(organizationId, q.period ?? 14);

    const [total, rows] = await Promise.all([
      this.prisma.masterProduct.count({ where }),
      this.managementPageRows(organizationId, where, page, limit),
    ]);

    const items = await this.enrichRows(organizationId, rows, q.period ?? 14, gradeByMaster);
    return { items, total, page, limit, nextCursor: null } satisfies ProductManagementListResponse;
  }

  private async managementPageRows(
    organizationId: string,
    where: Prisma.MasterProductWhereInput,
    page: number,
    limit: number,
  ): Promise<MasterWithImageRows[]> {
    const candidates = await this.prisma.masterProduct.findMany({
      where,
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (candidates.length === 0) return [];

    const inventory = await this.inventoryByMaster(organizationId, candidates.map((row) => row.id));
    const orderedIds = candidates
      .sort((a, b) => {
        const stockDiff = (inventory.get(b.id)?.currentStock ?? 0) - (inventory.get(a.id)?.currentStock ?? 0);
        if (stockDiff !== 0) return stockDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .slice((page - 1) * limit, page * limit)
      .map((row) => row.id);

    const rows = await this.prisma.masterProduct.findMany({
      where: { organizationId, id: { in: orderedIds } },
      include: MASTER_WITH_IMAGES,
    }) as MasterWithImageRows[];
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  async pipelineStats(
    organizationId: string,
    q: Pick<ListMastersQuery, 'status' | 'period' | 'grade' | 'ad' | 'stock' | 'category' | 'categoryGroup' | 'search'>,
  ): Promise<ProductManagementPipelineCounts> {
    const period = q.period ?? 14;
    const gradeByMaster = await this.gradeByMaster(organizationId, period);
    // NOTE: PR #193 review #1 (yhc125) — pipeline-stats 는 frontend polling
    // read endpoint 이므로 hidden write (`syncGradeChanges` 의 abcGrade
    // update + Alert insert) 를 트리거하지 않는다. grade 동기화는 explicit
    // command/job 경로에서만 호출해야 한다 (후속 lane).

    const query = q as ListMastersQuery;
    const matchingIds = await this.resolveAdvancedFilterMasterIds(organizationId, query);
    if (matchingIds !== null && matchingIds.length === 0) return this.emptyPipelineCounts();

    const where = this.masterWhere(organizationId, query, matchingIds);
    const masters = await this.prisma.masterProduct.findMany({ where, select: { id: true } });
    const masterIds = masters.map((master) => master.id);
    if (masterIds.length === 0) return this.emptyPipelineCounts();

    const [facts, channelLinkedMasterIds] = await Promise.all([
      this.managementFacts(organizationId, masterIds, period),
      this.channelLinkedMasterIds(organizationId, masterIds),
    ]);
    const counts = this.emptyPipelineCounts();
    counts.total = masterIds.length;
    counts.channelLinkedProducts = channelLinkedMasterIds.size;
    counts.channelUnlinkedProducts = Math.max(masterIds.length - channelLinkedMasterIds.size, 0);

    for (const masterId of masterIds) {
      const isChannelLinked = channelLinkedMasterIds.has(masterId);
      const grade = gradeByMaster.get(masterId)?.grade ?? 'C';
      if (isChannelLinked) {
        counts[`grade${grade}` as 'gradeA' | 'gradeB' | 'gradeC'] += 1;
      }

      const status = facts.statusByMaster.get(masterId) ?? 'unknown';
      counts[status] += 1;

      const inventory = facts.inventoryByMaster.get(masterId) ?? this.emptyInventory();
      if (inventory.stockStatus === 'out') counts.zeroStock += 1;
      if (inventory.stockStatus === 'low') counts.lowStock += 1;
      if (inventory.stockStatus !== 'healthy') counts.stockRisk += 1;

      const metrics = facts.periodMetricsByMaster.get(masterId) ?? EMPTY_METRICS;
      const profit = facts.profitByMaster.get(masterId) ?? {
        revenue: metrics.revenue,
        netProfit: 0,
        profitRate: 0,
        orderCount: metrics.orders,
      };
      if (isChannelLinked && facts.profitByMaster.has(masterId)) {
        if (profit.profitRate < 0) counts.minus += 1;
        if (profit.profitRate >= 0 && profit.profitRate <= 3) counts.low += 1;
      }

      const isAdvertising = facts.activeAdMasterIds.has(masterId);
      if (isAdvertising) counts.adCount += 1;
      else counts.noAdCount += 1;
      if (isAdvertising && profit.profitRate < 0) counts.adLoss += 1;

      const revenue = metrics.revenue;
      const adSpend = metrics.adSpend;
      counts.totalRev += revenue;
      counts.totalAd += adSpend;
      if (isChannelLinked) {
        counts[`gradeRev${grade}` as 'gradeRevA' | 'gradeRevB' | 'gradeRevC'] += revenue;
        counts[`gradeAd${grade}` as 'gradeAdA' | 'gradeAdB' | 'gradeAdC'] += adSpend;
      }
    }

    return counts satisfies ProductManagementPipelineCounts;
  }

  private emptyPipelineCounts(): ProductManagementPipelineCounts {
    return {
      total: 0,
      channelLinkedProducts: 0,
      channelUnlinkedProducts: 0,
      gradeA: 0,
      gradeB: 0,
      gradeC: 0,
      active: 0,
      inactive: 0,
      cleanup: 0,
      unknown: 0,
      minus: 0,
      low: 0,
      zeroStock: 0,
      lowStock: 0,
      stockRisk: 0,
      adLoss: 0,
      gradeChangeA: 0,
      gradeChangeB: 0,
      gradeChangeC: 0,
      adCount: 0,
      noAdCount: 0,
      totalRev: 0,
      totalAd: 0,
      gradeRevA: 0,
      gradeRevB: 0,
      gradeRevC: 0,
      gradeAdA: 0,
      gradeAdB: 0,
      gradeAdC: 0,
    } satisfies ProductManagementPipelineCounts;
  }

  private async syncGradeChanges(
    organizationId: string,
    gradeByMaster: Map<string, ProductManagementGradeInfo>,
  ): Promise<void> {
    const masterIds = [...gradeByMaster.keys()];
    if (masterIds.length === 0) return;

    const masters = await this.prisma.masterProduct.findMany({
      where: { organizationId, id: { in: masterIds }, isDeleted: false },
      select: { id: true, name: true, abcGrade: true },
    });

    for (const master of masters) {
      const computedGrade = gradeByMaster.get(master.id)?.grade;
      if (!computedGrade) continue;

      const storedGrade = this.normalizeStoredGrade(master.abcGrade);
      if (!storedGrade) {
        await this.prisma.masterProduct.updateMany({
          where: { id: master.id, organizationId, abcGrade: master.abcGrade },
          data: { abcGrade: computedGrade },
        });
        continue;
      }
      if (storedGrade === computedGrade) continue;

      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.masterProduct.updateMany({
          where: { id: master.id, organizationId, abcGrade: storedGrade },
          data: { abcGrade: computedGrade },
        });
        if (updated.count === 0) return;

        const direction = this.gradeDirection(storedGrade, computedGrade);
        const severity = direction === 'downgrade' ? 'warning' : 'info';
        await tx.alert.create({
          data: {
            organizationId,
            targetType: 'master',
            targetId: master.id,
            type: 'product_grade_change',
            severity,
            title: `${master.name} ${storedGrade}->${computedGrade}`,
            message: `상품 등급이 ${storedGrade}등급에서 ${computedGrade}등급으로 변경되었습니다.`,
            isRead: false,
          },
        });
      });
    }
  }

  private normalizeStoredGrade(value: string | null): 'A' | 'B' | 'C' | null {
    if (value === 'A' || value === 'B' || value === 'C') return value;
    return null;
  }

  private gradeDirection(fromGrade: 'A' | 'B' | 'C', toGrade: 'A' | 'B' | 'C'): 'upgrade' | 'downgrade' {
    return GRADE_WEIGHT[toGrade] > GRADE_WEIGHT[fromGrade] ? 'upgrade' : 'downgrade';
  }

  private masterWhere(
    organizationId: string,
    q: ListMastersQuery,
    matchingIds: string[] | null,
  ): Prisma.MasterProductWhereInput {
    const ands: Prisma.MasterProductWhereInput[] = [];
    if (q.search) {
      ands.push({
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { legacyCode: { contains: q.search } },
          { code: { contains: q.search } },
          { barcode: { contains: q.search } },
        ],
      });
    }
    if (matchingIds !== null) ands.push({ id: { in: matchingIds } });
    if (q.categoryGroup && !q.category) {
      const categories = CATEGORY_GROUP_FILTERS[q.categoryGroup] ?? [];
      if (categories.length > 0) {
        ands.push({
          OR: categories.map((category) => ({
            category: { contains: category, mode: 'insensitive' },
          })),
        });
      }
    }

    return {
      organizationId,
      ...(q.includeDeleted ? {} : { isDeleted: false }),
      OR: [
        { options: { some: { organizationId, isDeleted: false } } },
        { listings: { some: { organizationId, isDeleted: false } } },
      ],
      ...(q.isDeleted !== undefined ? { isDeleted: q.isDeleted } : {}),
      ...(q.isTemporary !== undefined ? { isTemporary: q.isTemporary } : {}),
      ...(q.category ? { category: { contains: q.category, mode: 'insensitive' } } : {}),
      ...(q.brand ? { brand: q.brand } : {}),
      ...(q.abcGrade ? { abcGrade: q.abcGrade } : {}),
      ...(q.pipelineStep ? { pipelineStep: q.pipelineStep } : {}),
      ...(ands.length > 0 ? { AND: ands } : {}),
    };
  }

  private async resolveAdvancedFilterMasterIds(
    organizationId: string,
    q: ListMastersQuery,
  ): Promise<string[] | null> {
    const sets: Array<Set<string>> = [];

    if (q.ad) {
      const ads = await this.currentAdvertisingState(organizationId);
      const allIds = await this.allMasterIds(organizationId);
      sets.push(q.ad === 'ad' ? ads.masterIds : new Set(allIds.filter((id) => !ads.masterIds.has(id))));
    }

    if (q.stock) {
      const allIds = await this.allMasterIds(organizationId);
      const stock = await this.inventoryByMaster(organizationId, allIds);
      sets.push(new Set(allIds.filter((id) => {
        const current = stock.get(id) ?? this.emptyInventory();
        if (q.stock === 'zero') return current.stockStatus === 'out';
        if (q.stock === 'risk') return current.stockStatus !== 'healthy';
        return current.stockStatus === 'healthy';
      })));
    }

    if (q.status) {
      const statuses = await this.statusByMaster(organizationId);
      const allIds = await this.allMasterIds(organizationId);
      sets.push(new Set(allIds.filter((id) => (statuses.get(id) ?? 'unknown') === q.status)));
    }

    if (q.grade === 'minus' || q.grade === 'low') {
      const allIds = await this.allMasterIds(organizationId);
      const [profits, channelLinkedMasterIds] = await Promise.all([
        this.profitByMaster(organizationId, allIds, q.period ?? 14),
        this.channelLinkedMasterIds(organizationId, allIds),
      ]);
      sets.push(new Set(allIds.filter((id) => {
        const profit = profits.get(id);
        if (!channelLinkedMasterIds.has(id) || !profit) return false;
        const rate = profit.profitRate;
        return q.grade === 'minus' ? rate < 0 : rate >= 0 && rate <= 3;
      })));
    }

    if (q.grade === 'A' || q.grade === 'B' || q.grade === 'C') {
      const grades = await this.gradeByMaster(organizationId, q.period ?? 14);
      sets.push(new Set([...grades.entries()]
        .filter(([, info]) => info.grade === q.grade)
        .map(([id]) => id)));
    }

    if (sets.length === 0) return null;
    const [first, ...rest] = sets;
    return [...first].filter((id) => rest.every((s) => s.has(id)));
  }

  private async enrichRows(
    organizationId: string,
    rows: MasterWithImageRows[],
    period: number,
    gradeByMaster: Map<string, ProductManagementGradeInfo>,
  ): Promise<ProductManagementListItem[]> {
    if (rows.length === 0) return [];
    const masterIds = rows.map((row) => row.id);
    const facts = await this.managementFacts(organizationId, masterIds, period);

    return rows.map((row) => {
      const master = withImageRows(row) as MasterWithImageRows;
      const option = facts.optionByMaster.get(row.id);
      const inventory = facts.inventoryByMaster.get(row.id) ?? this.emptyInventory();
      const listing = facts.listingByMaster.get(row.id);
      const periodMetrics = facts.periodMetricsByMaster.get(row.id) ?? EMPTY_METRICS;
      const t14 = facts.t14MetricsByMaster.get(row.id) ?? EMPTY_METRICS;
      const t14prev = facts.t14PrevMetricsByMaster.get(row.id) ?? EMPTY_METRICS;
      const profit = facts.profitByMaster.get(row.id) ?? {
        revenue: periodMetrics.revenue,
        netProfit: 0,
        profitRate: 0,
        orderCount: periodMetrics.orders,
      };
      const salePrice = option?.sellPrice ?? listing?.channelPrice ?? 0;
      const adRate = periodMetrics.revenue > 0 ? (periodMetrics.adSpend / periodMetrics.revenue) * 100 : 0;
      const grade = gradeByMaster.get(row.id) ?? {
        grade: 'C' as const,
        score: 0,
        rank: 0,
        prevRank: null,
        strategy: '판매 반응 부족 — 노출, 가격, 상세페이지를 점검',
      };

      return {
        id: row.id,
        name: row.name,
        sku: option?.sku ?? row.code,
        category: row.category,
        company: row.brand,
        listingId: listing?.id ?? null,
        coupangProductId: listing?.externalId ?? row.legacyCode ?? null,
        thumbnailUrl: row.thumbnailUrl ?? row.imageUrl ?? null,
        imageUrl: row.imageUrl ?? master.images?.[0]?.url ?? null,
        createdAt: row.createdAt.toISOString(),
        costPrice: option?.costPrice ?? 0,
        sellPrice: salePrice,
        commissionRate: option?.commissionRate ?? 0,
        shippingCost: option?.shippingCost ?? 0,
        revenue: profit.revenue || periodMetrics.revenue,
        netProfit: profit.netProfit,
        profitRate: profit.profitRate,
        adRate,
        adTier: row.adTier,
        isAdvertising: facts.activeAdMasterIds.has(row.id),
        isCostMissing: option?.isCostMissing ?? true,
        inventoryId: inventory.inventoryId,
        optionId: inventory.optionId ?? option?.id ?? null,
        currentStock: inventory.currentStock,
        reservedStock: inventory.reservedStock,
        availableStock: inventory.availableStock,
        safetyStock: inventory.safetyStock,
        reorderPoint: inventory.reorderPoint,
        reorderQuantity: inventory.reorderQuantity,
        leadTimeDays: inventory.leadTimeDays,
        dailySalesAvg: inventory.dailySalesAvg,
        optimalStock: inventory.optimalStock,
        recommendedOrderQty: inventory.recommendedOrderQty,
        daysUntilStockout: inventory.daysUntilStockout,
        stockStatus: inventory.stockStatus,
        stockAction: inventory.stockAction,
        status: facts.statusByMaster.get(row.id) ?? 'unknown',
        abcGrade: grade.grade,
        gradeScore: grade.score,
        gradeRank: grade.rank,
        prevGradeRank: grade.prevRank,
        gradeStrategy: grade.strategy,
        healthScore: row.healthScore,
        reviewCount: facts.reviewCountByMaster.get(row.id) ?? 0,
        orderCount: profit.orderCount || periodMetrics.orders,
        thumbnailCTR: 0,
        traffic: toTrafficSnapshot(periodMetrics, profit.profitRate),
        t14: toTrafficSnapshot(t14),
        t14prev: toTrafficSnapshot(t14prev),
      } satisfies ProductManagementListItem;
    });
  }

  private async gradeByMaster(
    organizationId: string,
    period: number,
  ): Promise<Map<string, ProductManagementGradeInfo>> {
    const masters = await this.prisma.masterProduct.findMany({
      where: {
        organizationId,
        isDeleted: false,
        listings: { some: { organizationId, isDeleted: false } },
      },
      select: { id: true, createdAt: true },
    });
    const masterIds = masters.map((master) => master.id);
    if (masterIds.length === 0) return new Map();

    const facts = await this.managementFacts(organizationId, masterIds, period);
    return this.computeGradeByMaster(masters, facts);
  }

  private computeGradeByMaster(
    masters: Array<{ id: string; createdAt: Date }>,
    facts: ManagementFacts,
  ): Map<string, ProductManagementGradeInfo> {
    const revenueRows = masters
      .map((master) => ({
        id: master.id,
        revenue: facts.periodMetricsByMaster.get(master.id)?.revenue ?? 0,
      }))
      .filter((row) => row.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = revenueRows.reduce((sum, row) => sum + row.revenue, 0);
    const revenueScoreByMaster = new Map<string, number>();
    let cumulativeRevenue = 0;
    for (const row of revenueRows) {
      cumulativeRevenue += row.revenue;
      const contributionPct = totalRevenue > 0 ? (cumulativeRevenue / totalRevenue) * 100 : 100;
      revenueScoreByMaster.set(row.id, contributionPct <= 70 ? 50 : contributionPct <= 90 ? 35 : 20);
    }

    const previousRankByMaster = new Map<string, number>();
    masters
      .map((master) => ({
        id: master.id,
        revenue: facts.t14PrevMetricsByMaster.get(master.id)?.revenue ?? 0,
      }))
      .filter((row) => row.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .forEach((row, index) => previousRankByMaster.set(row.id, index + 1));

    const now = Date.now();
    const scored = masters.map((master) => {
      const metrics = facts.periodMetricsByMaster.get(master.id) ?? EMPTY_METRICS;
      const profit = facts.profitByMaster.get(master.id) ?? {
        revenue: metrics.revenue,
        netProfit: 0,
        profitRate: 0,
        orderCount: metrics.orders,
      };
      const inventory = facts.inventoryByMaster.get(master.id) ?? this.emptyInventory();
      const isAdvertising = facts.activeAdMasterIds.has(master.id);
      const ageDays = Math.floor((now - master.createdAt.getTime()) / (24 * 60 * 60 * 1000));
      const isNewProduct = ageDays <= 30;
      const revenueScore = revenueScoreByMaster.get(master.id) ?? (isNewProduct ? 15 : 0);
      const conversionRate = metrics.visitors > 0 ? (metrics.orders / metrics.visitors) * 100 : 0;
      const cartRate = metrics.views > 0 ? (metrics.cartAdds / metrics.views) * 100 : 0;
      const adCtr = metrics.adImpressions > 0 ? (metrics.adClicks / metrics.adImpressions) * 100 : 0;
      const interestRate = adCtr > 0 ? adCtr : cartRate;

      let conversionScore = 0;
      if (conversionRate >= 5) conversionScore = 20;
      else if (conversionRate >= 3) conversionScore = 15;
      else if (conversionRate >= 1) conversionScore = 10;
      else if (conversionRate > 0) conversionScore = 5;

      let interestScore = 0;
      if (interestRate >= 3) interestScore = 10;
      else if (interestRate >= 1) interestScore = 6;
      else if (interestRate > 0) interestScore = 3;

      let profitScore = 0;
      if (profit.profitRate < 0) profitScore = -15;
      else if (profit.profitRate >= 15) profitScore = 10;
      else if (profit.profitRate >= 7) profitScore = 7;
      else if (profit.profitRate >= 3) profitScore = 4;

      let score = revenueScore + conversionScore + interestScore + profitScore;
      if (isAdvertising && metrics.revenue <= 0 && metrics.adSpend > 0) score -= 10;
      if (isNewProduct && metrics.revenue <= 0 && inventory.stockStatus !== 'out') {
        score = Math.max(score, metrics.views > 0 || metrics.cartAdds > 0 || metrics.orders > 0 ? 42 : 35);
      }
      if (inventory.stockStatus === 'out') score = Math.min(score, 39);
      if (inventory.stockStatus === 'low') score = Math.min(score, 69);
      score = Math.max(0, Math.min(100, Math.round(score)));

      let grade: ProductManagementGradeInfo['grade'] = 'C';
      if (score >= 70 && metrics.revenue > 0 && inventory.stockStatus === 'healthy') grade = 'A';
      else if (score >= 40 || (isNewProduct && score >= 35 && inventory.stockStatus !== 'out')) grade = 'B';

      return {
        id: master.id,
        revenue: metrics.revenue,
        score,
        grade,
        stockStatus: inventory.stockStatus,
        profitRate: profit.profitRate,
        isAdvertising,
        isNewProduct,
        adSpend: metrics.adSpend,
      };
    });

    const rankByMaster = new Map<string, number>();
    scored
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        return b.revenue - a.revenue;
      })
      .forEach((row, index) => rankByMaster.set(row.id, index + 1));

    return new Map(scored.map((row) => [row.id, {
      grade: row.grade,
      score: row.score,
      rank: rankByMaster.get(row.id) ?? 0,
      prevRank: previousRankByMaster.get(row.id) ?? null,
      strategy: this.gradeStrategy(row),
    }]));
  }

  private gradeStrategy(row: {
    grade: 'A' | 'B' | 'C';
    revenue: number;
    profitRate: number;
    stockStatus: ProductManagementListItem['stockStatus'];
    isAdvertising: boolean;
    isNewProduct: boolean;
    adSpend: number;
  }): string {
    if (row.stockStatus === 'out') return '품절 처리 또는 재고 보충을 먼저 진행';
    if (row.stockStatus === 'low') return '재고 부족 — 발주 후 광고와 노출을 유지';
    if (row.profitRate < 0) return '손익 점검 — 원가, 광고비, 판매가를 먼저 조정';
    if (row.grade === 'A' && row.isAdvertising) return '핵심 매출 상품 — 광고 유지, 재고 방어';
    if (row.grade === 'A') return '자연매출 우수 — 광고 테스트 후보';
    if (row.isNewProduct && row.revenue <= 0) return '신상품 관찰 — 초기 노출과 CTR 확보';
    if (row.grade === 'B' && row.revenue > 0) return '성장 후보 — CTR, 전환율 개선 시 A등급 승격';
    if (row.isAdvertising && row.revenue <= 0 && row.adSpend > 0) return '광고비만 발생 — 키워드/소재 점검 또는 중단';
    return '판매 반응 부족 — 노출, 가격, 상세페이지를 점검';
  }

  private async managementFacts(
    organizationId: string,
    masterIds: string[],
    period: number,
  ): Promise<ManagementFacts> {
    const [stockByMaster, inventoryByMaster, statusByMaster, activeAds, optionByMaster, listingByMaster] = await Promise.all([
      this.stockByMaster(organizationId, masterIds),
      this.inventoryByMaster(organizationId, masterIds),
      this.statusByMaster(organizationId, masterIds),
      this.currentAdvertisingState(organizationId, masterIds),
      this.optionByMaster(organizationId, masterIds),
      this.listingByMaster(organizationId, masterIds),
    ]);

    const listingIds = [...listingByMaster.values()].map((listing) => listing.id);
    const [
      periodMetricsByListing,
      t14MetricsByListing,
      t14PrevMetricsByListing,
      profitByMaster,
      reviewCountByMaster,
    ] = await Promise.all([
      this.metricsByListing(organizationId, listingIds, daysAgo(period)),
      this.metricsByListing(organizationId, listingIds, daysAgo(14)),
      this.metricsByListing(organizationId, listingIds, previousWindowStart(14), daysAgo(14)),
      this.profitByMaster(organizationId, masterIds, period),
      this.reviewCountByMaster(organizationId, listingByMaster),
    ]);

    return {
      stockByMaster,
      inventoryByMaster,
      statusByMaster,
      activeAdMasterIds: activeAds.masterIds,
      optionByMaster,
      listingByMaster,
      periodMetricsByMaster: this.metricsByMaster(listingByMaster, periodMetricsByListing),
      t14MetricsByMaster: this.metricsByMaster(listingByMaster, t14MetricsByListing),
      t14PrevMetricsByMaster: this.metricsByMaster(listingByMaster, t14PrevMetricsByListing),
      profitByMaster,
      reviewCountByMaster,
    };
  }

  private async allMasterIds(organizationId: string): Promise<string[]> {
    const rows = await this.prisma.masterProduct.findMany({
      where: {
        organizationId,
        isDeleted: false,
        OR: [
          { options: { some: { organizationId, isDeleted: false } } },
          { listings: { some: { organizationId, isDeleted: false } } },
        ],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async channelLinkedMasterIds(organizationId: string, masterIds: string[]): Promise<Set<string>> {
    if (masterIds.length === 0) return new Set();
    const rows = await this.prisma.channelListing.findMany({
      where: { organizationId, masterId: { in: masterIds }, isDeleted: false },
      select: { masterId: true },
    });
    return new Set(rows.map((row) => row.masterId));
  }

  private async stockByMaster(organizationId: string, masterIds?: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.productOption.findMany({
      where: {
        organizationId,
        isDeleted: false,
        ...(masterIds ? { masterId: { in: masterIds } } : {}),
      },
      select: {
        masterId: true,
        availableStock: true,
        inventory: { select: { currentStock: true } },
      },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.masterId, (map.get(row.masterId) ?? 0) + (row.availableStock ?? row.inventory?.currentStock ?? 0));
    }
    return map;
  }

  private emptyInventory(): ManagementFacts['inventoryByMaster'] extends Map<string, infer T> ? T : never {
    return {
      inventoryId: null,
      optionId: null,
      currentStock: 0,
      reservedStock: 0,
      availableStock: 0,
      safetyStock: 0,
      reorderPoint: 0,
      reorderQuantity: 0,
      leadTimeDays: null,
      dailySalesAvg: 0,
      optimalStock: 0,
      recommendedOrderQty: 0,
      daysUntilStockout: null,
      stockStatus: 'out',
      stockAction: 'sold_out_required',
    };
  }

  private async inventoryByMaster(
    organizationId: string,
    masterIds: string[],
  ): Promise<ManagementFacts['inventoryByMaster']> {
    const rows = await this.prisma.productOption.findMany({
      where: { organizationId, masterId: { in: masterIds }, isDeleted: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        masterId: true,
        availableStock: true,
        inventory: {
          select: {
            id: true,
            currentStock: true,
            reservedStock: true,
            safetyStock: true,
            reorderPoint: true,
            reorderQuantity: true,
            leadTimeDays: true,
            dailySalesAvg: true,
          },
        },
      },
    });

    const map: ManagementFacts['inventoryByMaster'] = new Map();
    for (const row of rows) {
      const current = map.get(row.masterId) ?? this.emptyInventory();
      const inventoryStock = row.inventory?.currentStock ?? 0;
      const currentStock = current.currentStock + (row.availableStock ?? inventoryStock);
      const reservedStock = current.reservedStock + (row.inventory?.reservedStock ?? 0);
      const safetyStock = current.safetyStock + (row.inventory?.safetyStock ?? 0);
      const reorderPoint = current.reorderPoint + (row.inventory?.reorderPoint ?? 0);
      const reorderQuantity = current.reorderQuantity + (row.inventory?.reorderQuantity ?? 0);
      const dailySalesAvg = current.dailySalesAvg + Number(row.inventory?.dailySalesAvg?.toString() ?? 0);
      const leadTimeDays = row.inventory?.leadTimeDays ?? current.leadTimeDays;
      const leadTimeDemand = Math.ceil(dailySalesAvg * (leadTimeDays ?? 0));
      const optimalStock = Math.max(safetyStock, reorderPoint + reorderQuantity, leadTimeDemand + safetyStock);
      const recommendedOrderQty = currentStock <= reorderPoint
        ? Math.max(reorderQuantity, optimalStock - currentStock, 0)
        : 0;
      const daysUntilStockout = dailySalesAvg > 0 ? Math.floor(Math.max(currentStock - reservedStock, 0) / dailySalesAvg) : null;
      const stockStatus = currentStock <= 0 ? 'out' : currentStock <= reorderPoint ? 'low' : 'healthy';
      const stockAction = stockStatus === 'out'
        ? 'sold_out_required'
        : stockStatus === 'low'
          ? 'reorder_required'
          : 'monitor';

      map.set(row.masterId, {
        inventoryId: current.inventoryId ?? row.inventory?.id ?? null,
        optionId: current.optionId ?? row.id,
        currentStock,
        reservedStock,
        availableStock: Math.max(currentStock - reservedStock, 0),
        safetyStock,
        reorderPoint,
        reorderQuantity,
        leadTimeDays,
        dailySalesAvg,
        optimalStock,
        recommendedOrderQty,
        daysUntilStockout,
        stockStatus,
        stockAction,
      });
    }
    return map;
  }

  private async statusByMaster(
    organizationId: string,
    masterIds?: string[],
  ): Promise<Map<string, ProductManagementListItem['status']>> {
    const rows = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        isDeleted: false,
        ...(masterIds ? { masterId: { in: masterIds } } : {}),
      },
      select: { masterId: true, status: true, exposureStatus: true },
    });
    const map = new Map<string, ProductManagementListItem['status']>();
    for (const row of rows) {
      const current = map.get(row.masterId);
      if (current === 'active') continue;
      const hasStatusText = Boolean(row.status || row.exposureStatus);
      if (isActiveText(row.status, row.exposureStatus)) map.set(row.masterId, 'active');
      else if (isCleanupText(row.status, row.exposureStatus)) map.set(row.masterId, 'cleanup');
      else if (isInactiveText(row.status, row.exposureStatus)) map.set(row.masterId, 'inactive');
      else if (!current && hasStatusText) map.set(row.masterId, 'unknown');
    }
    return map;
  }

  private async optionByMaster(organizationId: string, masterIds: string[]): Promise<ManagementFacts['optionByMaster']> {
    const rows = await this.prisma.productOption.findMany({
      where: { organizationId, masterId: { in: masterIds }, isDeleted: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        masterId: true,
        sku: true,
        costPrice: true,
        sellPrice: true,
        commissionRate: true,
        shippingCost: true,
      },
    });
    const map: ManagementFacts['optionByMaster'] = new Map();
    for (const row of rows) {
      if (map.has(row.masterId)) continue;
      const costPrice = row.costPrice ?? 0;
      const sellPrice = row.sellPrice ?? 0;
      const commissionRate = ratioToPercent(row.commissionRate);
      const shippingCost = row.shippingCost ?? 0;
      map.set(row.masterId, {
        id: row.id,
        sku: row.sku,
        costPrice,
        sellPrice,
        commissionRate,
        shippingCost,
        isCostMissing: costPrice <= 0 || sellPrice <= 0,
      });
    }
    return map;
  }

  private async listingByMaster(organizationId: string, masterIds: string[]): Promise<ManagementFacts['listingByMaster']> {
    const rows = await this.prisma.channelListing.findMany({
      where: { organizationId, masterId: { in: masterIds }, isDeleted: false },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        masterId: true,
        externalId: true,
        channelName: true,
        channelPrice: true,
      },
    });
    const map: ManagementFacts['listingByMaster'] = new Map();
    for (const row of rows) {
      if (map.has(row.masterId)) continue;
      map.set(row.masterId, row);
    }
    return map;
  }

  private async metricsByListing(
    organizationId: string,
    listingIds: string[],
    gte: Date,
    lt?: Date,
  ): Promise<Map<string, MetricSums>> {
    if (listingIds.length === 0) return new Map();
    const rows = await this.prisma.channelListingDailySnapshot.groupBy({
      by: ['listingId'],
      where: {
        organizationId,
        listingId: { in: listingIds },
        businessDate: { gte, ...(lt ? { lt } : {}) },
      },
      _sum: {
        trafficVisitors: true,
        trafficViews: true,
        trafficCartAdds: true,
        trafficOrders: true,
        trafficSalesQty: true,
        trafficRevenue: true,
        adSpend: true,
        adImpressions: true,
        adClicks: true,
      },
    });
    const map = new Map<string, MetricSums>();
    for (const row of rows) {
      map.set(row.listingId, {
        visitors: row._sum.trafficVisitors ?? 0,
        views: row._sum.trafficViews ?? 0,
        cartAdds: row._sum.trafficCartAdds ?? 0,
        orders: row._sum.trafficOrders ?? 0,
        salesQty: row._sum.trafficSalesQty ?? 0,
        revenue: row._sum.trafficRevenue ?? 0,
        adSpend: row._sum.adSpend ?? 0,
        adImpressions: row._sum.adImpressions ?? 0,
        adClicks: row._sum.adClicks ?? 0,
      });
    }
    return map;
  }

  private metricsByMaster(
    listingByMaster: ManagementFacts['listingByMaster'],
    metricsByListing: Map<string, MetricSums>,
  ): Map<string, MetricSums> {
    const map = new Map<string, MetricSums>();
    for (const [masterId, listing] of listingByMaster) {
      const metrics = metricsByListing.get(listing.id);
      if (!metrics) continue;
      if (!map.has(masterId)) map.set(masterId, { ...EMPTY_METRICS });
      mergeMetric(map.get(masterId)!, metrics);
    }
    return map;
  }

  /**
   * Master 별 손익 (revenue / netProfit / profitRate / orderCount) — 최근 `period` 일.
   *
   * PR #193 review #4 (yhc125, 2차) — `prisma.profitLoss.*` 직접 read 는
   * `apps/server/src/finance/AGENTS.md` Plan D.1 가 명시적으로 금지한다
   * (`ProfitLoss` 는 writer 없는 legacy/future cache → 항상 stale).
   *
   * 대신 `apps/server/src/common/per-listing-profit.ts` 의
   * `buildPerListingMetrics(prisma, organizationId, from, to)` 를 호출한다.
   * 이 helper 는 finance 의 `profit-loss.service.ts:findAll` 에서 추출된
   * shared live aggregator 이고, advertising/dashboard 도 같은 helper 를
   * 통해 listing 별 손익을 계산한다 (Plan F1 T1, ADR-0016/I7/I8 준수).
   *
   * 여기서는 listing 별 결과를 master 별로 합산:
   *   - revenue / netProfit / orderCount = sum across listings of same master
   *   - profitRate = revenue > 0 ? (netProfit / revenue) * 100 : 0
   *
   * `masterIds` 가 주어지면 해당 master 만 남겨서 반환 (pipelineStats / enrich
   * 양쪽에서 재사용). 호출자는 해당 master 가 결과 Map 에 없을 수 있고, 그건
   * "최근 `period` 일 동안 매출 0" 을 의미한다 (caller 의 `?? { revenue:0,
   * netProfit:0, profitRate:0 }` fallback 이 그대로 동작).
   */
  private async profitByMaster(
    organizationId: string,
    masterIds?: string[],
    period: number = 14,
  ): Promise<Map<string, { revenue: number; netProfit: number; profitRate: number; orderCount: number }>> {
    const from = daysAgo(period);
    const to = new Date();
    const liveMetrics = await buildPerListingMetrics(this.prisma, organizationId, from, to);

    const out = new Map<string, { revenue: number; netProfit: number; profitRate: number; orderCount: number }>();
    const filterSet = masterIds ? new Set(masterIds) : null;

    for (const metric of liveMetrics) {
      if (filterSet && !filterSet.has(metric.masterId)) continue;
      const current = out.get(metric.masterId) ?? { revenue: 0, netProfit: 0, profitRate: 0, orderCount: 0 };
      current.revenue += metric.revenue;
      current.netProfit += metric.netProfit;
      current.orderCount += metric.orderCount;
      out.set(metric.masterId, current);
    }

    for (const value of out.values()) {
      value.profitRate = value.revenue > 0
        ? Math.round((value.netProfit / value.revenue) * 1000) / 10
        : 0;
    }

    return out;
  }

  private async reviewCountByMaster(
    organizationId: string,
    listingByMaster: ManagementFacts['listingByMaster'],
  ): Promise<Map<string, number>> {
    const listingEntries = [...listingByMaster.entries()];
    const listingIds = listingEntries.map(([, listing]) => listing.id);
    if (listingIds.length === 0) return new Map();
    const rows = await this.prisma.channelListingDailySnapshot.findMany({
      where: { organizationId, listingId: { in: listingIds } },
      orderBy: [{ listingId: 'asc' }, { businessDate: 'desc' }],
      select: { listingId: true, reviewCount: true },
    });
    const masterByListing = new Map(listingEntries.map(([masterId, listing]) => [listing.id, masterId]));
    const map = new Map<string, number>();
    for (const row of rows) {
      const masterId = masterByListing.get(row.listingId);
      if (!masterId || map.has(masterId)) continue;
      map.set(masterId, row.reviewCount ?? 0);
    }
    return map;
  }

  private async currentAdvertisingState(
    organizationId: string,
    masterIds?: string[],
  ): Promise<{ masterIds: Set<string> }> {
    const targetLatest = await this.prisma.channelAdTargetDailySnapshot.findFirst({
      where: { organizationId, targetType: 'product' },
      orderBy: { businessDate: 'desc' },
      select: { businessDate: true },
    });
    const listingLatest = await this.prisma.channelListingDailySnapshot.findFirst({
      where: {
        organizationId,
        OR: [
          { adSpend: { gt: 0 } },
          { adRevenue: { gt: 0 } },
          { adClicks: { gt: 0 } },
          { adImpressions: { gt: 0 } },
        ],
      },
      orderBy: { businessDate: 'desc' },
      select: { businessDate: true },
    });

    const listingIds = new Set<string>();
    const optionIds = new Set<string>();
    if (targetLatest) {
      const rows = await this.prisma.channelAdTargetDailySnapshot.findMany({
        where: {
          organizationId,
          targetType: 'product',
          businessDate: targetLatest.businessDate,
        },
        select: {
          listingId: true,
          optionId: true,
          onOff: true,
          status: true,
          spend: true,
          adSpend: true,
          revenue: true,
          adRevenue: true,
          clicks: true,
          impressions: true,
        },
      });
      for (const row of rows) {
        if (!isActiveAdTarget(row)) continue;
        if (row.listingId) listingIds.add(row.listingId);
        if (row.optionId) optionIds.add(row.optionId);
      }
    }
    if (listingLatest) {
      const rows = await this.prisma.channelListingDailySnapshot.findMany({
        where: {
          organizationId,
          businessDate: listingLatest.businessDate,
          OR: [
            { adSpend: { gt: 0 } },
            { adRevenue: { gt: 0 } },
            { adClicks: { gt: 0 } },
            { adImpressions: { gt: 0 } },
          ],
        },
        select: { listingId: true },
      });
      rows.forEach((row) => listingIds.add(row.listingId));
    }

    const masterSet = new Set<string>();
    if (listingIds.size > 0) {
      const listings = await this.prisma.channelListing.findMany({
        where: {
          organizationId,
          id: { in: [...listingIds] },
          isDeleted: false,
          ...(masterIds ? { masterId: { in: masterIds } } : {}),
        },
        select: { masterId: true },
      });
      listings.forEach((listing) => masterSet.add(listing.masterId));
    }
    if (optionIds.size > 0) {
      const options = await this.prisma.productOption.findMany({
        where: {
          organizationId,
          id: { in: [...optionIds] },
          isDeleted: false,
          ...(masterIds ? { masterId: { in: masterIds } } : {}),
        },
        select: { masterId: true },
      });
      options.forEach((option) => masterSet.add(option.masterId));
    }
    return { masterIds: masterSet };
  }
}
