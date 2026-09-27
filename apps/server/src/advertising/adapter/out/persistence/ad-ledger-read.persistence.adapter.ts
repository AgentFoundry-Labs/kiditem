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
import {
  AD_RULE_RECENT_MEASURED_DAYS,
  type AdCampaignSelector,
  type AdCampaignWindowRollup,
  type AdCurrentTargets,
  type AdKeywordWindowRollup,
  type AdLedgerReadRepositoryPort,
  type AdLedgerReadScope,
  type AdProductWindowRollup,
  type AdWindowRollups,
} from '../../../application/port/out/repository/ad-ledger-read.repository.port';

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

type CampaignRollupRow = {
  channel_account_id: string;
  campaign_id: string;
  name: string;
  is_active: boolean;
  status: string | null;
  budget: number | null;
  roas_target: number | null;
  spend: number;
  billed_spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  orders: number;
  units: number;
  listing_ids: string[];
  vendor_item_ids: string[];
};

type ProductRollupRow = {
  channel_account_id: string;
  campaign_id: string;
  campaign_name: string | null;
  ad_group_id: string;
  vendor_item_id: string;
  listing_id: string | null;
  option_name: string | null;
  is_active: boolean | null;
  status: string | null;
  days: number;
  spend: number;
  billed_spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  orders: number;
  units: number;
};

type KeywordRollupRow = {
  channel_account_id: string;
  campaign_id: string;
  campaign_name: string | null;
  ad_group_id: string;
  vendor_item_id: string;
  keyword: string;
  listing_id: string | null;
  option_name: string | null;
  days: number;
  last_date: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  orders: number;
  units: number;
};

/** 읽기 한 번이 쓰는 조직·계정·측정일. */
type MeasuredScope = Readonly<{ organizationId: string; accounts: string[]; dates: string[] }>;

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
  /** 캠페인마다 측정한 날의 상품 행 합과 현재 상태. 지운 캠페인(`deleted_at`)은 빠진다 — 캠페인 표가 현재 목록이다. */
  async readCampaignWindowRollups(
    transaction: OwnerTransaction,
    scope: AdLedgerReadScope,
  ): Promise<AdWindowRollups<AdCampaignWindowRollup>> {
    const coverage = await this.readAdCoverage(transaction, scope);
    if (scope.activeAccountIds.length === 0) return { coverage, rows: [] };
    const rows = await this.campaignRollups(ownerTransactionClient(transaction), measuredScope(scope, coverage.measuredDates));
    return { coverage, rows };
  }

  /** (캠페인, 광고그룹, 광고 옵션)마다 측정한 날의 합. 캠페인을 주면 그 캠페인만. */
  async readProductWindowRollups(
    transaction: OwnerTransaction,
    scope: AdLedgerReadScope & Readonly<{ campaign?: AdCampaignSelector }>,
  ): Promise<AdWindowRollups<AdProductWindowRollup>> {
    const coverage = await this.readAdCoverage(transaction, scope);
    if (coverage.measuredDates.length === 0) return { coverage, rows: [] };
    const { organizationId, accounts, dates } = measuredScope(scope, coverage.measuredDates);
    const rows = await ownerTransactionClient(transaction).$queryRaw<ProductRollupRow[]>(Prisma.sql`
      WITH sums AS (
        SELECT p.channel_account_id, p.campaign_id, p.ad_group_id, p.vendor_item_id,
          (array_agg(p.listing_id::text ORDER BY p.date DESC) FILTER (WHERE p.listing_id IS NOT NULL))[1] AS listing_id,
          (array_agg(p.option_name ORDER BY p.date DESC) FILTER (WHERE p.option_name IS NOT NULL))[1] AS option_name,
          COUNT(DISTINCT p.date)::int AS days,
          ${PRODUCT_SUMS_SQL}
        FROM channel_ad_product_daily_snapshots p
        WHERE p.organization_id = ${organizationId}::uuid
          AND p.channel_account_id = ANY(${accounts}::uuid[])
          AND p.date = ANY(${dates}::date[])
          ${campaignFilter('p', scope.campaign)}
        GROUP BY p.channel_account_id, p.campaign_id, p.ad_group_id, p.vendor_item_id
      ), ads AS (
        SELECT a.channel_account_id, a.campaign_id, a.ad_group_id, a.vendor_item_id,
          bool_or(a.is_active) AS is_active, MAX(a.status) AS status
        FROM channel_ad_campaign_ads a
        WHERE a.organization_id = ${organizationId}::uuid
          AND a.channel_account_id = ANY(${accounts}::uuid[])
        GROUP BY a.channel_account_id, a.campaign_id, a.ad_group_id, a.vendor_item_id
      )
      SELECT s.*, c.name AS campaign_name, ads.is_active, ads.status
      FROM sums s
      LEFT JOIN channel_ad_campaigns c
        ON c.organization_id = ${organizationId}::uuid
        AND c.channel_account_id = s.channel_account_id AND c.campaign_id = s.campaign_id
      LEFT JOIN ads
        ON ads.channel_account_id = s.channel_account_id AND ads.campaign_id = s.campaign_id
        AND ads.ad_group_id = s.ad_group_id AND ads.vendor_item_id = s.vendor_item_id
      ORDER BY s.channel_account_id, s.campaign_id, s.ad_group_id, s.vendor_item_id
    `);
    return {
      coverage,
      rows: rows.map((row) => ({
        channelAccountId: row.channel_account_id,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        adGroupId: row.ad_group_id,
        vendorItemId: row.vendor_item_id,
        listingId: row.listing_id,
        optionName: row.option_name,
        isActive: row.is_active,
        status: row.status,
        days: row.days,
        ...performanceSums(row),
      })),
    };
  }

  /** 키워드마다 측정한 날의 일별 행 합(고른 기간 그대로). 비검색(`keyword ''`)은 한 옵션의 마지막 줄. */
  async readKeywordWindowRollups(
    transaction: OwnerTransaction,
    scope: AdLedgerReadScope & Readonly<{ campaign?: AdCampaignSelector }>,
  ): Promise<AdWindowRollups<AdKeywordWindowRollup>> {
    const coverage = await this.readAdCoverage(transaction, scope);
    if (coverage.measuredDates.length === 0) return { coverage, rows: [] };
    const rows = await this.keywordRollups(
      ownerTransactionClient(transaction),
      measuredScope(scope, coverage.measuredDates),
      scope.campaign,
    );
    return { coverage, rows };
  }

  /** 규칙 입력: 조직 측정일 가운데 최근 `recentMeasuredDays`개로 캠페인·키워드 합을 읽는다. */
  async readCurrentAdTargets(
    transaction: OwnerTransaction,
    scope: Omit<AdLedgerReadScope, 'from' | 'to'> & Readonly<{ recentMeasuredDays?: number }>,
  ): Promise<AdCurrentTargets> {
    const coverage = await this.readAdCoverage(transaction, {
      organizationId: scope.organizationId,
      activeAccountIds: scope.activeAccountIds,
    });
    const measuredDates = coverage.measuredDates.slice(-(scope.recentMeasuredDays ?? AD_RULE_RECENT_MEASURED_DAYS));
    if (measuredDates.length === 0) {
      return { measuredDates: [], latestMeasuredDate: null, campaigns: [], keywords: [] };
    }
    const tx = ownerTransactionClient(transaction);
    const measured = measuredScope(scope, measuredDates);
    return {
      measuredDates,
      latestMeasuredDate: measuredDates.at(-1) ?? null,
      campaigns: await this.campaignRollups(tx, measured),
      keywords: await this.keywordRollups(tx, measured),
    };
  }

  private async campaignRollups(tx: Prisma.TransactionClient, scope: MeasuredScope): Promise<AdCampaignWindowRollup[]> {
    const rows = await tx.$queryRaw<CampaignRollupRow[]>(Prisma.sql`
      WITH sums AS (
        SELECT p.channel_account_id, p.campaign_id,
          ${PRODUCT_SUMS_SQL},
          COALESCE(array_agg(DISTINCT p.listing_id::text) FILTER (WHERE p.listing_id IS NOT NULL), '{}') AS listing_ids,
          array_agg(DISTINCT p.vendor_item_id) AS vendor_item_ids
        FROM channel_ad_product_daily_snapshots p
        WHERE p.organization_id = ${scope.organizationId}::uuid
          AND p.channel_account_id = ANY(${scope.accounts}::uuid[])
          AND p.date = ANY(${scope.dates}::date[])
        GROUP BY p.channel_account_id, p.campaign_id
      )
      SELECT c.channel_account_id, c.campaign_id, c.name, c.is_active, c.status, c.budget,
        c.roas_target::float8 AS roas_target,
        COALESCE(s.spend, 0) AS spend, COALESCE(s.billed_spend, 0) AS billed_spend,
        COALESCE(s.revenue, 0) AS revenue, COALESCE(s.impressions, 0) AS impressions,
        COALESCE(s.clicks, 0) AS clicks, COALESCE(s.orders, 0) AS orders, COALESCE(s.units, 0) AS units,
        COALESCE(s.listing_ids, '{}') AS listing_ids, COALESCE(s.vendor_item_ids, '{}') AS vendor_item_ids
      FROM channel_ad_campaigns c
      LEFT JOIN sums s ON s.channel_account_id = c.channel_account_id AND s.campaign_id = c.campaign_id
      WHERE c.organization_id = ${scope.organizationId}::uuid
        AND c.channel_account_id = ANY(${scope.accounts}::uuid[])
        AND c.deleted_at IS NULL
      ORDER BY c.channel_account_id, c.campaign_id
    `);
    return rows.map((row) => ({
      channelAccountId: row.channel_account_id,
      campaignId: row.campaign_id,
      campaignName: row.name,
      isActive: row.is_active,
      status: row.status,
      budget: row.budget,
      roasTarget: row.roas_target,
      listingIds: [...row.listing_ids].sort(),
      vendorItemIds: [...row.vendor_item_ids].sort(),
      ...performanceSums(row),
    }));
  }

  private async keywordRollups(
    tx: Prisma.TransactionClient,
    scope: MeasuredScope,
    campaign?: AdCampaignSelector,
  ): Promise<AdKeywordWindowRollup[]> {
    const rows = await tx.$queryRaw<KeywordRollupRow[]>(Prisma.sql`
      WITH sums AS (
        SELECT k.channel_account_id, k.campaign_id, k.ad_group_id, k.vendor_item_id, k.keyword,
          COUNT(DISTINCT k.date)::int AS days,
          to_char(MAX(k.date), 'YYYY-MM-DD') AS last_date,
          COALESCE(SUM(k.spend), 0)::int AS spend,
          COALESCE(SUM(k.revenue), 0)::int AS revenue,
          COALESCE(SUM(k.impressions), 0)::int AS impressions,
          COALESCE(SUM(k.clicks), 0)::int AS clicks,
          COALESCE(SUM(k.orders), 0)::int AS orders,
          COALESCE(SUM(k.units), 0)::int AS units
        FROM channel_ad_keyword_daily_snapshots k
        WHERE k.organization_id = ${scope.organizationId}::uuid
          AND k.channel_account_id = ANY(${scope.accounts}::uuid[])
          AND k.date = ANY(${scope.dates}::date[])
          ${campaignFilter('k', campaign)}
        GROUP BY k.channel_account_id, k.campaign_id, k.ad_group_id, k.vendor_item_id, k.keyword
      ), listing AS (
        SELECT DISTINCT ON (p.channel_account_id, p.vendor_item_id)
          p.channel_account_id, p.vendor_item_id, p.listing_id::text AS listing_id, p.option_name
        FROM channel_ad_product_daily_snapshots p
        WHERE p.organization_id = ${scope.organizationId}::uuid
          AND p.channel_account_id = ANY(${scope.accounts}::uuid[])
          AND p.vendor_item_id IN (SELECT vendor_item_id FROM sums)
        ORDER BY p.channel_account_id, p.vendor_item_id, (p.listing_id IS NULL), p.date DESC
      )
      SELECT s.*, c.name AS campaign_name, l.listing_id, l.option_name
      FROM sums s
      LEFT JOIN channel_ad_campaigns c
        ON c.organization_id = ${scope.organizationId}::uuid
        AND c.channel_account_id = s.channel_account_id AND c.campaign_id = s.campaign_id
      LEFT JOIN listing l ON l.channel_account_id = s.channel_account_id AND l.vendor_item_id = s.vendor_item_id
      ORDER BY s.channel_account_id, s.campaign_id, s.ad_group_id, s.vendor_item_id, (s.keyword = ''), s.spend DESC, s.keyword
    `);
    return rows.map((row) => ({
      channelAccountId: row.channel_account_id,
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      adGroupId: row.ad_group_id,
      vendorItemId: row.vendor_item_id,
      keyword: row.keyword,
      nonSearch: row.keyword === '',
      listingId: row.listing_id,
      optionName: row.option_name,
      days: row.days,
      lastDate: row.last_date,
      spend: row.spend,
      revenue: row.revenue,
      impressions: row.impressions,
      clicks: row.clicks,
      orders: row.orders,
      units: row.units,
    }));
  }
}

const PRODUCT_SUMS_SQL = Prisma.sql`
  COALESCE(SUM(p.spend), 0)::int AS spend,
  COALESCE(SUM(p.billed_spend), 0)::int AS billed_spend,
  COALESCE(SUM(p.revenue), 0)::int AS revenue,
  COALESCE(SUM(p.impressions), 0)::int AS impressions,
  COALESCE(SUM(p.clicks), 0)::int AS clicks,
  COALESCE(SUM(p.orders), 0)::int AS orders,
  COALESCE(SUM(p.units), 0)::int AS units`;

function measuredScope(
  scope: Readonly<{ organizationId: string; activeAccountIds: readonly string[] }>,
  dates: readonly string[],
): MeasuredScope {
  return { organizationId: scope.organizationId, accounts: [...scope.activeAccountIds], dates: [...dates] };
}

function campaignFilter(alias: 'p' | 'k', campaign: AdCampaignSelector | undefined): Prisma.Sql {
  if (!campaign) return Prisma.empty;
  return alias === 'p'
    ? Prisma.sql`AND p.channel_account_id = ${campaign.channelAccountId}::uuid AND p.campaign_id = ${campaign.campaignId}`
    : Prisma.sql`AND k.channel_account_id = ${campaign.channelAccountId}::uuid AND k.campaign_id = ${campaign.campaignId}`;
}

function performanceSums(row: {
  spend: number; billed_spend: number; revenue: number; impressions: number; clicks: number; orders: number; units: number;
}) {
  return {
    spend: row.spend,
    billedSpend: row.billed_spend,
    revenue: row.revenue,
    impressions: row.impressions,
    clicks: row.clicks,
    orders: row.orders,
    units: row.units,
  };
}

