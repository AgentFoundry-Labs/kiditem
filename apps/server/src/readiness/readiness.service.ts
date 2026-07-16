import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { kstDayStart } from '../common/kst';
import type {
  AgentOsLiveReadinessCheck,
  AgentOsLiveReadinessResponse,
} from '@kiditem/shared/agent-os';
import type {
  ReadinessCheck,
  ReadinessResponse,
  RebuildReadinessResponse,
} from '@kiditem/shared/readiness';

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

  async getRebuildStatus(organizationId: string): Promise<RebuildReadinessResponse> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: 'inventory.rebuild.status',
        },
      },
      select: { value: true },
    });
    const value = toRecord(setting?.value);
    if (value.state !== 'snapshot_required') {
      return { state: 'ready', target: null, requiredImports: [] };
    }
    const target = value.target === 'local' || value.target === 'staging' || value.target === 'production'
      ? value.target
      : null;
    return {
      state: 'snapshot_required',
      target,
      requiredImports: ['sellpia', 'wing'],
    };
  }

  async getAgentOsLiveStatus(
    organizationId: string,
  ): Promise<AgentOsLiveReadinessResponse> {
    const checks: AgentOsLiveReadinessCheck[] = [
      this.openAiResponsesReadiness(),
      await this.coupangSellerProductReadiness(organizationId),
      this.alibaba1688CheckoutReadiness(),
    ];
    const runnableCapabilities = checks
      .filter((check) => check.status === 'ready')
      .flatMap((check) => check.requiredFor);
    const blockedCapabilities = checks
      .filter((check) => check.status !== 'ready')
      .flatMap((check) => check.requiredFor);

    return {
      checks,
      allReady: checks.every((check) => check.status === 'ready'),
      runnableCapabilities,
      blockedCapabilities,
    };
  }

  async getStatus(organizationId: string): Promise<ReadinessResponse> {
    const now = new Date();
    // Wing/광고는 당일 데이터가 없고 전일이 최신 → 어제를 기준일로 잡음
    const todayKstStart = kstDayStart(now);
    const todayKstStr = toKstDateStr(todayKstStart);
    const yesterdayKstStart = new Date(todayKstStart.getTime() - 86400000);
    const yesterdayKstStr = toKstDateStr(yesterdayKstStart);
    const rocketRangeStartKstStr = `${todayKstStr.slice(0, 8)}01`;

    // lookback N 일 전 ~ 어제까지의 기대 일자
    const lookbackStart = new Date(
      yesterdayKstStart.getTime() - (ReadinessService.LOOKBACK_DAYS - 1) * 86400000,
    );
    const rangeStartKstStr = toKstDateStr(lookbackStart);
    const rangeStartDate = parseDbDate(rangeStartKstStr);
    const rangeEndDate = parseDbDate(yesterdayKstStr);
    const expectedDates = enumerateDates(rangeStartKstStr, yesterdayKstStr);

    const [
      wingDailyKpiRows,
      adsDailyKpiRows,
      rocketDailyRows,
      wingItemWinnerKpi,
      productCount,
      lastProduct,
      sellpiaDailyRows,
    ] = await Promise.all([
      // wing_sales / dashboard daily — Wing 매출 대시보드 일별 데이터
      this.prisma.channelAccountDailyKpiSnapshot.findMany({
        where: {
          organizationId,
          channel: 'coupang',
          source: 'wing',
          kpiType: 'wing_dashboard',
          businessDate: { gte: rangeStartDate, lte: rangeEndDate },
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
          businessDate: { gte: rangeStartDate, lte: rangeEndDate },
        },
        select: { businessDate: true, lastObservedAt: true },
        orderBy: { businessDate: 'desc' },
      }),
      // rocket_sales — 쿠팡 supplier po-web 발주확정 원천 발주(발주일 기준)
      this.prisma.rocketPurchaseOrder.findMany({
        where: {
          organizationId,
          businessDate: {
            gte: parseDbDate(rocketRangeStartKstStr),
          },
          ...confirmedRocketPurchaseOrderWhere(),
        },
        select: { businessDate: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
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
      this.prisma.masterProduct.count({
        where: { organizationId, isActive: true },
      }),
      this.prisma.masterProduct.findFirst({
        where: { organizationId, isActive: true },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      // 일별 매출(wing_sales) readiness 원천 — 셀피아 판매현황 몰별 일별 스냅샷.
      // businessDate 별로 데이터가 있는 날을 집계(판매처 무관 distinct).
      this.prisma.sellpiaSalesDailySnapshot.findMany({
        where: {
          organizationId,
          businessDate: { gte: rangeStartDate, lte: rangeEndDate },
        },
        select: { businessDate: true, capturedAt: true },
        distinct: ['businessDate'],
        orderBy: { businessDate: 'desc' },
      }),
    ]);

    // wing 일별 수집 — businessDate 가 schema 에서 이미 KST date 이므로 그대로 사용.
    // (원래 Wing 기준 로직은 보존. 현재 일별 매출 상태는 아래 셀피아 기준으로 대체하고,
    //  wingMissing 은 vestigial scrapeUrls 계산에만 남겨둔다.)
    const wingPresent = new Set(wingDailyKpiRows.map((r) => toKstDateStr(r.businessDate)));
    const wingMissing = expectedDates.filter((d) => !wingPresent.has(d));

    // 일별 매출(wing_sales) readiness 상태 원천 — 셀피아 판매현황(몰별 일별 매출).
    const sellpiaPresent = new Set(
      sellpiaDailyRows.map((r) => toKstDateStr(r.businessDate)),
    );
    const sellpiaMissing = expectedDates.filter((d) => !sellpiaPresent.has(d));
    const sellpiaYesterdayOk = sellpiaPresent.has(yesterdayKstStr);
    const sellpiaLastDate = sellpiaDailyRows.reduce<Date | null>(
      (max, r) => (!max || r.capturedAt > max ? r.capturedAt : max),
      null,
    );

    // coupang_ads 일별 수집
    const adsPresent = new Set(adsDailyKpiRows.map((r) => toKstDateStr(r.businessDate)));
    const adsMissing = expectedDates.filter((d) => !adsPresent.has(d));
    const adsYesterdayOk = adsPresent.has(yesterdayKstStr);
    const adsLastDate = adsDailyKpiRows[0]?.lastObservedAt ?? null;

    // 쿠팡 로켓 매출 수집 — 미래 입고예정일 발주가 들어오므로 일자 누락보다
    // "오늘 한 번 갱신했는지"를 readiness 기준으로 삼는다.
    const rocketPresent = new Set(rocketDailyRows.map((r) => toKstDateStr(r.businessDate)));
    const rocketLastDate = rocketDailyRows[0]?.updatedAt ?? null;
    const rocketFreshToday = rocketLastDate ? rocketLastDate >= todayKstStart : false;

    const wingBase = 'https://wing.coupang.com/tenants/business-insight/sales-analysis';
    const adsDashboardUrl = 'https://advertising.coupang.com/marketing/dashboard/sales';
    const wingItemWinnerUrl = 'https://wing.coupang.com/tenants/seller-price-management?rf=menu';
    const rocketPoListUrl = 'https://supplier.coupang.com/po-web/purchase/order/list';

    const checks: ReadinessCheck[] = [
      {
        key: 'wing_sales',
        label: '일별 매출 (셀피아 판매현황)',
        status: sellpiaMissing.length === 0 ? 'ok' : sellpiaYesterdayOk ? 'stale' : 'missing',
        detail:
          sellpiaMissing.length === 0
            ? `최근 ${expectedDates.length}일치 (${rangeStartKstStr}~${yesterdayKstStr}) 모두 수집됨`
            : !sellpiaYesterdayOk
              ? `최신(${yesterdayKstStr}) 미수집 — 누락 ${sellpiaMissing.length}/${expectedDates.length}일`
              : `누락 ${sellpiaMissing.length}/${expectedDates.length}일 (${rangeStartKstStr}~${yesterdayKstStr})`,
        lastSyncedAt: sellpiaLastDate ? sellpiaLastDate.toISOString() : null,
        count: sellpiaPresent.size,
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
        missingDates: sellpiaMissing,
      },
      {
        key: 'rocket_sales',
        label: '쿠팡 로켓 매출',
        status: rocketFreshToday ? 'ok' : rocketLastDate ? 'stale' : 'missing',
        detail: rocketFreshToday
          ? `오늘 갱신됨 — ${rocketRangeStartKstStr}~${todayKstStr} 발주확정/발주일 기준`
          : rocketLastDate
            ? `오늘 미갱신 — 마지막 수집 ${formatKst(rocketLastDate)}`
            : '로켓 발주확정 매출 수집 이력 없음',
        lastSyncedAt: rocketLastDate ? rocketLastDate.toISOString() : null,
        count: rocketPresent.size,
        collector: 'extension',
        collectEndpoint: null,
        scrapeUrls: [rocketPoListUrl],
        referenceDate: todayKstStr,
        expectedDates: null,
        missingDates: null,
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

  private openAiResponsesReadiness(): AgentOsLiveReadinessCheck {
    const hasApiKey = hasEnv('OPENAI_API_KEY');
    const model = optionalEnv('AGENT_OS_OPENAI_RESPONSES_MODEL');
    const ready = hasApiKey && model != null;

    return {
      key: 'openai_responses_operator',
      label: 'OpenAI Responses Operator Runtime',
      status: ready ? 'ready' : 'missing',
      detail: ready
        ? `OpenAI Responses runtime can run with explicit model ${model}.`
        : missingList([
            hasApiKey ? null : 'OPENAI_API_KEY',
            model ? null : 'AGENT_OS_OPENAI_RESPONSES_MODEL',
          ]),
      requiredFor: ['operator_runtime'],
      remediation: ready
        ? null
        : 'Set OPENAI_API_KEY and AGENT_OS_OPENAI_RESPONSES_MODEL before running the hosted Operator adapter.',
    };
  }

  private async coupangSellerProductReadiness(
    organizationId: string,
  ): Promise<AgentOsLiveReadinessCheck> {
    const account = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        isPrimary: true,
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        vendorId: true,
        externalAccountId: true,
        config: true,
      },
    });
    const config = toJsonRecord(account?.config);
    const credentials = toRecord(config.coupangCredentials);
    const hasVendorId = Boolean(
      optionalText(account?.vendorId) ?? optionalText(account?.externalAccountId),
    );
    const hasAccessKey = isCredentialEnvelope(credentials.accessKey);
    const hasSecretKey = isCredentialEnvelope(credentials.secretKey);
    const ready = hasVendorId && hasAccessKey && hasSecretKey;

    return {
      key: 'coupang_seller_product_api',
      label: 'Coupang Seller Product API',
      status: ready ? 'ready' : 'missing',
      detail: ready
        ? 'Primary active Coupang channel account has Vendor ID, Access Key, and Secret Key configured.'
        : missingList([
            hasVendorId ? null : 'primary active Coupang Vendor ID',
            hasAccessKey ? null : 'Coupang Access Key',
            hasSecretKey ? null : 'Coupang Secret Key',
          ]),
      requiredFor: ['channels.submit_coupang_listing'],
      remediation: ready
        ? null
        : 'Save the primary Coupang channel account Vendor ID, Access Key, and Secret Key in channel settings.',
    };
  }

  private alibaba1688CheckoutReadiness(): AgentOsLiveReadinessCheck {
    const runtime = optionalEnv('AGENT_OS_1688_CHECKOUT_RUNTIME');
    const providerUrl = optionalEnv('AGENT_OS_1688_CHECKOUT_PROVIDER_URL');
    const ready = runtime === 'provider' && providerUrl != null;

    return {
      key: 'alibaba_1688_checkout_runtime',
      label: '1688 Checkout Runtime',
      status: ready ? 'ready' : 'missing',
      detail: ready
        ? `1688 checkout provider runtime is configured as ${runtime}.`
        : missingList([
            runtime === 'provider' ? null : 'AGENT_OS_1688_CHECKOUT_RUNTIME=provider',
            providerUrl ? null : 'AGENT_OS_1688_CHECKOUT_PROVIDER_URL',
          ]),
      requiredFor: [
        'supply.submit_purchase_order',
        'supply.submit_purchase_order_live_checkout',
      ],
      remediation: ready
        ? null
        : 'Configure an authenticated browser or provider-backed 1688 checkout runtime before live supplier ordering.',
    };
  }
}

function hasEnv(key: string): boolean {
  return optionalEnv(key) != null;
}

function optionalEnv(key: string): string | null {
  return optionalText(process.env[key]);
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function missingList(items: Array<string | null>): string {
  const missing = items.filter((item): item is string => item != null);
  return `Missing: ${missing.join(', ')}.`;
}

function toJsonRecord(
  value: Prisma.JsonValue | null | undefined,
): Prisma.JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Prisma.JsonObject;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isCredentialEnvelope(value: unknown): boolean {
  const record = toRecord(value);
  return Boolean(
    record.version &&
      record.algorithm &&
      record.iv &&
      record.ciphertext &&
      record.tag,
  );
}

function confirmedRocketPurchaseOrderWhere(): Prisma.RocketPurchaseOrderWhereInput {
  return {
    OR: [{ status: 'PA' }, { status: { contains: '발주확정' } }],
  };
}

/** Date → KST YYYY-MM-DD */
function toKstDateStr(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * YYYY-MM-DD → Prisma @db.Date comparison value.
 *
 * Postgres `date` values come back from Prisma as UTC-midnight Date objects.
 * Using a KST-midnight instant here would exclude the end date, e.g.
 * 2026-05-01 becomes 2026-04-30T15:00Z and misses DB date 2026-05-01.
 */
function parseDbDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function enumerateDates(startYmd: string, endYmd: string): string[] {
  const start = parseDbDate(startYmd);
  const end = parseDbDate(endYmd);
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
