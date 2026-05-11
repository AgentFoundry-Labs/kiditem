import { Injectable } from '@nestjs/common';
import type { ProductManagementListItem } from '@kiditem/shared/product';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPerListingMetrics } from '../../../common/per-listing-profit';
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
  type ManagementFacts,
  type MetricSums,
} from './product-management.read-model';

@Injectable()
export class ProductManagementFactsService {
  constructor(private readonly prisma: PrismaService) {}

  async managementFacts(
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

  async allMasterIds(organizationId: string): Promise<string[]> {
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

  async channelLinkedMasterIds(organizationId: string, masterIds: string[]): Promise<Set<string>> {
    if (masterIds.length === 0) return new Set();
    const rows = await this.prisma.channelListing.findMany({
      where: { organizationId, masterId: { in: masterIds }, isDeleted: false },
      select: { masterId: true },
    });
    return new Set(rows.map((row) => row.masterId));
  }

  async stockByMaster(organizationId: string, masterIds?: string[]): Promise<Map<string, number>> {
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

  emptyInventory(): ManagementFacts['inventoryByMaster'] extends Map<string, infer T> ? T : never {
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

  async inventoryByMaster(
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

  async statusByMaster(
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

  async optionByMaster(organizationId: string, masterIds: string[]): Promise<ManagementFacts['optionByMaster']> {
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

  async listingByMaster(organizationId: string, masterIds: string[]): Promise<ManagementFacts['listingByMaster']> {
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

  async metricsByListing(
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

  metricsByMaster(
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
  async profitByMaster(
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

  async reviewCountByMaster(
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

  async currentAdvertisingState(
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
