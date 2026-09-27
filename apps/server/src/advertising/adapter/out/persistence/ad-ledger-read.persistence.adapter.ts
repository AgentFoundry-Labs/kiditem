import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AD_REPORT_KIND } from '@kiditem/shared/advertising-operations';
import { readOperationWindows } from '../../../../common/operation/transaction/operation-windows';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { ACCOUNT_ADJUSTMENT_CAMPAIGN_KEY } from '../../../domain/ad-report-billing';
import { measuredAdDates } from '../../../domain/ad-report-coverage';
import type {
  AdCoverage,
  AdListingWindowFacts,
  AdWindowDay,
  AdWindowFacts,
} from '../../../application/port/in/capability/advertising-ledger-read.port';
import type { AdLedgerReadRepositoryPort, AdLedgerReadScope } from '../../../application/port/out/repository/ad-ledger-read.repository.port';

type DayRow = {
  business_date: string;
  spend: number;
  billed_spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  orders: number;
  units: number;
};

type AdjustmentRow = { business_date: string; adjustment: number };

type ListingRow = {
  listing_id: string;
  days: number;
  first_date: string;
  last_date: string;
  spend: number;
  billed_spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  orders: number;
  units: number;
};

/**
 * 새 광고 원장 읽기(KID-372). 조직·활성 계정·날짜로만 질의하고 모든 raw SQL은 organization_id를 묶는다(tenancy 스캐너).
 *
 * 합은 상품 사실 표(`channel_ad_product_daily_snapshots`) 기준이다. 옛 원장의 캠페인 grain 우선 규칙은 없다 — 새 원장에는
 * 캠페인 행이 따로 없고, 캠페인×일의 정산 청구액이 상품 행 `billed_spend`에 원 단위까지 배분돼 있다. 키워드 표는 상품 합에
 * 더하지 않는다(클릭 있는 검색 키워드만 있는 비가산 표).
 */
@Injectable()
export class AdLedgerReadPersistenceAdapter implements AdLedgerReadRepositoryPort {
  /** 조직의 측정한 날과 그 근거 실행(`readOperationWindows`) — 다른 읽기가 날짜 목록으로 쓴다. */
  async readAdCoverage(transaction: OwnerTransaction, scope: AdLedgerReadScope): Promise<AdCoverage> {
    if (scope.activeAccountIds.length === 0) {
      return { measuredDates: [], latestMeasuredDate: null, observedAt: null, activeAccountIds: [] };
    }
    const windows = await readOperationWindows(ownerTransactionClient(transaction), {
      organizationId: scope.organizationId,
      kind: AD_REPORT_KIND,
      planKey: 'channelAccountId',
      planValues: scope.activeAccountIds,
    });
    const measuredDates = measuredAdDates({
      activeAccountIds: scope.activeAccountIds,
      windows: windows.map((row) => ({ channelAccountId: row.planValue, start: row.windowStart, end: row.windowEnd })),
      from: scope.from,
      to: scope.to,
    });
    const observedAt = windows.reduce<Date | null>(
      (latest, row) => (row.finishedAt && (!latest || row.finishedAt > latest) ? row.finishedAt : latest),
      null,
    );
    return {
      measuredDates,
      latestMeasuredDate: measuredDates.at(-1) ?? null,
      observedAt: measuredDates.length === 0 ? null : observedAt,
      activeAccountIds: scope.activeAccountIds,
    };
  }

  /** 조직이 측정한 날마다 하루 합. 측정한 날인데 행이 없으면 0인 날. */
  async readAdWindowFacts(transaction: OwnerTransaction, scope: AdLedgerReadScope): Promise<AdWindowFacts> {
    const coverage = await this.readAdCoverage(transaction, scope);
    if (coverage.measuredDates.length === 0) return { days: [], observedAt: null };
    const tx = ownerTransactionClient(transaction);
    const dates = [...coverage.measuredDates];
    const accounts = [...scope.activeAccountIds];
    const rows = await tx.$queryRaw<DayRow[]>(Prisma.sql`
      SELECT to_char(p.date, 'YYYY-MM-DD') AS business_date,
        COALESCE(SUM(p.spend), 0)::int AS spend,
        COALESCE(SUM(p.billed_spend), 0)::int AS billed_spend,
        COALESCE(SUM(p.revenue), 0)::int AS revenue,
        COALESCE(SUM(p.impressions), 0)::int AS impressions,
        COALESCE(SUM(p.clicks), 0)::int AS clicks,
        COALESCE(SUM(p.orders), 0)::int AS orders,
        COALESCE(SUM(p.units), 0)::int AS units
      FROM channel_ad_product_daily_snapshots p
      WHERE p.organization_id = ${scope.organizationId}::uuid
        AND p.channel_account_id = ANY(${accounts}::uuid[])
        AND p.date = ANY(${dates}::date[])
      GROUP BY p.date
    `);
    const adjustments = await tx.$queryRaw<AdjustmentRow[]>(Prisma.sql`
      SELECT to_char(b.date, 'YYYY-MM-DD') AS business_date,
        COALESCE(SUM(b.billed_spend), 0)::int AS adjustment
      FROM channel_ad_daily_billings b
      WHERE b.organization_id = ${scope.organizationId}::uuid
        AND b.channel_account_id = ANY(${accounts}::uuid[])
        AND b.date = ANY(${dates}::date[])
        AND b.campaign_key = ${ACCOUNT_ADJUSTMENT_CAMPAIGN_KEY}
      GROUP BY b.date
    `);
    const byDate = new Map(rows.map((row) => [row.business_date, row]));
    const adjustmentByDate = new Map(adjustments.map((row) => [row.business_date, row.adjustment]));
    const days = coverage.measuredDates.map((businessDate): AdWindowDay => {
      const row = byDate.get(businessDate);
      return {
        businessDate,
        spend: row?.spend ?? 0,
        billedSpend: row?.billed_spend ?? 0,
        adjustment: adjustmentByDate.get(businessDate) ?? 0,
        revenue: row?.revenue ?? 0,
        impressions: row?.impressions ?? 0,
        clicks: row?.clicks ?? 0,
        orders: row?.orders ?? 0,
        units: row?.units ?? 0,
      };
    });
    return { days, observedAt: coverage.observedAt };
  }

  /**
   * 리스팅마다 측정한 날의 합. 리스팅에 맞춰지지 않은 행(`listing_id` null)은 조직 합에는 들고 여기에는 없다.
   * `observedAt`은 조직 측정의 마지막 실행 종료 시각이다(실행 표는 common/operation만 읽는다 — ADR-0025).
   */
  async readListingAdWindowFacts(transaction: OwnerTransaction, scope: AdLedgerReadScope): Promise<AdListingWindowFacts[]> {
    const coverage = await this.readAdCoverage(transaction, scope);
    if (coverage.measuredDates.length === 0) return [];
    const tx = ownerTransactionClient(transaction);
    const dates = [...coverage.measuredDates];
    const accounts = [...scope.activeAccountIds];
    const rows = await tx.$queryRaw<ListingRow[]>(Prisma.sql`
      SELECT p.listing_id,
        COUNT(DISTINCT p.date)::int AS days,
        to_char(MIN(p.date), 'YYYY-MM-DD') AS first_date,
        to_char(MAX(p.date), 'YYYY-MM-DD') AS last_date,
        COALESCE(SUM(p.spend), 0)::int AS spend,
        COALESCE(SUM(p.billed_spend), 0)::int AS billed_spend,
        COALESCE(SUM(p.revenue), 0)::int AS revenue,
        COALESCE(SUM(p.impressions), 0)::int AS impressions,
        COALESCE(SUM(p.clicks), 0)::int AS clicks,
        COALESCE(SUM(p.orders), 0)::int AS orders,
        COALESCE(SUM(p.units), 0)::int AS units
      FROM channel_ad_product_daily_snapshots p
      WHERE p.organization_id = ${scope.organizationId}::uuid
        AND p.channel_account_id = ANY(${accounts}::uuid[])
        AND p.date = ANY(${dates}::date[])
        AND p.listing_id IS NOT NULL
      GROUP BY p.listing_id
      ORDER BY p.listing_id
    `);
    return rows.map((row) => ({
      listingId: row.listing_id,
      days: row.days,
      firstDate: row.first_date,
      lastDate: row.last_date,
      observedAt: coverage.observedAt,
      spend: row.spend,
      billedSpend: row.billed_spend,
      revenue: row.revenue,
      impressions: row.impressions,
      clicks: row.clicks,
      orders: row.orders,
      units: row.units,
    }));
  }
}
