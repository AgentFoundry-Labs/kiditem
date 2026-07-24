import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { kstDayStart } from '../common/kst';
import { SELLPIA_SALES_COVERAGE_SELLER_ID } from '../analytics/sellpia-sales/domain/snapshot-coverage';
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
 *  - 일별 매출 → SellpiaSalesDailySnapshot (셀피아 판매현황 수집 결과)
 *  - 쿠팡 광고 일별 → ChannelAccountDailyKpiSnapshot { source:'coupang_ads', kpiType:'coupang_ads_daily' }
 *  - Wing 판매순위 → CoupangWingSalesRankDailySnapshot
 *  - 상품 마스터 → MasterProduct
 *
 * `businessDate` 는 schema 에서 이미 KST date (DB Date 타입). +9h 변환 불필요.
 */
@Injectable()
export class ReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 광고와 Sellpia 매출 모두 최소 최근 N일을 보장하고, 이번 달이 더 길면
   * 월초부터 확인한다. 원천별 row 집계는 서로 공유하지 않는다.
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
    // 최소 lookback N 일 전 ~ 어제까지의 기대 일자
    const lookbackStart = new Date(
      yesterdayKstStart.getTime() - (ReadinessService.LOOKBACK_DAYS - 1) * 86400000,
    );
    const lookbackStartKstStr = toKstDateStr(lookbackStart);
    const monthStartKstStr = `${todayKstStr.slice(0, 8)}01`;
    // 월초가 rolling lookback보다 이르면 이번 달 전체를 유지한다. 월초 직후
    // 에는 lookback이 전월로 넘어가므로 최소 14일 보장도 그대로 남는다.
    const coverageRangeStartKstStr =
      lookbackStartKstStr < monthStartKstStr
        ? lookbackStartKstStr
        : monthStartKstStr;
    const adsRangeStartKstStr = coverageRangeStartKstStr;
    const adsRangeStartDate = parseDbDate(adsRangeStartKstStr);
    const adsRangeEndDate = parseDbDate(yesterdayKstStr);
    const adsExpectedDates = enumerateDates(adsRangeStartKstStr, yesterdayKstStr);

    // Sellpia 월 누적: 최근 lookback과 이번 달 1일 중 더 이른 날부터 확인.
    const sellpiaRangeStartKstStr = coverageRangeStartKstStr;
    const sellpiaRangeStartDate = parseDbDate(sellpiaRangeStartKstStr);
    // 월 1일의 홈 월간 조회는 today~today 단일 범위라 Sellpia summary가 당일
    // coverage를 요구한다. 이 날만 readiness도 오늘까지 확인해야 모달이 이미
    // 준비됐다고 숨은 채 홈은 hasData=false인 경계 불일치가 생기지 않는다.
    const sellpiaRangeEndKstStr = todayKstStr.endsWith('-01')
      ? todayKstStr
      : yesterdayKstStr;
    const sellpiaRangeEndDate = parseDbDate(sellpiaRangeEndKstStr);
    const sellpiaExpectedDates = enumerateDates(
      sellpiaRangeStartKstStr,
      sellpiaRangeEndKstStr,
    );

    // Extension ingest/read paths bind to one active Coupang account and
    // prefer the primary account for account-less reads. Readiness must use
    // the same account, otherwise disabled-account facts can mark data ready.
    const activeCoupangAccount = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        status: 'active',
      },
      orderBy: [
        { isPrimary: 'desc' },
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
      select: { id: true },
    });

    const [
      adsDailyKpiRows,
      activeWingVendorRows,
      coupangProductCount,
      latestCoupangCatalogRun,
      sellpiaDailyRows,
    ] = await Promise.all([
      // coupang_ads — 쿠팡 광고 일별 KPI
      activeCoupangAccount
        ? this.prisma.channelAccountDailyKpiSnapshot.findMany({
            where: {
              organizationId,
              channelAccountId: activeCoupangAccount.id,
              channel: 'coupang',
              source: 'coupang_ads',
              kpiType: 'coupang_ads_daily',
              businessDate: {
                gte: adsRangeStartDate,
                lte: adsRangeEndDate,
              },
            },
            select: { businessDate: true, lastObservedAt: true },
            orderBy: { businessDate: 'desc' },
          })
        : Promise.resolve([]),
      activeCoupangAccount
        ? this.prisma.channelListingOption.findMany({
            where: {
              organizationId,
              isActive: true,
              listing: {
                organizationId,
                channelAccountId: activeCoupangAccount.id,
                isActive: true,
              },
            },
            select: { externalOptionId: true },
            distinct: ['externalOptionId'],
          })
        : Promise.resolve([]),
      activeCoupangAccount
        ? this.prisma.channelListing.count({
            where: {
              organizationId,
              channelAccountId: activeCoupangAccount.id,
              isActive: true,
            },
          })
        : Promise.resolve(0),
      activeCoupangAccount
        ? this.prisma.sourceImportRun.findFirst({
            where: {
              organizationId,
              channelAccountId: activeCoupangAccount.id,
              sourceType: 'coupang_wing_catalog',
              status: 'completed',
              importedAt: { not: null },
            },
            orderBy: { importedAt: 'desc' },
            select: { importedAt: true },
          })
        : Promise.resolve(null),
      // 일별 매출(wing_sales) readiness 원천 — 셀피아 판매현황 몰별 일별 스냅샷.
      // businessDate 별로 데이터가 있는 날을 집계(판매처 무관 distinct).
      this.prisma.sellpiaSalesDailySnapshot.findMany({
        where: {
          organizationId,
          sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
          businessDate: { gte: sellpiaRangeStartDate, lte: sellpiaRangeEndDate },
        },
        select: { businessDate: true, capturedAt: true },
        distinct: ['businessDate'],
        orderBy: { businessDate: 'desc' },
      }),
    ]);

    const activeWingVendorIds = new Set(
      activeWingVendorRows
        .map((row) => row.externalOptionId)
        .filter((value): value is string => Boolean(value)),
    );
    const activeWingVendorIdList = [...activeWingVendorIds];
    // Rank rows do not carry channelAccountId. Fence their date/coverage to
    // vendor items belonging to the selected active account.
    const wingSalesRank = activeWingVendorIdList.length
      ? await this.prisma.coupangWingSalesRankDailySnapshot.findFirst({
          where: {
            organizationId,
            vendorItemId: { in: activeWingVendorIdList },
          },
          orderBy: [{ businessDate: 'desc' }, { capturedAt: 'desc' }],
          select: { capturedAt: true, businessDate: true },
        })
      : null;

    const [latestWingVendorRows, wingSalesRankCount] = wingSalesRank
      ? await Promise.all([
          this.prisma.coupangWingSalesRankDailySnapshot.findMany({
            where: {
              organizationId,
              businessDate: wingSalesRank.businessDate,
              vendorItemId: { in: activeWingVendorIdList },
            },
            select: { vendorItemId: true },
            distinct: ['vendorItemId'],
          }),
          this.prisma.coupangWingSalesRankDailySnapshot.count({
            where: {
              organizationId,
              businessDate: wingSalesRank.businessDate,
              vendorItemId: { in: activeWingVendorIdList },
            },
          }),
        ])
      : [[], 0];

    // 일별 매출(wing_sales) readiness 상태 원천 — 셀피아 판매현황(몰별 일별 매출).
    const sellpiaPresent = new Set(
      sellpiaDailyRows.map((r) => toKstDateStr(r.businessDate)),
    );
    const sellpiaMissing = sellpiaExpectedDates.filter(
      (d) => !sellpiaPresent.has(d),
    );
    const sellpiaLatestOk = sellpiaPresent.has(sellpiaRangeEndKstStr);
    const sellpiaLastDate = sellpiaDailyRows.reduce<Date | null>(
      (max, r) => (!max || r.capturedAt > max ? r.capturedAt : max),
      null,
    );

    // coupang_ads 일별 수집
    const adsPresent = new Set(adsDailyKpiRows.map((r) => toKstDateStr(r.businessDate)));
    const adsMissing = adsExpectedDates.filter((d) => !adsPresent.has(d));
    const adsYesterdayOk = adsPresent.has(yesterdayKstStr);
    const adsLastDate = adsDailyKpiRows[0]?.lastObservedAt ?? null;

    const adsDashboardUrl = 'https://advertising.coupang.com/marketing/dashboard/sales';
    const wingSalesRankBusinessDate = wingSalesRank
      ? wingSalesRank.businessDate.toISOString().slice(0, 10)
      : null;
    const wingSalesRankFresh = wingSalesRankBusinessDate
      ? wingSalesRankBusinessDate >= yesterdayKstStr
      : false;
    const collectedActiveWingVendorCount = new Set(
      latestWingVendorRows
        .map((row) => row.vendorItemId)
        .filter((vendorItemId) => activeWingVendorIds.has(vendorItemId)),
    ).size;
    const wingSalesRankComplete =
      activeWingVendorIds.size > 0 &&
      collectedActiveWingVendorCount === activeWingVendorIds.size;

    const checks: ReadinessCheck[] = [
      {
        key: 'wing_sales',
        label: '일별 매출 (셀피아 판매현황)',
        status: sellpiaMissing.length === 0 ? 'ok' : sellpiaLatestOk ? 'stale' : 'missing',
        detail:
          sellpiaMissing.length === 0
            ? `최근 ${sellpiaExpectedDates.length}일치 (${sellpiaRangeStartKstStr}~${sellpiaRangeEndKstStr}) 모두 수집됨`
            : !sellpiaLatestOk
              ? `최신(${sellpiaRangeEndKstStr}) 미수집 — 누락 ${sellpiaMissing.length}/${sellpiaExpectedDates.length}일`
              : `누락 ${sellpiaMissing.length}/${sellpiaExpectedDates.length}일 (${sellpiaRangeStartKstStr}~${sellpiaRangeEndKstStr})`,
        lastSyncedAt: sellpiaLastDate ? sellpiaLastDate.toISOString() : null,
        count: sellpiaPresent.size,
        collector: 'extension',
        collectEndpoint: null,
        // 이 항목은 웹 훅이 누락 날짜 범위를 셀피아 확장 명령으로 직접 전달한다.
        // legacy Wing URL을 노출하면 실제 저장 원천과 재실행 원천이 어긋난다.
        scrapeUrls: null,
        referenceDate: yesterdayKstStr,
        expectedDates: sellpiaExpectedDates,
        missingDates: sellpiaMissing,
      },
      {
        key: 'coupang_ads',
        label: '쿠팡 광고 데이터 수집',
        status: adsMissing.length === 0 ? 'ok' : adsYesterdayOk ? 'stale' : 'missing',
        detail:
          adsMissing.length === 0
            ? `최근 ${adsExpectedDates.length}일치 (${adsRangeStartKstStr}~${yesterdayKstStr}) 모두 수집됨`
            : !adsYesterdayOk
              ? `최신(${yesterdayKstStr}) 미수집 — 누락 ${adsMissing.length}/${adsExpectedDates.length}일`
              : `누락 ${adsMissing.length}/${adsExpectedDates.length}일 (${adsRangeStartKstStr}~${yesterdayKstStr})`,
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
        expectedDates: adsExpectedDates,
        missingDates: adsMissing,
      },
      {
        key: 'coupang_products',
        label: '쿠팡 상품 데이터 수집',
        status:
          coupangProductCount > 0 && latestCoupangCatalogRun?.importedAt
            ? 'ok'
            : 'missing',
        detail:
          coupangProductCount > 0 && latestCoupangCatalogRun?.importedAt
            ? `쿠팡 상품 ${coupangProductCount}건 수집됨`
            : '완료된 쿠팡 전체 상품 수집 없음 — 최초 수집 필요',
        lastSyncedAt: latestCoupangCatalogRun?.importedAt?.toISOString() ?? null,
        count: coupangProductCount,
        collector: 'extension',
        collectEndpoint: null,
        // 웹 훅이 공식 전체 카탈로그 import run을 만들고 전용 확장을 시작한다.
        // generic scrapeTargets URL을 노출하면 일반 Wing 페이지 수집으로 잘못 라우팅된다.
        scrapeUrls: null,
        referenceDate: yesterdayKstStr,
        expectedDates: null,
        missingDates: null,
      },
      {
        key: 'wing_kpi',
        label: 'Wing 판매순위',
        status: wingSalesRank
          ? wingSalesRankFresh && wingSalesRankComplete
            ? 'ok'
            : 'stale'
          : 'missing',
        detail: wingSalesRank
          ? wingSalesRankFresh && wingSalesRankComplete
            ? `Wing 판매순위 ${wingSalesRankCount}행 · ${collectedActiveWingVendorCount}/${activeWingVendorIds.size}상품 — 최종 수집 ${formatKst(wingSalesRank.capturedAt)}`
            : !wingSalesRankFresh
              ? `Wing 판매순위 최신 날짜(${yesterdayKstStr}) 미반영 — 다시 수집 필요`
              : `Wing 판매순위 불완전 ${collectedActiveWingVendorCount}/${activeWingVendorIds.size}상품 — 다시 수집 필요`
          : 'Wing 판매순위 수집 이력 없음',
        lastSyncedAt: wingSalesRank?.capturedAt.toISOString() ?? null,
        count: wingSalesRankCount,
        collector: 'extension',
        collectEndpoint: null,
        // 웹 훅이 기존 advertising.wing_rank background 수집을 직접 시작한다.
        scrapeUrls: null,
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

function formatKst(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().replace('T', ' ').slice(0, 16);
}
