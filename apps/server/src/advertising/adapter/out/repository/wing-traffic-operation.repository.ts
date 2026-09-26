import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { WingTrafficDay, WingTrafficPlan, WingTrafficRow } from '@kiditem/shared/advertising-operations';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { resolveCoupangVendorId } from '../../../../channels/domain/account/coupang-account-identity';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import { matchListingFromRow, type ListingMap } from '../../../domain/listing-match';
import { omittedListingFirstZeroTrafficDate } from '../../../domain/wing-traffic-omission';
import type {
  WingTrafficOperationRepositoryPort,
  WingTrafficPublication,
} from '../../../application/port/out/repository/wing-traffic-operation.repository.port';

const FILTER_SCOPE = 'ALL_NORMAL_RFM';
const DAILY_PUBLICATION_BATCH_SIZE = 1_000;

type Tx = Prisma.TransactionClient;
type TrafficMetrics = { visitors: number; views: number; cartAdds: number; orders: number; salesQty: number; revenue: number };
type DailyFactPublication = {
  id: string;
  listingId: string;
  externalId: string;
  businessDate: string;
  observedAt: Date;
  metaJson: Record<string, unknown>;
  metrics: TrafficMetrics;
};

/**
 * The zero traffic a daily publication writes for its confirmed days.
 *
 * A zero resets a listing-day Wing owned before and fills a listing-day of a
 * catalog listing the report left out, from that listing's first zero date
 * (`omittedListingFirstZeroTrafficDate`). SQL builds the listing x day product
 * and applies the ownership rules, so a long window never materialises its
 * rows in the application.
 */
type ZeroTrafficPublication = {
  accountListingIds: readonly string[];
  /** Confirmed days with the capture time of their first page. */
  days: ReadonlyArray<Readonly<{ businessDate: string; observedAt: Date }>>;
  /** The account's active listings; a null first zero date means leaving the listing out measures nothing. */
  catalog: ReadonlyArray<Readonly<{ listingId: string; externalId: string; firstZeroDate: string | null }>>;
  /** The `wing.traffic` metadata of every zero row, without its business date. */
  wingMeta: Record<string, unknown>;
};

/**
 * CTEs ending in `wing_zero`, the listing-days a publication zeroes. A
 * listing-day Wing reports keeps its real values, and a day another writer
 * may own is never zeroed:
 * - A row Wing owned before is reset: an account listing whose row carries
 *   Wing's marker or pre-marker Wing metadata, or no metadata but a traffic
 *   observation (a bare item-winner state row has none), or a row an earlier
 *   run of this account published (its `wing.traffic.sourceAttemptId`).
 * - A catalog listing without a row, or with a row no writer owns, gets a zero
 *   on every confirmed day from its first zero date.
 * - Another writer may own a row with a marker other than Wing's. The traffic
 *   CSV upload lane is retired (KID-110), so a past CSV trace protects nothing.
 */
function zeroTrafficSql(
  organizationId: string,
  reported: readonly DailyFactPublication[],
  zero: ZeroTrafficPublication,
): Prisma.Sql {
  const days = JSON.stringify(zero.days.map((day) => ({
    business_date: day.businessDate,
    observed_at: day.observedAt.toISOString(),
  })));
  const catalog = JSON.stringify(zero.catalog.map((listing) => ({
    listing_id: listing.listingId,
    external_id: listing.externalId,
    first_zero_date: listing.firstZeroDate,
  })));
  const reportedKeys = JSON.stringify(reported.map((fact) => ({
    listing_id: fact.listingId,
    business_date: fact.businessDate,
  })));
  return Prisma.sql`,
      confirmed_day AS (
        SELECT day.business_date::date AS business_date,
               day.business_date AS business_key,
               day.observed_at
        FROM jsonb_to_recordset(${days}::jsonb) AS day(business_date text, observed_at timestamptz)
      ),
      catalog_listing AS (
        SELECT listing.listing_id, listing.external_id, listing.first_zero_date
        FROM jsonb_to_recordset(${catalog}::jsonb)
          AS listing(listing_id uuid, external_id text, first_zero_date date)
      ),
      reported_fact AS (
        SELECT fact.listing_id, fact.business_date
        FROM jsonb_to_recordset(${reportedKeys}::jsonb) AS fact(listing_id uuid, business_date date)
      ),
      classified_fact AS (
        SELECT fact.listing_id,
               fact.external_id,
               fact.business_date,
               (fact.meta ? 'traffic.currentSource')
                 AND (fact.meta -> 'traffic.currentSource') IS DISTINCT FROM '"wing.traffic"'::jsonb
                 AS another_writer_may_own,
               (fact.meta -> 'traffic.currentSource') IS NOT DISTINCT FROM '"wing.traffic"'::jsonb
                 OR (
                   NOT (fact.meta ? 'traffic.currentSource')
                   AND (fact.meta ? 'wing.traffic')
                 ) AS wing_is_current,
               (fact.meta = '{}'::jsonb AND fact.traffic_observed_at IS NOT NULL) AS observed_without_metadata,
               CASE WHEN jsonb_typeof(fact.meta -> 'wing.traffic' -> 'sourceAttemptId') = 'string'
                 THEN fact.meta -> 'wing.traffic' ->> 'sourceAttemptId'
               END AS previous_attempt_id
        FROM (
          SELECT daily.listing_id,
                 daily.external_id,
                 daily.business_date,
                 daily.traffic_observed_at,
                 CASE WHEN jsonb_typeof(daily.meta_json) = 'object'
                   THEN daily.meta_json
                   ELSE '{}'::jsonb
                 END AS meta
          FROM channel_listing_daily_snapshots AS daily
          JOIN confirmed_day ON confirmed_day.business_date = daily.business_date
          -- Only this account's listings, active or not, carry its attempts'
          -- rows or take its zeros.
          WHERE daily.organization_id = ${organizationId}::uuid
            AND daily.listing_id = ANY(${[...zero.accountListingIds]}::uuid[])
        ) AS fact
      ),
      reset_fact AS (
        SELECT classified_fact.listing_id, classified_fact.external_id, classified_fact.business_date
        FROM classified_fact
        WHERE NOT classified_fact.another_writer_may_own
          AND (
            (
              classified_fact.listing_id IN (SELECT catalog_listing.listing_id FROM catalog_listing)
              AND (classified_fact.observed_without_metadata OR classified_fact.wing_is_current)
            )
            OR (
              -- A Wing stamp on this account's listing: an earlier run of this
              -- account published it (every row read here is an account listing).
              classified_fact.wing_is_current
              AND classified_fact.previous_attempt_id IS NOT NULL
            )
          )
      ),
      omitted_fact AS (
        SELECT catalog_listing.listing_id, catalog_listing.external_id, confirmed_day.business_date
        FROM catalog_listing
        JOIN confirmed_day ON confirmed_day.business_date >= catalog_listing.first_zero_date
        WHERE NOT EXISTS (
          SELECT 1
          FROM classified_fact
          WHERE classified_fact.listing_id = catalog_listing.listing_id
            AND classified_fact.business_date = confirmed_day.business_date
            AND classified_fact.another_writer_may_own
        )
      ),
      wing_zero AS (
        SELECT zero_fact.listing_id,
               zero_fact.external_id,
               confirmed_day.business_date,
               confirmed_day.observed_at,
               jsonb_build_object(
                 'wing.traffic',
                 ${JSON.stringify(zero.wingMeta)}::jsonb
                   || jsonb_build_object('businessDate', confirmed_day.business_key),
                 'traffic.currentSource',
                 'wing.traffic'
               ) AS meta_json
        FROM (
          SELECT reset_fact.listing_id, reset_fact.external_id, reset_fact.business_date
          FROM reset_fact
          UNION ALL
          SELECT omitted_fact.listing_id, omitted_fact.external_id, omitted_fact.business_date
          FROM omitted_fact
          WHERE NOT EXISTS (
            SELECT 1
            FROM reset_fact
            WHERE reset_fact.listing_id = omitted_fact.listing_id
              AND reset_fact.business_date = omitted_fact.business_date
          )
        ) AS zero_fact
        JOIN confirmed_day ON confirmed_day.business_date = zero_fact.business_date
        WHERE NOT EXISTS (
          SELECT 1
          FROM reported_fact
          WHERE reported_fact.listing_id = zero_fact.listing_id
            AND reported_fact.business_date = zero_fact.business_date
        )
      )`;
}

async function upsertDailyFactPublication(
  tx: Tx,
  organizationId: string,
  operationId: string,
  rows: readonly DailyFactPublication[],
  publishedAt: Date,
  zeroTraffic?: ZeroTrafficPublication,
): Promise<void> {
  // The zero rows ride with the first batch: the facts still land in bounded
  // INSERT statements, and no statement writes one listing-day twice.
  const statementCount = Math.max(
    zeroTraffic ? 1 : 0,
    Math.ceil(rows.length / DAILY_PUBLICATION_BATCH_SIZE),
  );
  for (let index = 0; index < statementCount; index += 1) {
    const offset = index * DAILY_PUBLICATION_BATCH_SIZE;
    const batch = rows.slice(offset, offset + DAILY_PUBLICATION_BATCH_SIZE);
    const zero = index === 0 ? zeroTraffic : undefined;
    const payload = JSON.stringify(batch.map((row) => ({
      id: row.id,
      listing_id: row.listingId,
      external_id: row.externalId,
      business_date: row.businessDate,
      observed_at: row.observedAt.toISOString(),
      meta_json: row.metaJson,
      traffic_visitors: row.metrics.visitors,
      traffic_views: row.metrics.views,
      traffic_cart_adds: row.metrics.cartAdds,
      traffic_orders: row.metrics.orders,
      traffic_sales_qty: row.metrics.salesQty,
      traffic_revenue: row.metrics.revenue,
      traffic_observed_at: row.observedAt.toISOString(),
      published_at: publishedAt.toISOString(),
    })));
    await tx.$executeRaw(Prisma.sql`
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset(${payload}::jsonb) AS record(
          id uuid,
          listing_id uuid,
          external_id text,
          business_date date,
          observed_at timestamptz,
          meta_json jsonb,
          traffic_visitors integer,
          traffic_views integer,
          traffic_cart_adds integer,
          traffic_orders integer,
          traffic_sales_qty integer,
          traffic_revenue integer,
          traffic_observed_at timestamptz,
          published_at timestamptz
        )
      )${zero ? zeroTrafficSql(organizationId, rows, zero) : Prisma.empty}
      INSERT INTO channel_listing_daily_snapshots AS daily (
        id,
        organization_id,
        listing_id,
        channel,
        external_id,
        business_date,
        sample_count,
        first_observed_at,
        last_observed_at,
        operation_id,
        meta_json,
        traffic_visitors,
        traffic_views,
        traffic_cart_adds,
        traffic_orders,
        traffic_sales_qty,
        traffic_revenue,
        traffic_observed_at,
        created_at,
        updated_at
      )
      SELECT
        incoming.id,
        ${organizationId}::uuid,
        incoming.listing_id,
        'coupang',
        incoming.external_id,
        incoming.business_date,
        1,
        incoming.observed_at,
        incoming.observed_at,
        ${operationId}::uuid,
        incoming.meta_json,
        incoming.traffic_visitors,
        incoming.traffic_views,
        incoming.traffic_cart_adds,
        incoming.traffic_orders,
        incoming.traffic_sales_qty,
        incoming.traffic_revenue,
        incoming.traffic_observed_at,
        incoming.published_at,
        incoming.published_at
      FROM incoming
      ${zero ? Prisma.sql`UNION ALL
      SELECT
        gen_random_uuid(),
        ${organizationId}::uuid,
        wing_zero.listing_id,
        'coupang',
        wing_zero.external_id,
        wing_zero.business_date,
        1,
        wing_zero.observed_at,
        wing_zero.observed_at,
        ${operationId}::uuid,
        wing_zero.meta_json,
        0,
        0,
        0,
        0,
        0,
        0,
        wing_zero.observed_at,
        ${publishedAt.toISOString()}::timestamptz,
        ${publishedAt.toISOString()}::timestamptz
      FROM wing_zero` : Prisma.empty}
      ON CONFLICT (organization_id, listing_id, business_date)
      -- A row another source wrote keeps its sample_count, last_observed_at
      -- and operation_id: they record the listing-state observations, and
      -- traffic publication changes only its own columns. Traffic provenance is
      -- wing.traffic.sourceAttemptId (the operation id).
      DO UPDATE SET
        traffic_visitors = EXCLUDED.traffic_visitors,
        traffic_views = EXCLUDED.traffic_views,
        traffic_cart_adds = EXCLUDED.traffic_cart_adds,
        traffic_orders = EXCLUDED.traffic_orders,
        traffic_sales_qty = EXCLUDED.traffic_sales_qty,
        traffic_revenue = EXCLUDED.traffic_revenue,
        traffic_observed_at = EXCLUDED.traffic_observed_at,
        meta_json = COALESCE(daily.meta_json, '{}'::jsonb) || EXCLUDED.meta_json,
        updated_at = EXCLUDED.updated_at
    `);
  }
}

/**
 * Wing 일별 트래픽 원장 쓰기(KID-362). 옛 `ad-traffic-source.repository.ts`의 발행(행 합산 + 0 채우기 SQL)을 그대로
 * 옮기되, 행은 스테이징 스냅샷이 아니라 실행 청크에서 오고 listing 맞춤은 finish 트랜잭션의 카탈로그로 한다.
 * 새 행은 `operation_id`를 갖고 `raw_snapshot_id`는 비어 있다. 트래픽 출처는 `wing.traffic.sourceAttemptId`(실행 id).
 */
@Injectable()
export class WingTrafficOperationRepository implements WingTrafficOperationRepositoryPort {
  constructor(
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    private readonly prisma: PrismaService,
  ) {}

  async readAccount(organizationId: string, channelAccountId: string, transaction?: OwnerTransaction) {
    const account = await this.channelAccounts.resolveActiveProvider(transaction ?? ownerTransaction(this.prisma), {
      organizationId,
      channel: 'coupang',
      accountId: channelAccountId,
    });
    if (!account || account.id !== channelAccountId) return null;
    return { id: account.id, vendorId: resolveCoupangVendorId(account) };
  }

  async publish(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      operationId: string;
      startedAt: Date;
      plan: WingTrafficPlan;
      confirmedDays: readonly WingTrafficDay[];
      rows: readonly WingTrafficRow[];
    },
  ): Promise<WingTrafficPublication> {
    const tx = ownerTransactionClient(transaction);
    const accountCatalog = await this.channelListings.readCatalogFacts(transaction, {
      organizationId: input.organizationId,
      accountIds: [input.plan.channelAccountId],
    });
    const activeCatalog = accountCatalog.filter((listing) => listing.isActive);
    const map = listingMap(input.plan.channelAccountId, activeCatalog);
    const observedAtByDate = new Map(input.confirmedDays.map((day) => [day.businessDate, new Date(day.capturedAt)]));

    const aggregates = new Map<string, { listingId: string; externalId: string; businessDate: string; metrics: TrafficMetrics }>();
    const unmatchedOptionIdsByDate: Record<string, string[]> = {};
    let matchedCount = 0;
    for (const row of input.rows) {
      const match = matchListingFromRow({ vendorItemId: row.vendorItemId, productId: row.productId ?? undefined }, map);
      if (!match.listingId) {
        (unmatchedOptionIdsByDate[row.businessDate] ??= []).push(row.vendorItemId);
        continue;
      }
      matchedCount += 1;
      const key = `${match.listingId}:${row.businessDate}`;
      const current = aggregates.get(key);
      if (current) {
        for (const metric of METRICS) current.metrics[metric] += row[metric];
      } else {
        aggregates.set(key, {
          listingId: match.listingId,
          externalId: match.externalId ?? '',
          businessDate: row.businessDate,
          metrics: Object.fromEntries(METRICS.map((metric) => [metric, row[metric]])) as TrafficMetrics,
        });
      }
    }
    const wingMeta = {
      grain: 'listing_option_sum',
      scope: 'matched_listings',
      periodDays: 1,
      sourceAttemptId: input.operationId,
      providerVendorId: input.plan.vendorId,
      filterScope: FILTER_SCOPE,
      targetUrl: null,
    };
    const reported = [...aggregates.values()].map((aggregate): DailyFactPublication => ({
      id: randomUUID(),
      listingId: aggregate.listingId,
      externalId: aggregate.externalId,
      businessDate: aggregate.businessDate,
      observedAt: observedAtByDate.get(aggregate.businessDate)!,
      metaJson: {
        'wing.traffic': {
          ...wingMeta,
          businessDate: aggregate.businessDate,
          derivedConversionRate: aggregate.metrics.views !== 0
            ? Math.round((aggregate.metrics.orders / aggregate.metrics.views) * 10000) / 100
            : null,
        },
        'traffic.currentSource': 'wing.traffic',
      },
      metrics: aggregate.metrics,
    }));
    // 보고된 listing-day는 실제 값, 앞서 Wing이 쓴 날은 초기화, 보고서가 빠뜨린 카탈로그 리스팅은 첫 0 날부터 0.
    await upsertDailyFactPublication(tx, input.organizationId, input.operationId, reported, new Date(), {
      accountListingIds: accountCatalog.map((listing) => listing.id),
      days: input.confirmedDays.map((day) => ({ businessDate: day.businessDate, observedAt: new Date(day.capturedAt) })),
      catalog: activeCatalog.map((listing) => ({
        listingId: listing.id,
        externalId: listing.externalId,
        firstZeroDate: omittedListingFirstZeroTrafficDate({
          listing: { createdAt: listing.createdAt, createdOn: createdOnOf(listing.rawJson), salesProductId: listing.salesProductId },
          collectionStartedAt: input.startedAt,
        }),
      })),
      wingMeta,
    });
    return { matchedCount, unmatchedCount: input.rows.length - matchedCount, unmatchedOptionIdsByDate };
  }

}

const METRICS = ['visitors', 'views', 'cartAdds', 'orders', 'salesQty', 'revenue'] as const;

function createdOnOf(rawJson: unknown): string | null {
  return rawJson && typeof rawJson === 'object' && !Array.isArray(rawJson)
    && typeof (rawJson as Record<string, unknown>).createdOn === 'string'
    ? (rawJson as Record<string, string>).createdOn
    : null;
}

function listingMap(
  channelAccountId: string,
  listings: ReadonlyArray<{ id: string; externalId: string; options: ReadonlyArray<{ id: string; externalOptionId: string | null }> }>,
): ListingMap {
  return {
    channelAccountId,
    externalIdMap: new Map(listings.map((listing) => [listing.externalId, { listingId: listing.id }])),
    externalOptionIdMap: new Map(listings.flatMap((listing) =>
      listing.options
        .filter((option) => option.externalOptionId)
        .map((option) => [option.externalOptionId!, { listingId: listing.id, listingOptionId: option.id, externalId: listing.externalId }] as const))),
  };
}
