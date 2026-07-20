import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
  type WingTrafficAggregationRepositoryPort,
} from '../dashboard/application/port/out/repository/wing-traffic-aggregation.repository.port';
import { reconcileCollectedAdSpend } from '../dashboard/domain/util/collected-ad-profit';
import { pct1 } from '../dashboard/domain/util/percent';
import { classifySellpiaChannelGroup } from './domain/channel-group';
import { SELLPIA_SALES_COVERAGE_SELLER_ID } from './domain/snapshot-coverage';
import type { SellpiaSalesIngestBodyDto } from './dto/sellpia-sales.dto';
import type {
  SellpiaSalesSummary,
  SellpiaSalesGroup,
  SellpiaSalesMall,
  SellpiaSalesDailyPoint,
  SellpiaSalesIngestResult,
} from '@kiditem/shared/dashboard';

const INT4_MAX = 2_147_483_647;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INGEST_DAYS = 100;
const CREATE_MANY_CHUNK_SIZE = 1_000;
const MAX_CAPTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const INGEST_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * Sellpia 판매현황(sale_summary) 몰별·일별 매출 ingest + read.
 *
 * 확장이 order_search.ajax.html(mode=selldate, 주문일자 기준)에서 판매처(seller)별로
 * 스크랩한 결과를 `sellpia_sales_daily_snapshots` 에 요청 범위 단위로 원자 교체한다.
 * (organizationId, businessDate, sellerId) 유일성과 날짜별 coverage 행으로 재실행
 * 멱등성·0매출 수집 완료를 보장한다. 대시보드는 coverage 행을 제외하고
 * rocket(쿠팡-직배송) / others(쿠팡윙+기타몰) 버킷을 나눠 읽는다.
 *
 * analytics owner 의 ingest 예외 레인(traffic upload 와 동일 성격 — daily-fact 적재).
 * 멀티테넌트: 모든 읽기/쓰기가 organizationId 를 바인딩한다.
 */
@Injectable()
export class SellpiaSalesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT)
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryPort,
  ) {}

  async ingest(
    organizationId: string,
    body: SellpiaSalesIngestBodyDto,
  ): Promise<SellpiaSalesIngestResult> {
    const requestReceivedAt = new Date();
    if (body.sellers.length === 0 && !hasExplicitEmptyProvenance(body)) {
      throw new BadRequestException(
        '빈 판매현황은 원천 seller=all 응답의 명시적 빈 결과 증명이 필요합니다.',
      );
    }
    if (body.sellers.length > 0 && body.provenance) {
      throw new BadRequestException(
        '명시적 빈 결과 증명은 판매처가 없을 때만 사용할 수 있습니다.',
      );
    }
    if (!body.capturedAt) {
      throw new BadRequestException('capturedAt 수집 시각은 필수입니다.');
    }
    const capturedAt = new Date(body.capturedAt);
    if (
      Number.isNaN(capturedAt.getTime()) ||
      capturedAt.getTime() > requestReceivedAt.getTime() + MAX_CAPTURE_CLOCK_SKEW_MS
    ) {
      throw new BadRequestException('capturedAt이 유효한 수집 시각이 아닙니다.');
    }
    const range = parseIngestRange(body.range.from, body.range.to);
    const rowsByKey = new Map<string, Prisma.SellpiaSalesDailySnapshotCreateManyInput>();

    for (const seller of body.sellers) {
      if (seller.days.length === 0) {
        throw new BadRequestException(
          `판매처 ${seller.sellerId}의 일자별 매출이 비어 있습니다.`,
        );
      }
      if (seller.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID) {
        throw new BadRequestException('예약된 판매처 ID는 사용할 수 없습니다.');
      }
      const channelGroup = classifySellpiaChannelGroup(seller.sellerName);
      for (const day of seller.days) {
        const businessDate = parseCalendarDate(day.date);
        if (!businessDate) {
          throw new BadRequestException(`유효하지 않은 매출 일자입니다: ${day.date}`);
        }
        if (businessDate < range.from || businessDate > range.to) {
          throw new BadRequestException(
            `매출 일자 ${day.date}가 요청 범위 ${body.range.from}~${body.range.to} 밖에 있습니다.`,
          );
        }
        rowsByKey.set(`${seller.sellerId}\u0000${day.date}`, {
          organizationId,
          businessDate,
          sellerId: seller.sellerId,
          sellerName: seller.sellerName,
          channelGroup,
          revenueKrw: clampKrw(day.price),
          qty: clampKrw(day.amount),
          costKrw: clampKrw(day.buyPrice),
          capturedAt,
        });
      }
    }

    const salesRows = [...rowsByKey.values()];
    const coverageRows: Prisma.SellpiaSalesDailySnapshotCreateManyInput[] =
      range.businessDates.map((date) => ({
        organizationId,
        businessDate: parseCalendarDate(date)!,
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        sellerName: 'KidItem 수집 완료',
        channelGroup: 'others',
        revenueKrw: 0,
        qty: 0,
        costKrw: 0,
        capturedAt,
      }));

    // Sellpia `seller=all` 응답은 요청 범위의 권위 스냅샷이다. 범위를 원자적으로
    // 교체해야 취소/정정으로 원천에서 사라진 행도 남지 않는다. 날짜별 0원 coverage
    // 행은 정상 0매출일과 미수집일을 구분하되 집계 read 에서는 제외한다.
    // 기존 N개 upsert 트랜잭션은 93일 payload에서 Prisma 기본 5초를 넘겼으므로,
    // delete 1회 + bounded createMany 로 DB round-trip 수를 제한한다.
    const writeResult = await this.prisma.$transaction(async (tx) => {
      // 자동 동기화와 모달 수동 동기화가 겹치거나 여러 탭에서 동시에 실행돼도
      // 같은 조직의 range replacement가 서로의 delete/insert 사이에 끼어들지 않게 한다.
      await tx.$queryRaw(
        Prisma.sql`
          SELECT 1::int AS locked
          FROM (
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`kiditem.sellpia-sales:${organizationId}`}, 0)
            )
          ) AS acquired
        `,
      );
      const existingDates = await tx.sellpiaSalesDailySnapshot.groupBy({
        by: ['businessDate'],
        where: {
          organizationId,
          businessDate: { gte: range.from, lte: range.to },
        },
        _max: { capturedAt: true },
      });
      const existingCoverage = await tx.sellpiaSalesDailySnapshot.findMany({
        where: {
          organizationId,
          sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
          businessDate: { gte: range.from, lte: range.to },
        },
        select: { businessDate: true },
      });
      const coveredDateSet = new Set(
        existingCoverage.map((row) =>
          row.businessDate.toISOString().slice(0, 10),
        ),
      );
      const protectedDates = new Set(
        existingDates
          .filter((row) => row._max.capturedAt && row._max.capturedAt >= capturedAt)
          .map((row) => row.businessDate.toISOString().slice(0, 10)),
      );
      const replacementDates = range.businessDates.filter(
        (date) => !protectedDates.has(date),
      );
      if (replacementDates.length === 0) {
        return { upserted: 0, businessDates: [...coveredDateSet].sort() };
      }

      // payload 범위 중 일부 날짜만 더 최신이어도 그 날짜만 보존한다. 오래된 캐시가
      // 최신 날짜를 덮지 않으면서, 아직 coverage가 없는 과거 날짜는 함께 채울 수 있다.
      const replacementDateSet = new Set(replacementDates);
      const persistedRows = [...salesRows, ...coverageRows].filter((row) =>
        replacementDateSet.has(toBusinessDateKey(row.businessDate)),
      );
      await tx.sellpiaSalesDailySnapshot.deleteMany({
        where: {
          organizationId,
          businessDate: {
            in: replacementDates.map((date) => parseCalendarDate(date)!),
          },
        },
      });
      for (const chunk of chunksOf(persistedRows, CREATE_MANY_CHUNK_SIZE)) {
        await tx.sellpiaSalesDailySnapshot.createMany({ data: chunk });
      }
      for (const date of replacementDates) coveredDateSet.add(date);
      return {
        upserted: salesRows.filter((row) =>
          replacementDateSet.has(toBusinessDateKey(row.businessDate)),
        ).length,
        businessDates: [...coveredDateSet].sort(),
      };
    }, INGEST_TRANSACTION_OPTIONS);

    return {
      upserted: writeResult.upserted,
      businessDates: writeResult.businessDates,
      sellerCount: new Set(salesRows.map((row) => row.sellerId)).size,
    } satisfies SellpiaSalesIngestResult;
  }

  async getSummary(
    organizationId: string,
    from: string,
    to: string,
  ): Promise<SellpiaSalesSummary> {
    const [rows, coupangAds] = await Promise.all([
      this.prisma.sellpiaSalesDailySnapshot.findMany({
        where: {
          organizationId,
          businessDate: { gte: toUtcDate(from), lte: toUtcDate(to) },
        },
        select: {
          businessDate: true,
          sellerId: true,
          sellerName: true,
          channelGroup: true,
          revenueKrw: true,
          qty: true,
          costKrw: true,
          capturedAt: true,
        },
        orderBy: { businessDate: 'asc' },
      }),
      this.wingTrafficRepository.aggregateCoupangAds(
        organizationId,
        toKstInstant(from),
        toKstExclusiveEnd(to),
      ),
    ]);

    const coverageDates = new Set(
      rows
        .filter((r) => r.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID)
        .map((r) => r.businessDate.toISOString().slice(0, 10)),
    );
    // sentinel과 같은 트랜잭션으로 저장된 fact만 집계한다. 구버전의 sentinel 없는
    // 부분 fact가 월 전체 데이터처럼 섞이는 것을 막고, 다음 수집 때 정상 교체한다.
    const salesRows = rows.filter(
      (r) =>
        r.sellerId !== SELLPIA_SALES_COVERAGE_SELLER_ID &&
        coverageDates.has(r.businessDate.toISOString().slice(0, 10)),
    );
    const requiredCoverageDates = requiredCoverageDateKeys(from, to);
    const rocket = buildGroup(
      salesRows.filter((r) => r.channelGroup === 'rocket'),
      coverageDates,
    );
    const others = buildGroup(
      salesRows.filter((r) => r.channelGroup !== 'rocket'),
      coverageDates,
    );
    const verifiedRows = rows.filter(
      (row) =>
        row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID ||
        coverageDates.has(row.businessDate.toISOString().slice(0, 10)),
    );
    const lastCapturedAt = verifiedRows.reduce<Date | null>(
      (max, r) => (!max || r.capturedAt > max ? r.capturedAt : max),
      null,
    );
    const totalRevenue = rocket.revenue + others.revenue;
    const totalCost = rocket.cost + others.cost;
    const profit = reconcileCollectedAdSpend(
      {
        revenue: totalRevenue,
        adCost: 0,
        netProfit: totalRevenue - totalCost,
        profitRate: pct1(totalRevenue - totalCost, totalRevenue),
      },
      coupangAds,
    );

    return {
      range: { from, to },
      rocket,
      others,
      totalRevenue,
      totalCost,
      adCost: profit.adCost,
      netProfit: profit.netProfit,
      profitRate: profit.profitRate,
      lastCapturedAt: lastCapturedAt ? lastCapturedAt.toISOString() : null,
      // 홈 KPI는 마감된 날짜(어제까지)가 모두 수집됐을 때 이 합계로 교체한다.
      // 오늘 coverage가 있으면 당일 값도 포함하지만, 아직 없어도 모달의
      // "어제까지 준비" 계약과 월/주 KPI 판정이 어긋나지 않는다. 오늘 단일 조회는
      // 당일 coverage를 요구한다.
      hasData:
        requiredCoverageDates.length > 0 &&
        requiredCoverageDates.every((date) => coverageDates.has(date)),
    } satisfies SellpiaSalesSummary;
  }
}

function hasExplicitEmptyProvenance(body: SellpiaSalesIngestBodyDto): boolean {
  const provenance = body.provenance;
  return (
    provenance?.source === 'sellpia_sale_summary' &&
    provenance.mode === 'selldate' &&
    provenance.sellerScope === 'all' &&
    provenance.responseShape === 'empty_object' &&
    provenance.explicitEmpty === true
  );
}

function parseIngestRange(
  fromText: string,
  toText: string,
): { from: Date; to: Date; businessDates: string[] } {
  const from = parseCalendarDate(fromText);
  const to = parseCalendarDate(toText);
  if (!from || !to) {
    throw new BadRequestException('range.from과 range.to는 유효한 날짜여야 합니다.');
  }
  if (from > to) {
    throw new BadRequestException('range.from은 range.to보다 이후일 수 없습니다.');
  }
  const dayCount = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (dayCount > MAX_INGEST_DAYS) {
    throw new BadRequestException(`매출 수집 범위는 최대 ${MAX_INGEST_DAYS}일입니다.`);
  }
  return {
    from,
    to,
    businessDates: Array.from({ length: dayCount }, (_, index) =>
      new Date(from.getTime() + index * DAY_MS).toISOString().slice(0, 10),
    ),
  };
}

function requiredCoverageDateKeys(fromText: string, toText: string): string[] {
  const from = toUtcDate(fromText);
  const to = toUtcDate(toText);
  if (from > to) return [];
  const allDates = Array.from(
    { length: Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1 },
    (_, index) =>
      new Date(from.getTime() + index * DAY_MS).toISOString().slice(0, 10),
  );
  const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const closedDates = allDates.filter((date) => date < todayKst);
  if (closedDates.length > 0) return closedDates;
  // 오늘 단일/오늘부터 시작하는 조회는 아직 마감 전이어도 실제 당일 coverage가
  // 있어야 Sellpia 결과를 채택한다. 미래 날짜만 조회하면 hasData=false가 된다.
  return allDates.filter((date) => date === todayKst);
}

function chunksOf<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function toBusinessDateKey(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

interface SnapshotRow {
  businessDate: Date;
  sellerId: string;
  sellerName: string;
  channelGroup: string;
  revenueKrw: number;
  qty: number;
  costKrw: number;
}

function buildGroup(
  rows: SnapshotRow[],
  coverageDates: Iterable<string> = [],
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

  for (const date of coverageDates) {
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
      daily: toDailyPoints(m.daily),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    revenue,
    qty,
    cost,
    daily: toDailyPoints(dailyMap),
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
): SellpiaSalesDailyPoint[] {
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({ date, revenue: v.revenue, qty: v.qty }));
}

// 엄격 캘린더 파싱: YYYY-MM-DD 가 실제 존재하는 날짜일 때만 UTC-midnight Date 반환.
// 2026-06-31(→7/1 롤오버)·2026-13-01(→Invalid)·2026-02-30 등을 걸러 null 반환.
export function parseCalendarDate(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== isoDate) return null;
  return d;
}

// 읽기 경로용: 컨트롤러가 from/to 를 이미 검증하지만 방어적으로 엄격 파싱한다.
function toUtcDate(isoDate: string): Date {
  return parseCalendarDate(isoDate) ?? new Date(`${isoDate}T00:00:00.000Z`);
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

function clampKrw(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const v = Math.round(n);
  if (v <= 0) return 0;
  return v > INT4_MAX ? INT4_MAX : v;
}
