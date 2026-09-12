import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
  type CoupangAdsDailyRow,
  type WingTrafficAggregationRepositoryPort,
} from '../dashboard/application/port/out/repository/wing-traffic-aggregation.repository.port';
import { measuredPercent1 } from '../dashboard/domain/util/percent';
import {
  COUPANG_ADS_SOURCE,
  SELLPIA_SALES_SOURCE,
  type DashboardSourceName,
} from '../dashboard/domain/evidence';
import { SELLPIA_SALES_COVERAGE_SELLER_ID } from './domain/snapshot-coverage';
import { SellpiaSalesSourceService } from './sellpia-sales-source.service';
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sellpia 판매현황(sale_summary) read model.
 *
 * Collection attempts and daily snapshots are owned by SellpiaSalesSourceService.
 * This service only reads the owner's published COMPLETE rows and combines them
 * with the existing Coupang advertising cost projection for the dashboard.
 */
@Injectable()
export class SellpiaSalesService {
  private readonly logger = new Logger(SellpiaSalesService.name);

  constructor(
    @Inject(WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT)
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryPort,
    private readonly publishedSource: SellpiaSalesSourceService,
  ) {}

  async getSummary(
    organizationId: string,
    from: string,
    to: string,
  ): Promise<SellpiaSalesSummary> {
    const fromInstant = toKstInstant(from);
    const toExclusive = toKstExclusiveEnd(to);
    const selectedDates = selectedDateKeys(from, to);
    const [rows, dailyAdsRead] = await Promise.all([
      this.publishedSource.readPublishedRows(organizationId, from, to),
      // Use the existing bounded daily Ads reader to determine the exact
      // advertising dates entering profit. This is not a per-day provider loop.
      this.readDailyAds(
        organizationId,
        fromInstant,
        toExclusive,
      ),
    ]);

    const normalizedSellpia = normalizeSellpiaRows(rows, new Set(selectedDates));
    const coverageDates = normalizedSellpia.validDates;
    // sentinel과 같은 트랜잭션으로 저장된 fact만 집계한다. 구버전의 sentinel 없는
    // 부분 fact가 월 전체 데이터처럼 섞이는 것을 막고, 다음 수집 때 정상 교체한다.
    const salesRows = normalizedSellpia.salesRows;
    const normalizedAds = normalizeDailyAds(dailyAdsRead.rows, new Set(selectedDates));
    const adDates = normalizedAds.validDates;
    const sellpiaBasis = buildPeriodBasis({
      from,
      to,
      includedDates: coverageDates,
      invalidDates: normalizedSellpia.invalidDates,
      sources: [SELLPIA_SALES_SOURCE],
    });
    const rocket = buildGroup(
      salesRows.filter((r) => r.channelGroup === 'rocket'),
      coverageDates,
      sellpiaBasis,
    );
    const others = buildGroup(
      salesRows.filter((r) => r.channelGroup !== 'rocket'),
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
    const totalRevenue = rocket.revenue + others.revenue;
    const totalCost = rocket.cost + others.cost;
    const adCost = profitInputs?.adCost ?? null;
    const netProfit = profitInputs
      ? Math.round(profitInputs.revenue - profitInputs.cost - profitInputs.adCost)
      : null;
    const profitRate = profitInputs
      ? measuredPercent1(netProfit, profitInputs.revenue)
      : null;

    const base = {
      range: { from, to },
      rocket,
      others,
      totalRevenue,
      totalCost,
      adCost,
      netProfit,
      profitRate,
      lastCapturedAt: normalizedSellpia.lastCapturedAt
        ? normalizedSellpia.lastCapturedAt.toISOString()
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

function buildGroup(
  rows: SnapshotRow[],
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
    const dateKey = r.businessDate.toISOString().slice(0, 10);
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
      daily: toDailyPoints(m.daily, basis),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    revenue,
    qty,
    cost,
    daily: toDailyPoints(dailyMap, basis),
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

function toDailyPoints(
  map: Map<string, { revenue: number; qty: number }>,
  basis?: DashboardPeriodBasis,
): SellpiaSalesDailyPoint[] {
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({
      date,
      revenue: v.revenue,
      qty: v.qty,
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== isoDate) return null;
  return d;
}

function toUtcDate(isoDate: string): Date {
  return parseCalendarDate(isoDate) ?? new Date(`${isoDate}T00:00:00.000Z`);
}

interface SnapshotRow {
  businessDate: Date;
  sellerId: string;
  sellerName: string;
  channelGroup: string;
  revenueKrw: number;
  qty: number;
  costKrw: number;
  capturedAt: Date;
}

interface DailySalesTotals {
  revenue: number;
  cost: number;
  qty: number;
}

interface NormalizedSellpiaRows {
  validDates: Set<string>;
  invalidDates: Set<string>;
  salesRows: SnapshotRow[];
  lastCapturedAt: Date | null;
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
  const dates: string[] = [];
  for (let date = fromDate; date <= toDate; date = new Date(date.getTime() + DAY_MS)) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

function normalizeSellpiaRows(
  rows: readonly SnapshotRow[],
  selectedDates: Set<string>,
): NormalizedSellpiaRows {
  const sentinelDates = new Set<string>();
  const invalidDates = new Set<string>();
  const invalidFactDates = new Set<string>();
  const validSalesRows: SnapshotRow[] = [];

  for (const row of rows) {
    const date = dateKey(row.businessDate);
    if (!date || !selectedDates.has(date)) continue;
    if (!isValidSnapshotRow(row)) {
      invalidDates.add(date);
      // Any malformed row makes the whole date unusable. In particular, a
      // malformed sentinel must not leave a valid duplicate sentinel able to
      // mark the date included while invalidDates reports the same date.
      invalidFactDates.add(date);
      continue;
    }
    if (row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID) {
      sentinelDates.add(date);
    } else {
      validSalesRows.push(row);
    }
  }

  const validDates = new Set(
    [...sentinelDates].filter((date) => !invalidFactDates.has(date)),
  );
  const salesRows = validSalesRows.filter((row) => {
    const date = dateKey(row.businessDate);
    return date !== null && validDates.has(date);
  });
  for (const date of invalidFactDates) validDates.delete(date);

  const lastCapturedAtByDate = new Map<string, Date>();
  for (const row of rows) {
    const date = dateKey(row.businessDate);
    if (!date || !validDates.has(date) || !isValidSnapshotRow(row)) continue;
    if (!(row.capturedAt instanceof Date) || !Number.isFinite(row.capturedAt.getTime())) continue;
    const current = lastCapturedAtByDate.get(date);
    if (!current || row.capturedAt > current) lastCapturedAtByDate.set(date, row.capturedAt);
  }
  const lastCapturedAt = [...lastCapturedAtByDate.values()].reduce<Date | null>(
    (max, value) => (!max || value > max ? value : max),
    null,
  );

  return { validDates, invalidDates, salesRows, lastCapturedAt };
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
  };
  return metricBasis;
}

function isValidSnapshotRow(row: SnapshotRow): boolean {
  const finiteNonnegativeValues = [row.revenueKrw, row.qty, row.costKrw].every(
    (value) => Number.isFinite(value) && value >= 0,
  );
  if (!finiteNonnegativeValues) return false;
  // The reserved all-seller row is evidence only; any non-zero payload is
  // malformed and must not turn into a coverage proof for a zero total.
  return row.sellerId !== SELLPIA_SALES_COVERAGE_SELLER_ID
    || (row.revenueKrw === 0 && row.qty === 0 && row.costKrw === 0);
}

function dateKey(value: Date): string | null {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function validDateText(value: string): string | null {
  return parseCalendarDate(value)?.toISOString().slice(0, 10) ?? null;
}

function toKstInstant(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000+09:00`);
}

function toKstExclusiveEnd(isoDate: string): Date {
  const nextDay = new Date(toUtcDate(isoDate).getTime() + DAY_MS)
    .toISOString()
    .slice(0, 10);
  return toKstInstant(nextDay);
}
