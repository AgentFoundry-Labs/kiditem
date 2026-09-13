import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  COUPANG_CATALOG_BASIC_SOURCE_TYPE,
  COUPANG_CATALOG_DETAILS_SOURCE_TYPE,
} from '@kiditem/shared/coupang-catalog-snapshot';
import {
  addDays,
  businessDateKey,
  datesInclusive,
  evidenceCutoffDate,
  kstBusinessDate,
  parseBusinessDate,
} from '@kiditem/shared/common';
import { PrismaService } from '../prisma/prisma.service';
import { readSellpiaSalesDailyFacts } from '../analytics/sellpia-sales/read/sellpia-sales-daily-facts';
import { dayAfter, readAdWindowFacts } from '../common/ad-window-facts';
import { buildSnapshotBasis } from '@kiditem/shared/dashboard';
import { readWingRankCoverage } from '../advertising/read/keyword-rank-facts';
import type {
  ReadinessCheck,
  ReadinessResponse,
  RebuildReadinessResponse,
} from '@kiditem/shared/readiness';

// A staged details publication enriches the rows written by the completed
// basics publication. Keep all three receipts in the coverage read so a
// running/failed details child cannot make a previously valid basics snapshot
// disappear from readiness. Whole-catalog readiness is stricter below: it is
// satisfied only by the legacy full receipt or a terminal details receipt.
const READINESS_CATALOG_COVERAGE_SOURCE_TYPES = [
  'coupang_wing_catalog',
  COUPANG_CATALOG_BASIC_SOURCE_TYPE,
  COUPANG_CATALOG_DETAILS_SOURCE_TYPE,
] as const;

const READINESS_CATALOG_COMPLETE_SOURCE_TYPES = [
  'coupang_wing_catalog',
  COUPANG_CATALOG_DETAILS_SOURCE_TYPE,
] as const;

/**
 * Readiness check for system data freshness.
 *
 * Schema mapping (main 의 ChannelScrape* 계층):
 *  - 일별 매출 → SellpiaSalesDailySnapshot (셀피아 판매현황 수집 결과)
 *  - 쿠팡 광고 일별 → 캠페인 sweep이 선언한 창 (광고 target-일 원장 리더)
 *  - Wing 판매순위 → CoupangWingSalesRankDailySnapshot
 *  - 상품 마스터 → MasterProduct
 *
 * `businessDate` 는 schema 에서 이미 KST date (DB Date 타입). +9h 변환 불필요.
 */
@Injectable()
export class ReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sellpia 매출과 Wing readiness는 최소 최근 N일을 보장하고, 이번 달이
   * 더 길면 월초부터 확인한다. 광고는 지연 attribution 재수집 창과 같은
   * 정확한 최근 30일을 독립적으로 확인한다. 원천별 row 집계는 서로
   * 공유하지 않는다.
   */
  private static readonly LOOKBACK_DAYS = 14;
  private static readonly AD_LOOKBACK_DAYS = 30;

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
    const target = value.target === 'local' || value.target === 'office'
      ? value.target
      : null;
    return {
      state: 'snapshot_required',
      target,
      requiredImports: ['sellpia', 'wing'],
    };
  }

  async getStatus(organizationId: string): Promise<ReadinessResponse> {
    return this.prisma.$transaction(
      (tx) => this.getStatusIn(tx, organizationId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async getStatusIn(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<ReadinessResponse> {
    const now = new Date();
    // Source readiness ends at the latest fully closed KST business day.
    const todayKst = kstBusinessDate(now);
    const todayKstStr = businessDateKey(todayKst);
    const yesterdayKst = evidenceCutoffDate(now);
    const yesterdayKstStr = businessDateKey(yesterdayKst);
    // 최소 lookback N 일 전 ~ 어제까지의 기대 일자
    const lookbackStart = addDays(yesterdayKst, -(ReadinessService.LOOKBACK_DAYS - 1));
    const monthStartKstStr = `${todayKstStr.slice(0, 8)}01`;
    const monthStartKst = parseBusinessDate(monthStartKstStr)!;
    // 월초가 rolling lookback보다 이르면 이번 달 전체를 유지한다. 월초 직후
    // 에는 lookback이 전월로 넘어가므로 최소 14일 보장도 그대로 남는다.
    const coverageRangeStart = lookbackStart < monthStartKst
      ? lookbackStart
      : monthStartKst;
    const coverageRangeStartKstStr = businessDateKey(coverageRangeStart);
    const adsLookbackStart = addDays(
      yesterdayKst,
      -(ReadinessService.AD_LOOKBACK_DAYS - 1),
    );
    const adsRangeStartKstStr = businessDateKey(adsLookbackStart);
    const adsExpectedDates = datesInclusive(adsLookbackStart, yesterdayKst)
      .map(businessDateKey);

    // Sellpia 월 누적: 최근 lookback과 이번 달 1일 중 더 이른 날부터 확인.
    const sellpiaRangeStartKstStr = coverageRangeStartKstStr;
    const sellpiaRangeEndKstStr = yesterdayKstStr;
    const sellpiaExpectedDates = datesInclusive(coverageRangeStart, yesterdayKst)
      .map(businessDateKey);

    // Extension ingest/read paths bind to one active Coupang account and
    // prefer the primary account for account-less reads. Readiness must use
    // the same account, otherwise disabled-account facts can mark data ready.
    const activeCoupangAccount = await tx.channelAccount.findFirst({
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

    // coupang_ads — 캠페인 sweep이 보고한 영업일 (광고 원장 리더)
    const adsDailyKpiPublished = activeCoupangAccount
      ? await readAdWindowFacts(tx, {
            organizationId,
            from: adsLookbackStart,
            to: dayAfter(yesterdayKst),
          })
      : null;
    const activeWingVendorRows = activeCoupangAccount
      ? await tx.channelListingOption.findMany({
            where: {
              organizationId,
              isActive: true,
              listing: {
                organizationId,
                channelAccountId: activeCoupangAccount.id,
                isActive: true,
              },
            },
            select: { externalOptionId: true, rawJson: true },
            distinct: ['externalOptionId'],
          })
      : [];
    const coupangProductCount = activeCoupangAccount
      ? await tx.channelListing.count({
            where: {
              organizationId,
              channelAccountId: activeCoupangAccount.id,
              isActive: true,
              lastImportRun: {
                is: {
                  organizationId,
                  sourceType: { in: [...READINESS_CATALOG_COVERAGE_SOURCE_TYPES] },
                },
              },
            },
          })
      : 0;
    const latestCoupangCatalogRun = activeCoupangAccount
      ? await tx.sourceImportRun.findFirst({
            where: {
              organizationId,
              channelAccountId: activeCoupangAccount.id,
              sourceType: { in: [...READINESS_CATALOG_COMPLETE_SOURCE_TYPES] },
              status: 'completed',
              importedAt: { not: null },
            },
            orderBy: { importedAt: 'desc' },
            select: { importedAt: true, coverageEndDate: true },
          })
      : null;
    const sellpiaDailyRows = await readSellpiaSalesDailyFacts(tx, {
      organizationId,
      from: sellpiaRangeStartKstStr,
      to: sellpiaRangeEndKstStr,
    });

    const activeWingVendorIds = new Set(
      activeWingVendorRows
        .map((row) => readinessVendorItemId(row))
        .filter((value): value is string => Boolean(value)),
    );
    const activeWingVendorIdList = [...activeWingVendorIds];
    // Rank rows do not carry channelAccountId. Fence their date/coverage to
    // vendor items belonging to the selected active account.
    const wingRankCoverage = await readWingRankCoverage(tx, {
      organizationId,
      vendorItemIds: activeWingVendorIdList,
    });

    // 일별 매출(wing_sales) readiness 상태 원천 — 셀피아 판매현황(몰별 일별 매출).
    const sellpiaPresent = new Set(sellpiaDailyRows.coverage.includedDates);
    const sellpiaMissing = sellpiaExpectedDates.filter(
      (d) => !sellpiaPresent.has(d),
    );
    const sellpiaLatestOk = sellpiaPresent.has(sellpiaRangeEndKstStr);
    const sellpiaLastDate = sellpiaDailyRows.latestCapturedAt;
    const sellpiaSortedDates = [...sellpiaPresent].sort();
    const sellpiaActualCutoff = sellpiaSortedDates[sellpiaSortedDates.length - 1] ?? null;

    // coupang_ads — 캠페인 sweep 선언 창의 영업일
    const adsPresent = new Set((adsDailyKpiPublished?.days ?? []).map((r) => r.businessDate));
    const adsMissing = adsExpectedDates.filter((d) => !adsPresent.has(d));
    const adsYesterdayOk = adsPresent.has(yesterdayKstStr);
    const adsLastDate = adsDailyKpiPublished?.observedAt?.toISOString() ?? null;
    const adsSortedDates = [...adsPresent].sort();
    const adsActualCutoff = adsSortedDates[adsSortedDates.length - 1] ?? null;

    const wingSalesRankBusinessDate = wingRankCoverage.businessDate
      ? businessDateKey(wingRankCoverage.businessDate)
      : null;
    const wingSalesRankFresh = wingSalesRankBusinessDate
      ? wingSalesRankBusinessDate >= yesterdayKstStr
      : false;
    const collectedActiveWingVendorCount = new Set(
      wingRankCoverage.vendorItemIds
        .filter((vendorItemId) => activeWingVendorIds.has(vendorItemId)),
    ).size;
    const wingSalesRankComplete =
      activeWingVendorIds.size > 0 &&
      collectedActiveWingVendorCount === activeWingVendorIds.size;

    const checks: ReadinessCheck[] = [
      {
        key: 'wing_sales',
        label: '일별 매출 (셀피아 판매현황)',
        basis: buildSnapshotBasis({
          asOf: sellpiaActualCutoff,
          requiredAsOf: sellpiaRangeEndKstStr,
          observedAt: sellpiaLastDate,
          sources: ['sellpia_sales_daily_snapshot'],
          measured: sellpiaPresent.size > 0,
          withheldCount: sellpiaMissing.length,
        }),
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
        basis: buildSnapshotBasis({
          asOf: adsActualCutoff,
          requiredAsOf: yesterdayKstStr,
          observedAt: adsLastDate,
          sources: ['coupang_ads'],
          measured: adsPresent.size > 0,
          withheldCount: adsMissing.length,
        }),
        detail:
          adsMissing.length === 0
            ? `최근 ${adsExpectedDates.length}일치 (${adsRangeStartKstStr}~${yesterdayKstStr}) 모두 수집됨`
            : !adsYesterdayOk
              ? `최신(${yesterdayKstStr}) 미수집 — 누락 ${adsMissing.length}/${adsExpectedDates.length}일`
              : `누락 ${adsMissing.length}/${adsExpectedDates.length}일 (${adsRangeStartKstStr}~${yesterdayKstStr})`,
        lastSyncedAt: adsLastDate,
        count: adsPresent.size,
        collector: 'extension',
        collectEndpoint: null,
        // The campaign sweep owner plans its own window at begin time. Keep
        // provider URLs out of this check so generic session controls cannot
        // start an unowned ads collection.
        scrapeUrls: null,
        referenceDate: yesterdayKstStr,
        expectedDates: adsExpectedDates,
        missingDates: adsMissing,
      },
      {
        key: 'coupang_products',
        label: '쿠팡 상품 데이터 수집',
        basis: buildSnapshotBasis({
          asOf: latestCoupangCatalogRun?.coverageEndDate
            ? businessDateKey(latestCoupangCatalogRun.coverageEndDate)
            : null,
          requiredAsOf: yesterdayKstStr,
          observedAt: latestCoupangCatalogRun?.importedAt ?? null,
          sources: ['coupang_catalog'],
          measured: coupangProductCount > 0 && Boolean(latestCoupangCatalogRun?.importedAt),
          withheldCount: coupangProductCount > 0 && !latestCoupangCatalogRun?.importedAt ? coupangProductCount : 0,
        }),
        detail:
          coupangProductCount > 0 && latestCoupangCatalogRun?.importedAt
            ? `쿠팡 상품 ${coupangProductCount}건 수집됨`
            : coupangProductCount > 0
              ? `쿠팡 상품 기본 목록 ${coupangProductCount}건 반영됨 — 전체 상세 수집 필요`
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
        basis: buildSnapshotBasis({
          asOf: wingSalesRankBusinessDate,
          requiredAsOf: yesterdayKstStr,
          observedAt: wingRankCoverage.capturedAt,
          sources: ['coupang_wing_rank'],
          measured: wingRankCoverage.businessDate !== null,
          withheldCount: Math.max(0, activeWingVendorIds.size - collectedActiveWingVendorCount),
        }),
        detail: wingRankCoverage.businessDate
          ? wingSalesRankFresh && wingSalesRankComplete
            ? `Wing 판매순위 ${wingRankCoverage.rowCount}행 · ${collectedActiveWingVendorCount}/${activeWingVendorIds.size}상품 — 최종 수집 ${formatKst(wingRankCoverage.capturedAt!)}`
            : !wingSalesRankFresh
              ? `Wing 판매순위 최신 날짜(${yesterdayKstStr}) 미반영 — 다시 수집 필요`
              : `Wing 판매순위 불완전 ${collectedActiveWingVendorCount}/${activeWingVendorIds.size}상품 — 다시 수집 필요`
          : 'Wing 판매순위 수집 이력 없음',
        lastSyncedAt: wingRankCoverage.capturedAt?.toISOString() ?? null,
        count: wingRankCoverage.rowCount,
        collector: 'extension',
        collectEndpoint: null,
        // 웹 훅이 기존 advertising.wing_rank background 수집을 직접 시작한다.
        scrapeUrls: null,
        referenceDate: yesterdayKstStr,
        expectedDates: null,
        missingDates: null,
      },
    ];

    return { checks } satisfies ReadinessResponse;
  }

}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type WingVendorReadinessRow = {
  externalOptionId: string | null;
  rawJson?: unknown;
};

/**
 * Wing rank facts are keyed by the provider's vendorItemId.  Staged catalog
 * basics may use an inventory-item identity while Wing has not assigned that
 * vendor id yet; that fallback must not be promoted into a rank target.  Old
 * browser/full-catalog rows predate the marker and keep their external option
 * id as the legacy vendor identity.
 */
function readinessVendorItemId(row: WingVendorReadinessRow): string | null {
  const externalOptionId = optionalText(row.externalOptionId);
  const raw = toRecord(row.rawJson);
  const source = optionalUnknownText(raw.source);
  const identitySource = optionalUnknownText(raw.externalOptionIdentitySource);
  const vendorItemId = optionalUnknownText(raw.vendorItemId);

  if (identitySource === 'vendor_item') return vendorItemId ?? externalOptionId;
  if (source === COUPANG_CATALOG_BASIC_SOURCE_TYPE || source === COUPANG_CATALOG_DETAILS_SOURCE_TYPE) {
    return vendorItemId;
  }
  if (source === 'coupang_catalog_basics' || source === 'coupang_catalog_details') {
    return vendorItemId;
  }
  if (source === 'coupang_catalog_browser' || source === 'coupang_wing_catalog') {
    return externalOptionId;
  }
  // Rows written before source provenance was recorded remain compatible with
  // the legacy readiness behavior. An explicit unknown source is not.
  return source === null ? externalOptionId : null;
}

function optionalUnknownText(value: unknown): string | null {
  return typeof value === 'string' ? optionalText(value) : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}


function formatKst(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().replace('T', ' ').slice(0, 16);
}
