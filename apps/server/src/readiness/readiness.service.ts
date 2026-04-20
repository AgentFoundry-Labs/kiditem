import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { kstDayStart } from '../common/kst';
import type { ReadinessCheck, ReadinessResponse } from '@kiditem/shared';

@Injectable()
export class ReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(companyId: string): Promise<ReadinessResponse> {
    const now = new Date();
    // Wing/광고는 당일 데이터가 없고 전일이 최신 → 어제를 기준일로 잡음
    const todayKstStart = kstDayStart(now);
    const yesterdayKstStart = new Date(todayKstStart.getTime() - 86400000);
    const yesterdayKstStr = toKstDateStr(yesterdayKstStart);

    // 이번달 1일 (KST) ~ 어제까지의 기대 일자
    const yKst = new Date(yesterdayKstStart.getTime() + 9 * 3600 * 1000);
    const monthStartKstStr = `${yKst.getUTCFullYear()}-${String(yKst.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const monthStartDate = parseKstDate(monthStartKstStr);
    const expectedDates = enumerateDates(monthStartKstStr, yesterdayKstStr);

    const [
      trafficRows,
      wingDashboardSnapshots,
      adsDashboardSnapshots,
      wingSnapshot,
      productCount,
      lastProduct,
    ] = await Promise.all([
      this.prisma.trafficStats.findMany({
        where: {
          product: { companyId },
          date: { gte: monthStartDate, lte: yesterdayKstStart },
        },
        select: { date: true },
        distinct: ['date'],
        orderBy: { date: 'desc' },
      }),
      // Wing 대시보드 스크래핑 이력 — 상품 미연동이어도 이 스냅샷은 기록됨 (ad-sync.handleTraffic)
      // capturedAt 상한은 두지 않음: 어제치를 오늘 스크랩해도 capturedAt은 오늘이라 상한으로 자르면 누락됨.
      this.prisma.adSnapshot.findMany({
        where: {
          companyId,
          source: 'wing',
          pageType: 'dashboard_kpi',
          capturedAt: { gte: monthStartDate },
        },
        select: { capturedAt: true, rawJson: true },
        orderBy: { capturedAt: 'desc' },
      }),
      // 쿠팡 광고: 익스텐션은 Ad 테이블이 아니라 AdSnapshot(source='advertising')에 씀
      // date 컬럼이 "데이터가 실제로 다룬 날짜" (payload.dateFrom 기준). 레거시 행(date=today)도 포함되도록 capturedAt도 함께 조회.
      this.prisma.adSnapshot.findMany({
        where: {
          companyId,
          source: 'advertising',
          OR: [
            { date: { gte: monthStartDate } },
            { capturedAt: { gte: monthStartDate } },
          ],
        },
        select: { capturedAt: true, date: true },
        orderBy: { capturedAt: 'desc' },
      }),
      this.prisma.adSnapshot.findFirst({
        where: { companyId, source: 'wing', pageType: 'itemwinner_kpi' },
        orderBy: { capturedAt: 'desc' },
        select: { capturedAt: true },
      }),
      this.prisma.product.count({ where: { companyId } }),
      this.prisma.product.findFirst({
        where: { companyId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);

    // wing_sales 수집일: trafficStats.date (일별) 우선, 없으면 dashboard_kpi 스냅샷의 rawJson.startDate 또는 capturedAt KST일
    const wingPresent = new Set(trafficRows.map((t) => toKstDateStr(t.date)));
    for (const snap of wingDashboardSnapshots) {
      const raw = snap.rawJson as { startDate?: string; endDate?: string } | null;
      // rawJson의 startDate가 해당 스크랩이 다룬 데이터 날짜. 없으면 capturedAt 기준.
      const ymd = raw?.startDate?.slice(0, 10) || toKstDateStr(snap.capturedAt);
      if (ymd >= monthStartKstStr && ymd <= yesterdayKstStr) wingPresent.add(ymd);
    }
    const wingMissing = expectedDates.filter((d) => !wingPresent.has(d));
    const wingYesterdayOk = wingPresent.has(yesterdayKstStr);
    const wingLastDate =
      trafficRows[0]?.date ?? wingDashboardSnapshots[0]?.capturedAt ?? null;

    // coupang_ads: handleAdCampaign이 payload.dateFrom을 date 컬럼에 저장.
    // date가 있으면 그 날짜로, 없으면 레거시 로직(capturedAt의 전일)로 폴백.
    const adsPresent = new Set<string>();
    for (const s of adsDashboardSnapshots) {
      let ymd: string | null = null;
      if (s.date) {
        ymd = toKstDateStr(s.date);
      } else {
        const capturedKstDay = toKstDateStr(s.capturedAt);
        ymd = toKstDateStr(new Date(parseKstDate(capturedKstDay).getTime() - 86400000));
      }
      if (ymd >= monthStartKstStr && ymd <= yesterdayKstStr) adsPresent.add(ymd);
    }
    const adsMissing = expectedDates.filter((d) => !adsPresent.has(d));
    const adsYesterdayOk = adsPresent.has(yesterdayKstStr);
    const adsLastDate = adsDashboardSnapshots[0]?.capturedAt ?? null;

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
            ? `이번달 ${expectedDates.length}일치 모두 수집됨`
            : !wingYesterdayOk
              ? `최신(${yesterdayKstStr}) 미수집 — 누락 ${wingMissing.length}/${expectedDates.length}일`
              : `누락 ${wingMissing.length}/${expectedDates.length}일`,
        lastSyncedAt: wingLastDate ? wingLastDate.toISOString() : null,
        count: wingPresent.size,
        collector: 'extension',
        collectEndpoint: null,
        // 누락된 날짜만 골라 일별 URL 생성. 누락 없으면 어제 한 번 더 수집
        scrapeUrls:
          wingMissing.length > 0
            ? wingMissing.map((d) => `${wingBase}?start_date=${d}&end_date=${d}`)
            : [`${wingBase}?start_date=${yesterdayKstStr}&end_date=${yesterdayKstStr}`],
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
            ? `이번달 ${expectedDates.length}일치 모두 수집됨`
            : !adsYesterdayOk
              ? `최신(${yesterdayKstStr}) 미수집 — 누락 ${adsMissing.length}/${expectedDates.length}일`
              : `누락 ${adsMissing.length}/${expectedDates.length}일`,
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
        status: wingSnapshot
          ? isSameKstDay(wingSnapshot.capturedAt, yesterdayKstStart)
            ? 'ok'
            : wingSnapshot.capturedAt >= yesterdayKstStart
              ? 'ok'
              : 'stale'
          : 'missing',
        detail: wingSnapshot
          ? `최종 수집: ${formatKst(wingSnapshot.capturedAt)}`
          : 'Wing KPI 수집 이력 없음',
        lastSyncedAt: wingSnapshot?.capturedAt.toISOString() ?? null,
        count: null,
        collector: 'extension',
        collectEndpoint: null,
        scrapeUrls: [wingItemWinnerUrl],
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
