import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { kstDayStart } from '../common/kst';
import type { ReadinessCheck, ReadinessResponse } from '@kiditem/shared/readiness';

/**
 * Readiness check for system data freshness.
 *
 * Schema mapping (main 의 ChannelScrape* 계층):
 *  - wing 매출/대시보드 일별 → ChannelAccountDailyKpiSnapshot { source:'wing', kpiType:'wing_dashboard' }
 *  - 쿠팡 광고 일별 → ChannelAccountDailyKpiSnapshot { source:'coupang_ads', kpiType:'coupang_ads_daily' }
 *  - Wing 아이템위너 KPI → ChannelAccountDailyKpiSnapshot { source:'wing', kpiType:'wing_itemwinner_kpi' }
 *  - 상품 마스터 → MasterProduct
 *
 * `businessDate` 는 schema 에서 이미 KST date (DB Date 타입). +9h 변환 불필요.
 */
@Injectable()
export class ReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 데이터 수집 범위: 어제로부터 N 일 전까지 (KST).
   * 5월 초 같은 경우 직전달 마지막 주 backfill 까지 자연스럽게 포함되도록 14 일 lookback.
   * 필요 시 readiness 응답을 보고 짧게 줄여도 무방.
   */
  private static readonly LOOKBACK_DAYS = 14;

  async getStatus(organizationId: string): Promise<ReadinessResponse> {
    const now = new Date();
    // Wing/광고는 당일 데이터가 없고 전일이 최신 → 어제를 기준일로 잡음
    const todayKstStart = kstDayStart(now);
    const yesterdayKstStart = new Date(todayKstStart.getTime() - 86400000);
    const yesterdayKstStr = toKstDateStr(yesterdayKstStart);

    // lookback N 일 전 ~ 어제까지의 기대 일자
    const lookbackStart = new Date(
      yesterdayKstStart.getTime() - (ReadinessService.LOOKBACK_DAYS - 1) * 86400000,
    );
    const rangeStartKstStr = toKstDateStr(lookbackStart);
    const rangeStartDate = parseKstDate(rangeStartKstStr);
    const expectedDates = enumerateDates(rangeStartKstStr, yesterdayKstStr);

    const [
      wingDailyKpiRows,
      adsDailyKpiRows,
      wingItemWinnerKpi,
      productCount,
      lastProduct,
    ] = await Promise.all([
      // wing_sales / dashboard daily — Wing 매출 대시보드 일별 데이터
      this.prisma.channelAccountDailyKpiSnapshot.findMany({
        where: {
          organizationId,
          channel: 'coupang',
          source: 'wing',
          kpiType: 'wing_dashboard',
          businessDate: { gte: rangeStartDate, lte: yesterdayKstStart },
        },
        select: { businessDate: true, lastObservedAt: true },
        orderBy: { businessDate: 'desc' },
      }),
      // coupang_ads — 쿠팡 광고 일별 KPI
      this.prisma.channelAccountDailyKpiSnapshot.findMany({
        where: {
          organizationId,
          channel: 'coupang',
          source: 'coupang_ads',
          kpiType: 'coupang_ads_daily',
          businessDate: { gte: rangeStartDate, lte: yesterdayKstStart },
        },
        select: { businessDate: true, lastObservedAt: true },
        orderBy: { businessDate: 'desc' },
      }),
      // wing_itemwinner_kpi — 가장 최근 1건
      this.prisma.channelAccountDailyKpiSnapshot.findFirst({
        where: {
          organizationId,
          channel: 'coupang',
          source: 'wing',
          kpiType: 'wing_itemwinner_kpi',
        },
        orderBy: { lastObservedAt: 'desc' },
        select: { lastObservedAt: true, businessDate: true },
      }),
      this.prisma.masterProduct.count({ where: { organizationId, isDeleted: false } }),
      this.prisma.masterProduct.findFirst({
        where: { organizationId, isDeleted: false },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);

    // wing 일별 수집 — businessDate 가 schema 에서 이미 KST date 이므로 그대로 사용
    const wingPresent = new Set(wingDailyKpiRows.map((r) => toKstDateStr(r.businessDate)));
    const wingMissing = expectedDates.filter((d) => !wingPresent.has(d));
    const wingYesterdayOk = wingPresent.has(yesterdayKstStr);
    const wingLastDate = wingDailyKpiRows[0]?.lastObservedAt ?? null;

    // coupang_ads 일별 수집
    const adsPresent = new Set(adsDailyKpiRows.map((r) => toKstDateStr(r.businessDate)));
    const adsMissing = expectedDates.filter((d) => !adsPresent.has(d));
    const adsYesterdayOk = adsPresent.has(yesterdayKstStr);
    const adsLastDate = adsDailyKpiRows[0]?.lastObservedAt ?? null;

    const wingBase = 'https://wing.coupang.com/tenants/business-insight/sales-analysis';
    const adsDashboardUrl = 'https://advertising.coupang.com/marketing/dashboard/sales';
    const wingItemWinnerUrl = 'https://wing.coupang.com/tenants/seller-price-management?rf=menu';

    const checks: ReadinessCheck[] = [
      {
        key: 'wing_sales',
        label: '쿠팡 Wing 데이터 수집',
        status: wingMissing.length === 0 ? 'ok' : wingYesterdayOk ? 'stale' : 'missing',
        detail:
          wingMissing.length === 0
            ? `최근 ${expectedDates.length}일치 (${rangeStartKstStr}~${yesterdayKstStr}) 모두 수집됨`
            : !wingYesterdayOk
              ? `최신(${yesterdayKstStr}) 미수집 — 누락 ${wingMissing.length}/${expectedDates.length}일`
              : `누락 ${wingMissing.length}/${expectedDates.length}일 (${rangeStartKstStr}~${yesterdayKstStr})`,
        lastSyncedAt: wingLastDate ? wingLastDate.toISOString() : null,
        count: wingPresent.size,
        collector: 'extension',
        collectEndpoint: null,
        // 누락된 날짜만 골라 일별 URL 생성. 누락 없으면 어제 한 번 더 수집.
        // #kiditemBatch=1 마커 → wing-unified.js 가 paginate:true + 완료 후 자가 종료
        scrapeUrls:
          wingMissing.length > 0
            ? wingMissing.map(
                (d) => `${wingBase}?start_date=${d}&end_date=${d}#kiditemBatch=1`,
              )
            : [
                `${wingBase}?start_date=${yesterdayKstStr}&end_date=${yesterdayKstStr}#kiditemBatch=1`,
              ],
        referenceDate: yesterdayKstStr,
        expectedDates,
        missingDates: wingMissing,
      },
      {
        key: 'coupang_ads',
        label: '쿠팡 광고 데이터 수집',
        status: adsMissing.length === 0 ? 'ok' : adsYesterdayOk ? 'stale' : 'missing',
        detail:
          adsMissing.length === 0
            ? `최근 ${expectedDates.length}일치 (${rangeStartKstStr}~${yesterdayKstStr}) 모두 수집됨`
            : !adsYesterdayOk
              ? `최신(${yesterdayKstStr}) 미수집 — 누락 ${adsMissing.length}/${expectedDates.length}일`
              : `누락 ${adsMissing.length}/${expectedDates.length}일 (${rangeStartKstStr}~${yesterdayKstStr})`,
        lastSyncedAt: adsLastDate ? adsLastDate.toISOString() : null,
        count: adsPresent.size,
        collector: 'extension',
        collectEndpoint: null,
        // 누락 일자별로 해시 파라미터 포함. ads-report.js가 해시를 읽어 날짜 피커를 해당 일자로 설정 후 스크랩.
        scrapeUrls:
          adsMissing.length > 0
            ? adsMissing.map((d) => `${adsDashboardUrl}#targetDate=${d}`)
            : [`${adsDashboardUrl}#targetDate=${yesterdayKstStr}`],
        referenceDate: yesterdayKstStr,
        expectedDates,
        missingDates: adsMissing,
      },
      {
        key: 'coupang_products',
        label: '쿠팡 상품 데이터 수집',
        status: productCount > 0 ? 'ok' : 'missing',
        detail:
          productCount > 0 ? `상품 ${productCount}건 수집됨` : '상품 데이터 없음 — 최초 수집 필요',
        lastSyncedAt: lastProduct?.updatedAt.toISOString() ?? null,
        count: productCount,
        collector: 'extension',
        collectEndpoint: null,
        scrapeUrls: [
          `https://wing.coupang.com/vendor-inventory/list?salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1&start_date=${yesterdayKstStr}&end_date=${yesterdayKstStr}`,
        ],
        referenceDate: yesterdayKstStr,
        expectedDates: null,
        missingDates: null,
      },
      {
        key: 'wing_kpi',
        label: 'Wing 아이템위너 KPI',
        status: wingItemWinnerKpi
          ? isSameKstDay(wingItemWinnerKpi.lastObservedAt, yesterdayKstStart)
            ? 'ok'
            : wingItemWinnerKpi.lastObservedAt >= yesterdayKstStart
              ? 'ok'
              : 'stale'
          : 'missing',
        detail: wingItemWinnerKpi
          ? `최종 수집: ${formatKst(wingItemWinnerKpi.lastObservedAt)}`
          : 'Wing KPI 수집 이력 없음',
        lastSyncedAt: wingItemWinnerKpi?.lastObservedAt.toISOString() ?? null,
        count: null,
        collector: 'extension',
        collectEndpoint: null,
        scrapeUrls: [`${wingItemWinnerUrl}#kiditemBatch=1`],
        referenceDate: yesterdayKstStr,
        expectedDates: null,
        missingDates: null,
      },
    ];

    return {
      checks,
      allOk: checks.every((c) => c.status === 'ok'),
    };
  }
}

/** Date → KST YYYY-MM-DD */
function toKstDateStr(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** YYYY-MM-DD (KST) → UTC Date 객체 (KST 자정의 UTC instant) */
function parseKstDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

function enumerateDates(startYmd: string, endYmd: string): string[] {
  const start = parseKstDate(startYmd);
  const end = parseKstDate(endYmd);
  const out: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    out.push(toKstDateStr(new Date(t)));
  }
  return out;
}

function isSameKstDay(a: Date, b: Date): boolean {
  return kstDayStart(a).getTime() === kstDayStart(b).getTime();
}

function formatKst(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().replace('T', ' ').slice(0, 16);
}
