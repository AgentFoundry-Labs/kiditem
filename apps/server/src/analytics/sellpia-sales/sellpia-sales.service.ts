import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
  type CoupangAdsDailyRow,
  type WingTrafficAggregationRepositoryPort,
} from '../application/port/out/repository/dashboard/wing-traffic-aggregation.repository.port';
import { measuredPercent1 } from '../domain/dashboard/util/percent';
import {
  COUPANG_ADS_SOURCE,
  SELLPIA_SALES_SOURCE,
  type DashboardSourceName,
} from '../domain/dashboard/evidence';
import { PrismaService } from '../../prisma/prisma.service';
import {
  readSellpiaSalesDailyFacts,
  type SellpiaSalesDailyFact,
} from './read/sellpia-sales-daily-facts';
import {
  buildPeriodBasis,
  intersectBases,
  narrowToDate,
} from '@kiditem/shared/dashboard';
import type {
  DashboardMetricBasisMap,
  DashboardPeriodBasis,
  DashboardProfitInputs,
  SellpiaSalesSummary,
  SellpiaSalesGroup,
  SellpiaSalesMall,
  SellpiaSalesDailyPoint,
} from '@kiditem/shared/dashboard';
import {
  addDays,
  businessDateKey,
  closedMonthRangeFromCutoff,
  datesInclusive,
  evidenceCutoffDate,
  kstDayStart,
  parseBusinessDate,
} from '../../common/kst';
import { isCoupangSeller } from './domain/channel-group';

/**
 * Sellpia 판매현황(sale_summary) read model.
 *
 * Collection is the operation kind `analytics.sellpia_sales` (KID-361); its finish
 * transaction writes the daily snapshots. This service reads those published facts and combines them
 * with the existing Coupang advertising cost projection for the dashboard.
 */
@Injectable()
export class SellpiaSalesService {
  private readonly logger = new Logger(SellpiaSalesService.name);

  constructor(
    @Inject(WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT)
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryPort,
    private readonly prisma: PrismaService,
  ) {}

  async getClosedMonthSummary(
    organizationId: string,
  ): Promise<SellpiaSalesSummary> {
    const knownThrough = businessDateKey(evidenceCutoffDate());
    const range = closedMonthRangeFromCutoff(knownThrough);
    if (range) {
      return this.getSummary(organizationId, range.from, range.to, knownThrough);
    }
    return emptySellpiaSalesSummary(knownThrough);
  }

  async getSummary(
    organizationId: string,
    from: string,
    to: string,
    knownThrough = businessDateKey(evidenceCutoffDate()),
  ): Promise<SellpiaSalesSummary> {
    const fromInstant = toKstInstant(from);
    const toExclusive = toKstExclusiveEnd(to);
    const selectedDates = selectedDateKeys(from, to);
    const [sellpiaRead, dailyAdsRead] = await Promise.all([
      this.prisma.$transaction((tx) => readSellpiaSalesDailyFacts(tx, {
        organizationId,
        from,
        to,
      })),
      // Use the existing bounded daily Ads reader to determine the exact
      // advertising dates entering profit. This is not a per-day provider loop.
      this.readDailyAds(
        organizationId,
        fromInstant,
        toExclusive,
      ),
    ]);

    const coverageDates = new Set(sellpiaRead.coverage.includedDates);
    const salesRows = sellpiaRead.facts;
    const normalizedAds = normalizeDailyAds(dailyAdsRead.rows, new Set(selectedDates));
    const adDates = normalizedAds.validDates;
    const sellpiaBasis = buildPeriodBasis({
      from,
      to,
      includedDates: coverageDates,
      invalidDates: sellpiaRead.coverage.invalidDates,
      sources: [SELLPIA_SALES_SOURCE],
    });
    const totalRevenue = salesRows.reduce((sum, row) => sum + row.revenueKrw, 0);
    const rocket = buildGroup(
      salesRows.filter((r) => r.channelGroup === 'rocket'),
      totalRevenue,
      coverageDates,
      sellpiaBasis,
    );
    const others = buildGroup(
      salesRows.filter((r) => r.channelGroup !== 'rocket'),
      totalRevenue,
      coverageDates,
      sellpiaBasis,
    );
    // 쿠팡에서 판 것 전부(로켓 + 윙). 윙이 others 에 섞여 있어 버킷만으로는 '쿠팡 매출'이
    // 안 나온다. 화면이 판매처 이름으로 합치지 않게 여기서 묶어 낸다.
    const coupang = buildGroup(
      salesRows.filter((r) => isCoupangSeller(r.sellerName)),
      totalRevenue,
      coverageDates,
      sellpiaBasis,
    );
    // 전체. 날마다의 총 매출 선을 화면이 몰들을 더해 만들지 않게 그대로 낸다.
    const total = buildGroup(salesRows, totalRevenue, coverageDates, sellpiaBasis);
    // 그 나머지. 둘을 쌓으면 전체 매출이다 — 화면이 전체에서 쿠팡을 빼서 만들지 않게 낸다.
    const nonCoupang = buildGroup(
      salesRows.filter((r) => !isCoupangSeller(r.sellerName)),
      totalRevenue,
      coverageDates,
      sellpiaBasis,
    );
    const dailySales = aggregateSalesByDate(salesRows, coverageDates);
    // A failed ad read is named as a failed source. With no usable ad date the
    // intersection below has no included date, and the derived status is
    // `unverified` — the read failure no longer has to be asserted by hand.
    const adsQueryFailedSources: DashboardSourceName[] = dailyAdsRead.failed
      ? [COUPANG_ADS_SOURCE]
      : [];
    const adsBasis = buildPeriodBasis({
      from,
      to,
      includedDates: adDates,
      invalidDates: normalizedAds.invalidDates,
      sources: [COUPANG_ADS_SOURCE],
      queryFailedSources: adsQueryFailedSources,
    });
    // Revenue, cost and advertising entering profit use identical dates.
    const profitBasis = intersectBases(sellpiaBasis, adsBasis);
    const profitDates = profitBasis.includedDates;
    const profitInputs = buildProfitInputs(
      profitDates,
      dailySales,
      normalizedAds.byDate,
      profitBasis,
    );
    const totalCost = rocket.cost + others.cost;
    const adCost = profitInputs?.adCost ?? null;
    const netProfit = profitInputs
      ? Math.round(profitInputs.revenue - profitInputs.cost - profitInputs.adCost)
      : null;
    const profitRate = profitInputs
      ? measuredPercent1(netProfit, profitInputs.revenue)
      : null;

    const base = {
      knownThrough,
      range: { from, to },
      rocket,
      others,
      total,
      coupang,
      nonCoupang,
      totalRevenue,
      totalCost,
      adCost,
      netProfit,
      profitRate,
      lastCapturedAt: sellpiaRead.latestCapturedAt
        ? sellpiaRead.latestCapturedAt.toISOString()
        : null,
      // A non-empty valid Sellpia subset is usable data. Completeness is
      // represented by metricBasis rather than by turning the whole card off.
      hasData: coverageDates.size > 0,
    } satisfies SellpiaSalesSummary;
    return {
      ...base,
      profitInputs,
      metricBasis: buildMetricBasis({
        sellpiaBasis,
        profitBasis,
      }),
    };
  }

  private async readDailyAds(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<DailyAdsReadResult> {
    try {
      return {
        rows: await this.wingTrafficRepository.fetchDailyAds(
          organizationId,
          from,
          to,
        ),
        failed: false,
      };
    } catch (error) {
      this.logger.error(
        'Failed to read Coupang Ads daily facts; profit metrics unavailable',
        error instanceof Error ? error.stack : undefined,
      );
      return { rows: [], failed: true };
    }
  }
}

function emptySellpiaSalesSummary(knownThrough: string): SellpiaSalesSummary {
  const emptyGroup: SellpiaSalesGroup = {
    revenue: 0,
    qty: 0,
    cost: 0,
    revenueShare: null,
    daily: [],
    malls: [],
  };
  return {
    knownThrough,
    range: null,
    rocket: emptyGroup,
    others: { ...emptyGroup },
    total: { ...emptyGroup },
    coupang: { ...emptyGroup },
    nonCoupang: { ...emptyGroup },
    totalRevenue: 0,
    totalCost: 0,
    adCost: null,
    netProfit: null,
    profitRate: null,
    lastCapturedAt: null,
    hasData: false,
    profitInputs: null,
  };
}

/**
 * A revenue share as a whole percent, published so no screen divides; `null`
 * when the denominator is not a positive finite number.
 */
function revenueSharePercent(revenue: number, denominator: number): number | null {
  if (!Number.isFinite(revenue) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((revenue / denominator) * 100);
}

function buildGroup(
  rows: SnapshotRow[],
  totalRevenue: number,
  coverageDates: Iterable<string> = [],
  basis?: DashboardPeriodBasis,
): SellpiaSalesGroup {
  let revenue = 0;
  let qty = 0;
  let cost = 0;
  const dailyMap = new Map<string, { revenue: number; qty: number }>();
  const mallMap = new Map<
    string,
    {
      sellerId: string;
      sellerName: string;
      revenue: number;
      qty: number;
      cost: number;
      daily: Map<string, { revenue: number; qty: number }>;
    }
  >();

  const coverageDateList = [...coverageDates];
  // A global all-seller coverage sentinel proves the requested date was
  // checked for every seller. It therefore authorizes a zero point for a
  // seller already known in this group when that seller has no fact on the
  // confirmed date. Dates without that proof are intentionally absent.
  for (const date of coverageDateList) {
    dailyMap.set(date, { revenue: 0, qty: 0 });
  }

  for (const r of rows) {
    const dateKey = businessDateKey(r.businessDate);
    revenue += r.revenueKrw;
    qty += r.qty;
    cost += r.costKrw;

    accumulate(dailyMap, dateKey, r.revenueKrw, r.qty);

    let mall = mallMap.get(r.sellerId);
    if (!mall) {
      mall = {
        sellerId: r.sellerId,
        sellerName: r.sellerName,
        revenue: 0,
        qty: 0,
        cost: 0,
        daily: new Map(),
      };
      // The mall is known from another published day in this group. Since
      // coverageDateList contains only global all-seller-confirmed dates,
      // missing facts here are measured zeroes rather than absent days.
      for (const date of coverageDateList) {
        mall.daily.set(date, { revenue: 0, qty: 0 });
      }
      mallMap.set(r.sellerId, mall);
    }
    mall.sellerName = r.sellerName; // 최신 스냅샷 라벨 우선
    mall.revenue += r.revenueKrw;
    mall.qty += r.qty;
    mall.cost += r.costKrw;
    accumulate(mall.daily, dateKey, r.revenueKrw, r.qty);
  }

  const malls: SellpiaSalesMall[] = [...mallMap.values()]
    .map((m) => ({
      sellerId: m.sellerId,
      sellerName: m.sellerName,
      revenue: m.revenue,
      qty: m.qty,
      cost: m.cost,
      revenueShare: revenueSharePercent(m.revenue, revenue),
      daily: toDailyPoints(m.daily, m.revenue, basis),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    revenue,
    qty,
    cost,
    revenueShare: revenueSharePercent(revenue, totalRevenue),
    daily: toDailyPoints(dailyMap, revenue, basis),
    malls,
  } satisfies SellpiaSalesGroup;
}

function accumulate(
  map: Map<string, { revenue: number; qty: number }>,
  dateKey: string,
  revenue: number,
  qty: number,
): void {
  const entry = map.get(dateKey) ?? { revenue: 0, qty: 0 };
  entry.revenue += revenue;
  entry.qty += qty;
  map.set(dateKey, entry);
}

/** Daily points of one series, each with its share of `seriesRevenue`. */
function toDailyPoints(
  map: Map<string, { revenue: number; qty: number }>,
  seriesRevenue: number,
  basis?: DashboardPeriodBasis,
): SellpiaSalesDailyPoint[] {
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({
      date,
      revenue: v.revenue,
      qty: v.qty,
      revenueShare: revenueSharePercent(v.revenue, seriesRevenue),
      ...(basis
        ? {
            metricBasis: {
              revenue: narrowToDate(basis, date),
              qty: narrowToDate(basis, date),
            },
          }
        : {}),
    }));
}

// 엄격 캘린더 파싱: YYYY-MM-DD 가 실제 존재하는 날짜일 때만 UTC-midnight Date 반환.
// 2026-06-31(→7/1 롤오버)·2026-13-01(→Invalid)·2026-02-30 등을 걸러 null 반환.
export function parseCalendarDate(isoDate: string): Date | null {
  return parseBusinessDate(isoDate);
}

function toUtcDate(isoDate: string): Date {
  return parseCalendarDate(isoDate) ?? new Date(`${isoDate}T00:00:00.000Z`);
}

type SnapshotRow = SellpiaSalesDailyFact;

interface DailySalesTotals {
  revenue: number;
  cost: number;
  qty: number;
}

interface NormalizedDailyAds {
  validDates: Set<string>;
  invalidDates: Set<string>;
  byDate: Map<string, CoupangAdsDailyRow>;
}

interface DailyAdsReadResult {
  rows: CoupangAdsDailyRow[];
  failed: boolean;
}

function selectedDateKeys(from: string, to: string): string[] {
  const fromDate = parseCalendarDate(from);
  const toDate = parseCalendarDate(to);
  if (!fromDate || !toDate || fromDate > toDate) return [];
  return datesInclusive(fromDate, toDate).map(businessDateKey);
}

function normalizeDailyAds(
  rows: readonly CoupangAdsDailyRow[],
  selectedDates: Set<string>,
): NormalizedDailyAds {
  const byDate = new Map<string, CoupangAdsDailyRow>();
  const invalidDates = new Set<string>();
  for (const row of rows) {
    const date = validDateText(row.date);
    if (!date || !selectedDates.has(date)) continue;
    if (!Number.isFinite(row.ad_cost) || row.ad_cost < 0) {
      invalidDates.add(date);
      byDate.delete(date);
      continue;
    }
    if (invalidDates.has(date)) continue;
    byDate.set(date, { ...row, date });
  }
  return {
    validDates: new Set(byDate.keys()),
    invalidDates,
    byDate,
  };
}

function aggregateSalesByDate(
  rows: readonly SnapshotRow[],
  coverageDates: Iterable<string>,
): Map<string, DailySalesTotals> {
  const result = new Map<string, DailySalesTotals>();
  for (const date of coverageDates) result.set(date, { revenue: 0, cost: 0, qty: 0 });
  for (const row of rows) {
    const date = dateKey(row.businessDate);
    if (!date) continue;
    const current = result.get(date);
    if (!current) continue;
    current.revenue += row.revenueKrw;
    current.cost += row.costKrw;
    current.qty += row.qty;
  }
  return result;
}

function buildProfitInputs(
  dates: readonly string[],
  salesByDate: Map<string, DailySalesTotals>,
  adsByDate: Map<string, CoupangAdsDailyRow>,
  basis: DashboardPeriodBasis,
): DashboardProfitInputs | null {
  if (dates.length === 0) return null;
  const totals = dates.reduce<DailySalesTotals>(
    (sum, date) => {
      const sales = salesByDate.get(date);
      return {
        revenue: sum.revenue + (sales?.revenue ?? 0),
        cost: sum.cost + (sales?.cost ?? 0),
        qty: sum.qty + (sales?.qty ?? 0),
      };
    },
    { revenue: 0, cost: 0, qty: 0 },
  );
  const adCost = dates.reduce((sum, date) => sum + (adsByDate.get(date)?.ad_cost ?? 0), 0);
  if (
    !Number.isFinite(totals.revenue)
    || !Number.isFinite(totals.cost)
    || !Number.isFinite(totals.qty)
    || !Number.isFinite(adCost)
  ) return null;
  return { revenue: totals.revenue, cost: totals.cost, adCost, qty: totals.qty, basis };
}

function buildMetricBasis(args: {
  sellpiaBasis: DashboardPeriodBasis;
  profitBasis: DashboardPeriodBasis;
}): DashboardMetricBasisMap {
  const metricBasis: DashboardMetricBasisMap = {
    totalRevenue: args.sellpiaBasis,
    totalCost: args.sellpiaBasis,
    adCost: args.profitBasis,
    netProfit: args.profitBasis,
    profitRate: args.profitBasis,
    profitInputs: args.profitBasis,
    rocket: args.sellpiaBasis,
    'rocket.daily': args.sellpiaBasis,
    'rocket.malls': args.sellpiaBasis,
    others: args.sellpiaBasis,
    'others.daily': args.sellpiaBasis,
    'others.malls': args.sellpiaBasis,
    total: args.sellpiaBasis,
    'total.daily': args.sellpiaBasis,
    'total.malls': args.sellpiaBasis,
    coupang: args.sellpiaBasis,
    'coupang.daily': args.sellpiaBasis,
    'coupang.malls': args.sellpiaBasis,
    nonCoupang: args.sellpiaBasis,
    'nonCoupang.daily': args.sellpiaBasis,
    'nonCoupang.malls': args.sellpiaBasis,
  };
  return metricBasis;
}

function dateKey(value: Date): string | null {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  return businessDateKey(value);
}

function validDateText(value: string): string | null {
  const parsed = parseCalendarDate(value);
  return parsed ? businessDateKey(parsed) : null;
}

function toKstInstant(isoDate: string): Date {
  return kstDayStart(toUtcDate(isoDate));
}

function toKstExclusiveEnd(isoDate: string): Date {
  return kstDayStart(addDays(toUtcDate(isoDate), 1));
}
