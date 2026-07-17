import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  SellpiaSalesSummary,
  SellpiaSalesGroup,
  SellpiaSalesMall,
  SellpiaSalesDailyPoint,
  SellpiaSalesIngestResult,
} from '@kiditem/shared/dashboard';
import { classifySellpiaChannelGroup } from './domain/channel-group';
import type { SellpiaSalesIngestBodyDto } from './dto/sellpia-sales.dto';

const INT4_MAX = 2_147_483_647;

/**
 * Sellpia 판매현황(sale_summary) 몰별·일별 매출 ingest + read.
 *
 * 확장이 order_search.ajax.html(mode=selldate, 주문일자 기준)에서 판매처(seller)별로
 * 스크랩한 결과를 `sellpia_sales_daily_snapshots` 에 (organizationId, businessDate,
 * sellerId) 기준으로 upsert(멱등, last-write-wins)한다. 대시보드는 channelGroup 으로
 * rocket(쿠팡-직배송) / others(쿠팡윙+기타몰) 버킷을 나눠 읽는다.
 *
 * analytics owner 의 ingest 예외 레인(traffic upload 와 동일 성격 — daily-fact 적재).
 * 멀티테넌트: 모든 읽기/쓰기가 organizationId 를 바인딩한다.
 */
@Injectable()
export class SellpiaSalesService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(
    organizationId: string,
    body: SellpiaSalesIngestBodyDto,
  ): Promise<SellpiaSalesIngestResult> {
    const capturedAt = new Date();
    const businessDates = new Set<string>();
    const rows = body.sellers.flatMap((seller) => {
      const channelGroup = classifySellpiaChannelGroup(seller.sellerName);
      return seller.days.flatMap((day) => {
        // 정규식만으로는 캘린더 무효 날짜(2026-06-31=7/1 롤오버, 2026-13-01=Invalid)가
        // 통과하므로 엄격 파싱 후 무효 날짜는 스킵한다(잘못된 버킷/부분 적재 방지).
        const businessDate = parseCalendarDate(day.date);
        if (!businessDate) return [];
        businessDates.add(day.date);
        return [
          {
            organizationId,
            businessDate,
            sellerId: seller.sellerId,
            sellerName: seller.sellerName,
            channelGroup,
            revenueKrw: clampKrw(day.price),
            qty: clampKrw(day.amount),
            costKrw: clampKrw(day.buyPrice),
            capturedAt,
          },
        ];
      });
    });

    // 요청 단위 원자성: 한 ingest 는 전부 반영되거나 전부 롤백된다(부분 적재 방지).
    // 실제 스크랩 페이로드는 수백 행 규모라 단일 트랜잭션으로 충분하다.
    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.sellpiaSalesDailySnapshot.upsert({
          where: {
            organizationId_businessDate_sellerId: {
              organizationId: r.organizationId,
              businessDate: r.businessDate,
              sellerId: r.sellerId,
            },
          },
          create: r,
          update: {
            sellerName: r.sellerName,
            channelGroup: r.channelGroup,
            revenueKrw: r.revenueKrw,
            qty: r.qty,
            costKrw: r.costKrw,
            capturedAt: r.capturedAt,
          },
        }),
      ),
    );

    return {
      upserted: rows.length,
      businessDates: [...businessDates].sort(),
      sellerCount: body.sellers.length,
    } satisfies SellpiaSalesIngestResult;
  }

  async getSummary(
    organizationId: string,
    from: string,
    to: string,
  ): Promise<SellpiaSalesSummary> {
    const rows = await this.prisma.sellpiaSalesDailySnapshot.findMany({
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
    });

    const rocket = buildGroup(rows.filter((r) => r.channelGroup === 'rocket'));
    const others = buildGroup(rows.filter((r) => r.channelGroup !== 'rocket'));
    const lastCapturedAt = rows.reduce<Date | null>(
      (max, r) => (!max || r.capturedAt > max ? r.capturedAt : max),
      null,
    );

    return {
      range: { from, to },
      rocket,
      others,
      totalRevenue: rocket.revenue + others.revenue,
      lastCapturedAt: lastCapturedAt ? lastCapturedAt.toISOString() : null,
      hasData: rows.length > 0,
    } satisfies SellpiaSalesSummary;
  }
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

function buildGroup(rows: SnapshotRow[]): SellpiaSalesGroup {
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

function clampKrw(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const v = Math.round(n);
  if (v <= 0) return 0;
  return v > INT4_MAX ? INT4_MAX : v;
}
