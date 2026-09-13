import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { deriveSourceReadiness } from '@kiditem/shared/source-readiness';
import {
  AdTrafficSourceAttemptSchema,
  AdTrafficSourcePlanSchema,
  AdTrafficSourcePublishedSchema,
  AdTrafficSourceReceiptSchema,
  AdTrafficSourceStatusSchema,
  type AdTrafficSourceAttempt,
  type AdTrafficSourceBegin,
  type AdTrafficSourceControl,
  type AdTrafficSourceDailyPlan,
  type AdTrafficSourceDailyReceiptInput,
  type AdTrafficSourceLegacyReceiptInput,
  type AdTrafficSourceLegacyPlan,
  type AdTrafficSourcePeriodReceiptInput,
  type AdTrafficSourcePlan,
  type AdTrafficSourceReceipt,
  type AdTrafficSourceReceiptInput,
  type AdTrafficSourceStatus,
  type AdTrafficSourcePublished,
} from '@kiditem/shared/advertising';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { canonicalOwnerInputHash as hash } from '../../../../common/owner-idempotency-key';
import { isNewerAttempt } from '../../../../common/current-row';
import { resolveCoupangVendorId } from '../../../../channels/domain/coupang-account-identity';
import {
  addDays,
  businessDateKey,
  datesInclusive,
  evidenceCutoffDate,
  inclusiveDayCount,
  toBusinessDate,
} from '../../../../common/kst';
import {
  matchListingFromRow,
  matchStatusOf,
  pickStringField,
  type ListingMap,
} from '../../../domain/listing-match';
import {
  buildNamespacedMetaForCreate,
  mergeNamespacedMetaJson,
} from './daily-fact-helpers';
import type {
  AdTrafficReadPort,
  AdTrafficSourcePort,
} from '../../../application/port/in/ad-traffic-source.port';

const SOURCE_TYPE = 'coupang_wing_traffic';
const SNAPSHOT_SOURCE = 'wing';
const SNAPSHOT_PAGE_TYPE = 'traffic';
const LEGACY_PARSER_VERSION = 'wing-traffic-v1';
const PARSER_VERSION = 'wing-traffic-daily-v2';
const LEGACY_RECEIPT_KIND = 'traffic_page';
const RECEIPT_KIND = 'traffic_daily_v2';
const WING_TRAFFIC_PATH = '/tenants/business-insight/sales-analysis';
const EXPIRES_IN_MS = 30 * 60_000;
const MAX_RANGE_DAYS = 366;
const DAILY_PUBLICATION_BATCH_SIZE = 1_000;

type Tx = Prisma.TransactionClient;
type SourceRun = Prisma.SourceImportRunGetPayload<{}>;
type TrafficRow = Record<string, unknown>;
type ReceiptEntry = {
  receipt: AdTrafficSourceReceipt;
  input: AdTrafficSourceReceiptInput;
};
type UploadFailure = { __trafficUploadFailure: true; code: string };
type DailyFactPublication = {
  id: string;
  listingId: string;
  externalId: string;
  businessDate: string;
  observedAt: Date;
  rawSnapshotId: string | null;
  metaJson: Record<string, unknown>;
  metrics: {
    visitors: number;
    views: number;
    cartAdds: number;
    orders: number;
    salesQty: number;
    revenue: number;
  };
};
function isDailyPlan(plan: AdTrafficSourcePlan): plan is AdTrafficSourceDailyPlan {
  return plan.parserVersion === PARSER_VERSION;
}

function isDailyReceipt(
  receipt: AdTrafficSourceReceiptInput,
): receipt is AdTrafficSourceDailyReceiptInput {
  return 'kind' in receipt && receipt.kind === 'daily_page';
}

function isPeriodReceipt(
  receipt: AdTrafficSourceReceiptInput,
): receipt is AdTrafficSourcePeriodReceiptInput {
  return 'kind' in receipt && receipt.kind === 'period_summary';
}

function isLegacyReceiptInput(
  receipt: AdTrafficSourceReceiptInput,
): receipt is AdTrafficSourceLegacyReceiptInput {
  return !('kind' in receipt);
}

function isPageReceipt(
  receipt: AdTrafficSourceReceipt,
): receipt is Extract<AdTrafficSourceReceipt, { expectedPages: number }> {
  return 'expectedPages' in receipt;
}

function receiptChunkKind(plan: AdTrafficSourcePlan): string {
  return isDailyPlan(plan) ? RECEIPT_KIND : LEGACY_RECEIPT_KIND;
}

function isWingTrafficUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.hostname === 'wing.coupang.com'
      && parsed.port === ''
      && parsed.username === ''
      && parsed.password === ''
      && parsed.pathname === WING_TRAFFIC_PATH;
  } catch {
    return false;
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function dateAtUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseReadDate(value: string | undefined, code: string): Date | undefined {
  if (value === undefined) return undefined;
  const parsed = toBusinessDate(value);
  if (!parsed || businessDateKey(parsed) !== value) throw new BadRequestException(code);
  return parsed;
}

function expired(row: SourceRun): boolean {
  return row.status === 'running' && (!row.expiresAt || row.expiresAt.getTime() <= Date.now());
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function declaredConfirmedDates(value: Prisma.JsonValue | null): string[] {
  const dates = asRecord(value).confirmedDates;
  if (!Array.isArray(dates)) return [];
  return dates.filter((candidate): candidate is string => {
    if (typeof candidate !== 'string') return false;
    const parsed = toBusinessDate(candidate);
    return parsed !== null && businessDateKey(parsed) === candidate;
  });
}

function datesInRange(start: Date, end: Date): number {
  return inclusiveDayCount(start, end);
}

function datesBetween(start: Date, end: Date): string[] {
  const count = datesInRange(start, end);
  if (count < 1 || count > MAX_RANGE_DAYS) return [];
  return datesInclusive(start, end).map(businessDateKey);
}

function accountSummaryFromRecord(value: Record<string, unknown>) {
  const fields = ['visitors', 'views', 'cartAdds', 'orders', 'salesQty', 'revenue'] as const;
  if (fields.some((field) => typeof value[field] !== 'number' || !Number.isSafeInteger(value[field]))) {
    return null;
  }
  const providerConversionRate = value.providerConversionRate;
  if (providerConversionRate !== null
    && providerConversionRate !== undefined
    && (typeof providerConversionRate !== 'number' || !Number.isFinite(providerConversionRate))) {
    return null;
  }
  return {
    visitors: value.visitors as number,
    views: value.views as number,
    cartAdds: value.cartAdds as number,
    orders: value.orders as number,
    salesQty: value.salesQty as number,
    revenue: value.revenue as number,
    providerConversionRate: (providerConversionRate ?? null) as number | null,
  };
}

const ACCOUNT_SUMMARY_RAW_FIELDS = [
  ['visitors', 'totalUniqueVisitor'],
  ['views', 'totalPageViews'],
  ['cartAdds', 'totalAddToCart'],
  ['orders', 'totalOrders'],
  ['salesQty', 'totalUnitsSold'],
  ['revenue', 'totalGmv'],
] as const;

function finiteRawNumber(value: unknown): number | null {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : NaN;
  return Number.isFinite(number) ? number : null;
}

function accountSummaryMatchesRaw(
  summary: Record<string, unknown>,
  raw: Record<string, unknown>,
): boolean {
  const metrics = asRecord(raw.summaryMetrics);
  for (const [normalizedField, providerField] of ACCOUNT_SUMMARY_RAW_FIELDS) {
    const normalized = summary[normalizedField];
    if (!Object.prototype.hasOwnProperty.call(metrics, providerField)) return false;
    const provider = finiteRawNumber(metrics[providerField]);
    if (provider === null || !Number.isSafeInteger(provider) || provider !== normalized) {
      return false;
    }
  }
  const normalizedRate = summary.providerConversionRate;
  // Wing omits pvToOrder when the optional auxiliary field is unavailable;
  // the collector normalizes both omission and explicit null to null.
  if (!Object.prototype.hasOwnProperty.call(metrics, 'pvToOrder')) return normalizedRate === null;
  const providerRate = metrics.pvToOrder === null ? null : finiteRawNumber(metrics.pvToOrder);
  if (normalizedRate === null) return metrics.pvToOrder === null;
  if (typeof normalizedRate !== 'number' || !Number.isFinite(normalizedRate)) return false;
  return providerRate !== null && Math.abs(providerRate * 100 - normalizedRate) < 1e-9;
}

function positiveWingOptionId(value: string): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  try {
    return BigInt(value.trim()) > 0n;
  } catch {
    return false;
  }
}

function buildReconciliation(
  accountDaily: Array<Record<string, unknown>>,
  periodSummary: Record<string, unknown> | null,
  options: { forceUnverified?: boolean } = {},
) {
  const metrics = ['views', 'cartAdds', 'orders', 'salesQty', 'revenue'] as const;
  const period = periodSummary ? accountSummaryFromRecord(
    asRecord(periodSummary.accountSummary),
  ) : null;
  return Object.fromEntries(metrics.map((metricName) => {
    // A day whose summary lacks this metric makes the sum unmeasured, not a
    // smaller measured total.
    const dailySum = accountDaily.every((row) => typeof row[metricName] === 'number')
      ? accountDaily.reduce((sum, row) => sum + (row[metricName] as number), 0)
      : null;
    const periodValue = period?.[metricName] ?? null;
    return [metricName, {
      status: options.forceUnverified || periodValue === null || dailySum === null
        ? 'UNVERIFIED'
        : dailySum === periodValue ? 'MATCHED' : 'MISMATCH',
      dailySum,
      periodValue,
    }];
  }));
}

const TRAFFIC_METRIC_KEYS = [
  'visitors',
  'views',
  'cartAdds',
  'orders',
  'salesQty',
  'revenue',
] as const;

function assertTrafficMetrics(row: TrafficRow): void {
  for (const key of TRAFFIC_METRIC_KEYS) {
    const value = row[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new ConflictException('TRAFFIC_METRIC_INVALID');
    }
  }
}

function trafficMetrics(row: TrafficRow) {
  assertTrafficMetrics(row);
  return {
    visitors: row.visitors as number,
    views: row.views as number,
    cartAdds: row.cartAdds as number,
    orders: row.orders as number,
    salesQty: row.salesQty as number,
    revenue: row.revenue as number,
  };
}

async function upsertDailyFactPublication(
  tx: Tx,
  organizationId: string,
  rows: readonly DailyFactPublication[],
  publishedAt: Date,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += DAILY_PUBLICATION_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + DAILY_PUBLICATION_BATCH_SIZE);
    const payload = JSON.stringify(batch.map((row) => ({
      id: row.id,
      listing_id: row.listingId,
      external_id: row.externalId,
      business_date: row.businessDate,
      observed_at: row.observedAt.toISOString(),
      raw_snapshot_id: row.rawSnapshotId,
      meta_json: row.metaJson,
      traffic_visitors: row.metrics.visitors,
      traffic_views: row.metrics.views,
      traffic_cart_adds: row.metrics.cartAdds,
      traffic_orders: row.metrics.orders,
      traffic_sales_qty: row.metrics.salesQty,
      traffic_revenue: row.metrics.revenue,
      traffic_coverage_status: 'OBSERVED',
      traffic_observed_at: row.observedAt.toISOString(),
      published_at: publishedAt.toISOString(),
    })));
    await tx.$executeRaw(Prisma.sql`
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
        raw_snapshot_id,
        meta_json,
        traffic_visitors,
        traffic_views,
        traffic_cart_adds,
        traffic_orders,
        traffic_sales_qty,
        traffic_revenue,
        traffic_coverage_status,
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
        incoming.raw_snapshot_id,
        incoming.meta_json,
        incoming.traffic_visitors,
        incoming.traffic_views,
        incoming.traffic_cart_adds,
        incoming.traffic_orders,
        incoming.traffic_sales_qty,
        incoming.traffic_revenue,
        incoming.traffic_coverage_status,
        incoming.traffic_observed_at,
        incoming.published_at,
        incoming.published_at
      FROM jsonb_to_recordset(${payload}::jsonb) AS incoming(
        id uuid,
        listing_id uuid,
        external_id text,
        business_date date,
        observed_at timestamptz,
        raw_snapshot_id uuid,
        meta_json jsonb,
        traffic_visitors integer,
        traffic_views integer,
        traffic_cart_adds integer,
        traffic_orders integer,
        traffic_sales_qty integer,
        traffic_revenue integer,
        traffic_coverage_status text,
        traffic_observed_at timestamptz,
        published_at timestamptz
      )
      ON CONFLICT (organization_id, listing_id, business_date)
      DO UPDATE SET
        sample_count = EXCLUDED.sample_count,
        last_observed_at = EXCLUDED.last_observed_at,
        raw_snapshot_id = EXCLUDED.raw_snapshot_id,
        traffic_visitors = EXCLUDED.traffic_visitors,
        traffic_views = EXCLUDED.traffic_views,
        traffic_cart_adds = EXCLUDED.traffic_cart_adds,
        traffic_orders = EXCLUDED.traffic_orders,
        traffic_sales_qty = EXCLUDED.traffic_sales_qty,
        traffic_revenue = EXCLUDED.traffic_revenue,
        traffic_coverage_status = EXCLUDED.traffic_coverage_status,
        traffic_observed_at = EXCLUDED.traffic_observed_at,
        meta_json = COALESCE(daily.meta_json, '{}'::jsonb) || EXCLUDED.meta_json,
        updated_at = EXCLUDED.updated_at
    `);
  }
}

@Injectable()
export class AdTrafficSourceRepository implements AdTrafficSourcePort, AdTrafficReadPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
    request: AdTrafficSourceBegin;
  }): Promise<AdTrafficSourceAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const requestFingerprint = hash(input.request);
      const replay = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint) {
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        }
        const row = expired(replay)
          ? await this.failIn(
              tx,
              replay,
              'ATTEMPT_EXPIRED',
              'Wing traffic collection expired.',
            )
          : replay;
        return this.attemptView(tx, row);
      }

      const account = await this.primaryAccount(
        tx,
        input.organizationId,
        input.request.channelAccountId,
      );
      if (!account) throw new NotFoundException('COUPANG_ACCOUNT_NOT_FOUND');
      const expectedAdvertiserId = resolveCoupangVendorId(account);
      if (!expectedAdvertiserId) throw new BadRequestException('ADVERTISER_IDENTITY_MISSING');

      const running = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: account.id,
          status: 'running',
        },
      });
      if (running) {
        if (!expired(running)) {
          throw new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: running.id });
        }
        await this.failIn(
          tx,
          running,
          'ATTEMPT_EXPIRED',
          'Wing traffic collection expired.',
        );
      }

      const plan = this.planFor(input.request, account.id, expectedAdvertiserId);
      const previous = await tx.sourceImportRun.aggregate({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: account.id,
        },
        _max: { freshnessGeneration: true },
      });
      const row = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: account.id,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          attemptToken: randomUUID(),
          plan: json(plan),
          parserVersion: PARSER_VERSION,
          freshnessGeneration: (previous._max.freshnessGeneration ?? 0n) + 1n,
          expiresAt: new Date(Date.now() + EXPIRES_IN_MS),
          coverageStartDate: dateAtUtc(plan.startDate),
          coverageEndDate: dateAtUtc(plan.endDate),
        },
      });
      await tx.channelScrapeRun.create({
        data: {
          organizationId: input.organizationId,
          channelAccountId: account.id,
          sourceImportRunId: row.id,
          channel: 'coupang',
          source: SNAPSHOT_SOURCE,
          pageType: SNAPSHOT_PAGE_TYPE,
          parserVersion: PARSER_VERSION,
          businessDate: dateAtUtc(plan.businessDate),
          periodStart: dateAtUtc(plan.startDate),
          periodEnd: dateAtUtc(plan.endDate),
          targetUrl: plan.targetUrl,
          period: String(plan.periodDays),
          metaJson: json({
            expectedAdvertiserId,
            providerVendorId: plan.providerVendorId,
            filterScope: plan.filterScope,
            expectedDates: plan.expectedDates,
          }),
        },
      });
      return this.attemptView(tx, row);
    });
  }

  async readSourceStatus(input: {
    organizationId: string;
    channelAccountId?: string;
  }): Promise<AdTrafficSourceStatus> {
    return this.prisma.$transaction(
      (tx) => this.sourceStatusIn(tx, input.organizationId, input.channelAccountId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdTrafficSourceAttempt | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await this.findOptional(tx, input.organizationId, input.attemptId);
        return row ? this.attemptView(tx, row) : null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdTrafficSourceControl | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await this.findOptional(tx, input.organizationId, input.attemptId);
        if (!row) return null;
        const entries = await this.receiptsIn(tx, row);
        return {
          ...attemptView(row, entries),
          attemptToken: row.attemptToken,
          receipts: entries.map((entry) => entry.receipt),
        } satisfies AdTrafficSourceControl;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readPublished(input: {
    organizationId: string;
    channelAccountId?: string;
    from?: string;
    to?: string;
  }): Promise<AdTrafficSourcePublished> {
    return this.prisma.$transaction(
      async (tx) => {
        const from = parseReadDate(input.from, 'INVALID_TRAFFIC_FROM_DATE');
        const to = parseReadDate(input.to, 'INVALID_TRAFFIC_TO_DATE');
        if (from && to && from.getTime() > to.getTime()) {
          throw new BadRequestException('INVALID_TRAFFIC_DATE_RANGE');
        }
        const account = await this.primaryAccount(tx, input.organizationId, input.channelAccountId);
        if (!account) throw new NotFoundException('COUPANG_ACCOUNT_NOT_FOUND');
        const runs = await tx.sourceImportRun.findMany({
          where: {
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
            channelAccountId: account.id,
            status: 'completed',
          },
          orderBy: [{ freshnessGeneration: 'desc' }, { createdAt: 'desc' }],
        });
        if (!runs.length) throw new NotFoundException('AD_TRAFFIC_SOURCE_MISSING');
        const parsedRuns = runs.map((run) => ({ run, plan: AdTrafficSourcePlanSchema.parse(run.plan) }));
        const dailyRuns = parsedRuns.filter(
          (candidate): candidate is { run: typeof runs[number]; plan: AdTrafficSourceDailyPlan } =>
            isDailyPlan(candidate.plan),
        );
        if (dailyRuns.length) {
          const legacyRuns = parsedRuns.filter(
            (candidate): candidate is { run: typeof runs[number]; plan: AdTrafficSourceLegacyPlan } =>
              !isDailyPlan(candidate.plan),
          );
          return readDailyPublished(
            tx,
            account.id,
            input.organizationId,
            dailyRuns,
            from,
            to,
            legacyRuns,
          );
        }
        const legacy = parsedRuns[0]!;
        return readLegacyPublished(
          tx,
          account.id,
          input.organizationId,
          legacy.run,
          legacy.plan as AdTrafficSourceLegacyPlan,
          from,
          to,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async uploadReceipt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    sequence: number;
    receipt: AdTrafficSourceReceiptInput;
  }): Promise<AdTrafficSourceReceipt> {
    const result = await this.prisma.$transaction<AdTrafficSourceReceipt | UploadFailure>(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.find(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      const run = await this.scrapeRun(tx, row);
      const plan = AdTrafficSourcePlanSchema.parse(row.plan);
      const chunkKind = receiptChunkKind(plan);
      const checksum = hash(input.receipt);
      const existingChunk = await tx.channelScrapeChunk.findFirst({
        where: {
          organizationId: input.organizationId,
          scrapeRunId: run.id,
          kind: chunkKind,
          sequence: input.sequence,
        },
      });
      if (existingChunk) {
        if (existingChunk.checksum !== checksum) {
          throw new ConflictException('SOURCE_RECEIPT_CONFLICT');
        }
        const publication = asRecord(existingChunk.publicationJson);
        return AdTrafficSourceReceiptSchema.parse(publication.receipt);
      }
      if (row.status !== 'running') throw new ConflictException('SOURCE_ATTEMPT_TERMINAL');
      if (expired(row)) {
        await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Wing traffic collection expired.');
        // Return a marker so the failure state/alert transaction commits. The
        // HTTP conflict is raised only after the transaction has completed.
        return { __trafficUploadFailure: true, code: 'ATTEMPT_EXPIRED' };
      }

      const entries = await this.receiptsIn(tx, row);
      const validation = validateReceipt(plan, input.receipt, input.sequence, entries);
      if (validation) throw new ConflictException(validation);
      if (!(await this.accountMatches(tx, row))) {
        await this.failIn(
          tx,
          row,
          'ADVERTISER_IDENTITY_MISMATCH',
          'Wing traffic account changed.',
          checksum,
        );
        return { __trafficUploadFailure: true, code: 'ADVERTISER_IDENTITY_MISMATCH' };
      }

      if (isDailyPlan(plan)) {
        return this.stageDailyReceipt(
          tx,
          row,
          run,
          plan,
          entries,
          input.receipt,
          input.sequence,
          checksum,
        );
      }

      const legacyReceipt = input.receipt as AdTrafficSourceLegacyReceiptInput;
      let effectivePlan = plan as AdTrafficSourceLegacyPlan;
      if (!effectivePlan.targetUrl) {
        effectivePlan = AdTrafficSourcePlanSchema.parse({
          ...effectivePlan,
          targetUrl: legacyReceipt.url,
        }) as AdTrafficSourceLegacyPlan;
        await tx.sourceImportRun.update({
          where: { id: row.id, organizationId: input.organizationId },
          data: { plan: json(effectivePlan) },
        });
      }
      const map = await this.listingMap(tx, row);
      const observedAt = new Date(input.receipt.capturedAt);
      const snapshots: Prisma.ChannelScrapeSnapshotCreateManyInput[] = legacyReceipt.data.map((item) => {
        const match = matchListingFromRow(item, map);
        const externalId = pickStringField(item, [
          'externalId',
          'external_id',
          'productId',
          'coupangProductId',
        ]);
        const externalOptionId = pickStringField(item, [
          'vendorItemId',
          'vendor_item_id',
          'itemId',
        ]);
        return {
          id: randomUUID(),
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          scrapeRunId: run.id,
          channel: 'coupang',
          source: SNAPSHOT_SOURCE,
          pageType: SNAPSHOT_PAGE_TYPE,
          businessDate: dateAtUtc(effectivePlan.businessDate),
          observedAt,
          externalId,
          externalOptionId,
          listingId: match.listingId,
          listingOptionId: match.listingOptionId,
          matchStatus: matchStatusOf(match),
          matchReason: match.listingId ? null : 'traffic row did not match an active listing',
          rowHash: hash(item),
          rawJson: json(item),
          normalizedJson: json(item),
        } satisfies Prisma.ChannelScrapeSnapshotCreateManyInput;
      });
      if (snapshots.length) await tx.channelScrapeSnapshot.createMany({ data: snapshots });
      const matchedCount = snapshots.filter((snapshot) => snapshot.listingId).length;
      const receipt = AdTrafficSourceReceiptSchema.parse({
        sequence: input.sequence,
        key: legacyReceipt.key,
        checksum,
        pageIndex: legacyReceipt.pageIndex,
        expectedPages: legacyReceipt.proof.expectedPages,
        rowCount: snapshots.length,
        matchedCount,
        unmatchedCount: snapshots.length - matchedCount,
        snapshotIds: snapshots.map((snapshot) => snapshot.id),
        url: legacyReceipt.url,
        startDate: legacyReceipt.startDate,
        endDate: legacyReceipt.endDate,
        terminalPageObserved: legacyReceipt.proof.terminalPageObserved,
      });
      await tx.channelScrapeChunk.create({
        data: {
          organizationId: input.organizationId,
          scrapeRunId: run.id,
          kind: LEGACY_RECEIPT_KIND,
          sequence: input.sequence,
          checksum,
          itemCount: snapshots.length,
          payload: json(input.receipt),
          publicationJson: json({ receipt }),
        },
      });
      await tx.sourceImportRun.update({
        where: { id: row.id, organizationId: input.organizationId },
        data: { rowCount: { increment: snapshots.length } },
      });
      return receipt;
    });
    if ('__trafficUploadFailure' in result) {
      throw new ConflictException(result.code);
    }
    return result;
  }

  /** Stage one v2 daily page or the exact-range period summary. Account
   * summaries live in the typed page/period chunk payload; option snapshots
   * remain the only ChannelScrapeSnapshot rows, so owner row counts stay at
   * option grain. */
  private async stageDailyReceipt(
    tx: Tx,
    row: SourceRun,
    run: { id: string },
    plan: AdTrafficSourceDailyPlan,
    entries: ReceiptEntry[],
    input: AdTrafficSourceReceiptInput,
    sequence: number,
    checksum: string,
  ): Promise<AdTrafficSourceReceipt> {
    const map = await this.listingMap(tx, row);
    if (isPeriodReceipt(input)) {
      const receipt = AdTrafficSourceReceiptSchema.parse({
        sequence,
        kind: 'period_summary',
        key: input.key,
        checksum,
        providerVendorId: input.providerVendorId,
        filterScope: input.filterScope,
        capturedAt: input.capturedAt,
        startDate: input.startDate,
        endDate: input.endDate,
        period: input.period,
        rowCount: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        snapshotIds: [],
        url: input.url,
      });
      await tx.channelScrapeChunk.create({
        data: {
          organizationId: row.organizationId,
          scrapeRunId: run.id,
          kind: RECEIPT_KIND,
          sequence,
          checksum,
          itemCount: 0,
          payload: json(input),
          publicationJson: json({ receipt }),
        },
      });
      return receipt;
    }
    if (!isDailyReceipt(input)) {
      throw new ConflictException('TRAFFIC_RECEIPT_KIND_CONFLICT');
    }

    const observedAt = new Date(input.capturedAt);
    const snapshots = input.data.map((item) => {
      const externalOptionId = pickStringField(item, [
        'vendorItemId',
        'vendor_item_id',
        'itemId',
        'externalOptionId',
      ]);
      if (!externalOptionId || !positiveWingOptionId(externalOptionId)) {
        throw new ConflictException('TRAFFIC_OPTION_IDENTITY_INVALID');
      }
      const match = matchListingFromRow(item, map);
      const externalId = pickStringField(item, [
        'externalId',
        'external_id',
        'productId',
        'coupangProductId',
      ]);
      assertTrafficMetrics(item);
      return {
        id: randomUUID(),
        organizationId: row.organizationId,
        sourceImportRunId: row.id,
        scrapeRunId: run.id,
        channel: 'coupang',
        source: SNAPSHOT_SOURCE,
        pageType: SNAPSHOT_PAGE_TYPE,
        businessDate: dateAtUtc(input.businessDate),
        observedAt,
        externalId,
        externalOptionId,
        listingId: match.listingId,
        listingOptionId: match.listingOptionId,
        matchStatus: matchStatusOf(match),
        matchReason: match.listingId ? null : 'traffic row did not match an active listing',
        rowHash: hash(item),
        rawJson: json(item),
        normalizedJson: json(item),
      } satisfies Prisma.ChannelScrapeSnapshotCreateManyInput;
    });
    if (snapshots.length) await tx.channelScrapeSnapshot.createMany({ data: snapshots });
    const matchedCount = snapshots.filter((snapshot) => snapshot.listingId).length;
    const receipt = AdTrafficSourceReceiptSchema.parse({
      sequence,
      kind: 'daily_page',
      key: input.key,
      checksum,
      providerVendorId: input.providerVendorId,
      filterScope: input.filterScope,
      capturedAt: input.capturedAt,
      businessDate: input.businessDate,
      pageIndex: input.pageIndex,
      expectedPages: input.proof.expectedPages,
      rowCount: snapshots.length,
      matchedCount,
      unmatchedCount: snapshots.length - matchedCount,
      snapshotIds: snapshots.map((snapshot) => snapshot.id),
      url: input.url,
      startDate: input.startDate,
      endDate: input.endDate,
      terminalPageObserved: input.proof.terminalPageObserved,
    });
    await tx.channelScrapeChunk.create({
      data: {
        organizationId: row.organizationId,
        scrapeRunId: run.id,
        kind: RECEIPT_KIND,
        sequence,
        checksum,
        itemCount: snapshots.length,
        payload: json(input),
        publicationJson: json({ receipt }),
      },
    });
    if (snapshots.length) {
      await tx.sourceImportRun.update({
        where: { id: row.id, organizationId: row.organizationId },
        data: { rowCount: { increment: snapshots.length } },
      });
    }
    return receipt;
  }

  async finalizeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    manifestChecksum: string;
  }): Promise<AdTrafficSourceStatus> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.find(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      const entries = await this.receiptsIn(tx, row);
      const current = attemptView(row, entries);
      if (row.status !== 'running') {
        if (row.contentChecksum === input.manifestChecksum) {
          return this.sourceStatusIn(tx, input.organizationId, row.channelAccountId!);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) {
        await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Wing traffic collection expired.');
        return this.sourceStatusIn(tx, input.organizationId, row.channelAccountId!);
      }
      if (current.manifestChecksum !== input.manifestChecksum) {
        throw new ConflictException('SOURCE_MANIFEST_MISMATCH');
      }
      const plan = AdTrafficSourcePlanSchema.parse(row.plan);
      const coverageError = validateCoverage(plan, entries);
      if (coverageError) throw new ConflictException(coverageError);
      // The manifest records what was confirmed, not what was asked for. Writing
      // the plan's window here would publish a coverage the collection never
      // reached, and coverage is exactly what consumers read to decide whether a
      // metric is measured.
      const confirmedDates = confirmedDatesOf(plan, entries);
      const providerBackedEmptyDates = providerBackedEmptyDatesOf(confirmedDates, entries);
      const coverageStart = confirmedDates[0] ?? plan.startDate;
      const coverageEnd = confirmedDates[confirmedDates.length - 1] ?? plan.endDate;
      if (!(await this.accountMatches(tx, row))) {
        await this.failIn(
          tx,
          row,
          'ADVERTISER_IDENTITY_MISMATCH',
          'Wing traffic account changed.',
          input.manifestChecksum,
        );
        return this.sourceStatusIn(tx, input.organizationId, row.channelAccountId!);
      }

      const snapshots = await tx.channelScrapeSnapshot.findMany({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          source: SNAPSHOT_SOURCE,
          pageType: SNAPSHOT_PAGE_TYPE,
        },
        select: {
          id: true,
          listingId: true,
          listingOptionId: true,
          externalId: true,
          externalOptionId: true,
          observedAt: true,
          businessDate: true,
          normalizedJson: true,
          rawJson: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      const publication = await this.publishFacts(tx, row, plan, entries, snapshots);
      const completedAt = new Date();
      await tx.channelScrapeRun.updateMany({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          source: SNAPSHOT_SOURCE,
        },
        data: {
          status: 'complete',
          rowCount: snapshots.length,
          matchedCount: publication.matchedCount,
          unmatchedCount: publication.unmatchedCount,
          finishedAt: completedAt,
        },
      });
      await tx.sourceImportRun.update({
        where: { id: row.id, organizationId: input.organizationId },
        data: {
          status: 'completed',
          contentChecksum: input.manifestChecksum,
          importedAt: completedAt,
          lastVerifiedAt: completedAt,
          verificationCount: { increment: 1 },
          coverageStartDate: dateAtUtc(coverageStart),
          coverageEndDate: dateAtUtc(coverageEnd),
          providerBackedEmptyProof: snapshots.length === 0,
          qualityReport: json({
            source: SOURCE_TYPE,
            parserVersion: plan.parserVersion,
            startDate: coverageStart,
            endDate: coverageEnd,
            // Kept alongside the confirmed window so a reader can tell a short
            // collection from a short request.
            requestedStartDate: plan.startDate,
            requestedEndDate: plan.endDate,
            confirmedDates,
            providerBackedEmptyDates,
            targetUrl: plan.targetUrl,
            expectedPages: entries.map((entry) => entry.receipt).find(isPageReceipt)?.expectedPages ?? null,
            visitedPages: entries
              .filter((entry) => 'pageIndex' in entry.receipt)
              .map((entry) => 'pageIndex' in entry.receipt ? entry.receipt.pageIndex : null),
            terminalPageObserved: entries.some(
              (entry) => 'terminalPageObserved' in entry.receipt && entry.receipt.terminalPageObserved,
            ),
            rowCount: snapshots.length,
            matchedCount: publication.matchedCount,
            unmatchedCount: publication.unmatchedCount,
          }),
        },
      });
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: this.alertDedupeKey(row.channelAccountId!),
        attemptId: row.id,
      });
      return this.sourceStatusIn(tx, input.organizationId, row.channelAccountId!);
    });
  }

  async failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<AdTrafficSourceStatus> {
    const message = input.message
      .replace(/(api[_-]?key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
      .slice(0, 300);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.find(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      if (row.status !== 'running') {
        if (row.status === 'failed' && row.errorCode === input.code && row.errorMessage === message) {
          return this.sourceStatusIn(tx, input.organizationId, row.channelAccountId!);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) {
        await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Wing traffic collection expired.');
      } else {
        await this.failIn(tx, row, input.code, message, hash({ code: input.code, message }));
      }
      return this.sourceStatusIn(tx, input.organizationId, row.channelAccountId!);
    });
  }

  private planFor(
    request: AdTrafficSourceBegin,
    channelAccountId: string,
    expectedAdvertiserId: string,
  ) {
    const closedEnd = evidenceCutoffDate();
    const defaultEnd = businessDateKey(closedEnd);
    const defaultStart = businessDateKey(addDays(closedEnd, -6));
    const startDate = request.startDate ?? defaultStart;
    const endDate = request.endDate ?? defaultEnd;
    const start = toBusinessDate(startDate);
    const end = toBusinessDate(endDate);
    if (!start || businessDateKey(start) !== startDate || !end || businessDateKey(end) !== endDate) {
      throw new BadRequestException('INVALID_TRAFFIC_DATE_RANGE');
    }
    const periodDays = datesInRange(start, end);
    if (periodDays < 1 || periodDays > MAX_RANGE_DAYS) {
      throw new BadRequestException('INVALID_TRAFFIC_DATE_RANGE');
    }
    if (end.getTime() > closedEnd.getTime()) {
      throw new BadRequestException('TRAFFIC_RANGE_IN_FUTURE');
    }
    const expectedDates = Array.from({ length: periodDays }, (_, index) =>
      businessDateKey(addDays(start, index)),
    );
    return {
      sourceType: SOURCE_TYPE as 'coupang_wing_traffic',
      parserVersion: PARSER_VERSION as 'wing-traffic-daily-v2',
      channelAccountId,
      expectedAdvertiserId,
      providerVendorId: expectedAdvertiserId,
      startDate,
      endDate,
      businessDate: endDate,
      periodDays,
      expectedDates,
      filterScope: 'ALL_NORMAL_RFM' as const,
      targetUrl: request.url ?? null,
    } satisfies AdTrafficSourceDailyPlan;
  }

  private async sourceStatusIn(
    tx: Tx,
    organizationId: string,
    channelAccountId?: string,
  ): Promise<AdTrafficSourceStatus> {
    const account = await this.primaryAccount(tx, organizationId, channelAccountId);
    if (!account) {
      return AdTrafficSourceStatusSchema.parse({
        knownThrough: businessDateKey(evidenceCutoffDate()),
        channelAccountId: null,
        ready: false,
        latestAttempt: null,
        latestComplete: null,
        actualCutoffAt: null,
      });
    }
    const where = {
      organizationId,
      sourceType: SOURCE_TYPE,
      channelAccountId: account.id,
    };
    const [latest, complete, allComplete] = await Promise.all([
      tx.sourceImportRun.findFirst({
        where,
        orderBy: [{ freshnessGeneration: 'desc' }, { createdAt: 'desc' }],
      }),
      tx.sourceImportRun.findFirst({
        where: { ...where, status: 'completed' },
        orderBy: [{ freshnessGeneration: 'desc' }, { createdAt: 'desc' }],
      }),
      tx.sourceImportRun.findMany({
        where: { ...where, status: 'completed' },
        select: { plan: true, qualityReport: true },
      }),
    ]);
    const latestAttempt = latest ? await this.attemptView(tx, latest) : null;
    const latestComplete = complete ? await this.attemptView(tx, complete) : null;
    const expectedEnd = businessDateKey(evidenceCutoffDate());
    const coveredDailyDates = new Set(
      allComplete.flatMap((candidate) => {
        const plan = AdTrafficSourcePlanSchema.safeParse(candidate.plan);
        return plan.success && isDailyPlan(plan.data)
          ? declaredConfirmedDates(candidate.qualityReport)
          : [];
      }),
    );
    const ready = deriveSourceReadiness({
      latestAttempt,
      latestComplete: latestComplete && isDailyPlan(latestComplete.plan)
        ? { actualCutoff: [...coveredDailyDates].sort().at(-1) ?? null }
        : null,
      requiredCutoff: expectedEnd,
    }).ready;
    return AdTrafficSourceStatusSchema.parse({
      knownThrough: expectedEnd,
      channelAccountId: account.id,
      ready,
      latestAttempt,
      latestComplete,
      actualCutoffAt: latestComplete?.actualCutoffAt ?? null,
    });
  }

  private async publishFacts(
    tx: Tx,
    row: SourceRun,
    plan: ReturnType<typeof AdTrafficSourcePlanSchema.parse>,
    entries: ReceiptEntry[],
    snapshots: Array<{
      id: string;
      listingId: string | null;
      listingOptionId: string | null;
      externalId: string | null;
      externalOptionId: string | null;
      observedAt: Date;
      businessDate: Date | null;
      normalizedJson: Prisma.JsonValue | null;
      rawJson: Prisma.JsonValue;
    }>,
  ) {
    if (isDailyPlan(plan)) {
      return this.publishDailyFacts(tx, row, plan, entries, snapshots);
    }
    let matchedCount = 0;
    let unmatchedCount = 0;
    for (const snapshot of snapshots) {
      if (!snapshot.listingId) {
        unmatchedCount += 1;
        continue;
      }
      matchedCount += 1;
      const raw = asRecord(snapshot.normalizedJson ?? snapshot.rawJson);
      // The same integer contract as the daily path: an unparseable provider
      // cell rejects the publication instead of becoming a measured 0.
      const metrics = trafficMetrics(raw);
      const traffic = {
        trafficVisitors: metrics.visitors,
        trafficViews: metrics.views,
        trafficCartAdds: metrics.cartAdds,
        trafficOrders: metrics.orders,
        trafficSalesQty: metrics.salesQty,
        trafficRevenue: metrics.revenue,
      };
      const visitors = traffic.trafficVisitors;
      const providerConversionRate = visitors > 0
        ? Math.round((traffic.trafficOrders / visitors) * 10000) / 100
        : null;
      const businessDate = snapshot.businessDate ?? dateAtUtc(plan.businessDate);
      const metaJson = {
        source: 'wing.traffic',
        data: {
          periodDays: plan.periodDays,
          providerConversionRate,
          url: plan.targetUrl,
          startDate: plan.startDate,
          endDate: plan.endDate,
        },
      } as const;
      const existing = await tx.channelListingDailySnapshot.findUnique({
        where: {
          organizationId_listingId_businessDate: {
            organizationId: row.organizationId,
            listingId: snapshot.listingId,
            businessDate,
          },
        },
        select: { id: true },
      });
      const observedAt = snapshot.observedAt;
      const daily = existing
        ? await tx.channelListingDailySnapshot.update({
            where: { id: existing.id },
            data: {
              sampleCount: { increment: 1 },
              lastObservedAt: observedAt,
              ...traffic,
              trafficCoverageStatus: 'OBSERVED',
              trafficObservedAt: observedAt,
            },
            select: { id: true },
          })
        : await tx.channelListingDailySnapshot.create({
            data: {
              organizationId: row.organizationId,
              listingId: snapshot.listingId,
              channel: 'coupang',
              externalId: snapshot.externalId ?? '',
              businessDate,
              sampleCount: 1,
              firstObservedAt: observedAt,
              lastObservedAt: observedAt,
              rawSnapshotId: snapshot.id,
              metaJson: buildNamespacedMetaForCreate(metaJson),
              ...traffic,
              trafficCoverageStatus: 'OBSERVED',
              trafficObservedAt: observedAt,
            },
            select: { id: true },
          });
      await mergeNamespacedMetaJson(
        tx,
        'channel_listing_daily_snapshots',
        daily.id,
        row.organizationId,
        metaJson,
      );
    }

    return { matchedCount, unmatchedCount };
  }

  private async publishDailyFacts(
    tx: Tx,
    row: SourceRun,
    plan: AdTrafficSourceDailyPlan,
    entries: ReceiptEntry[],
    snapshots: Array<{
      id: string;
      listingId: string | null;
      listingOptionId: string | null;
      externalId: string | null;
      externalOptionId: string | null;
      observedAt: Date;
      businessDate: Date | null;
      normalizedJson: Prisma.JsonValue | null;
      rawJson: Prisma.JsonValue;
    }>,
  ) {
    type ListingAggregate = {
      listingId: string;
      externalId: string;
      businessDate: Date;
      observedAt: Date;
      rawSnapshotId: string;
      metrics: {
        visitors: number;
        views: number;
        cartAdds: number;
        orders: number;
        salesQty: number;
        revenue: number;
      };
    };
    const listingMap = await this.listingMap(tx, row);
    const currentListingIds = new Set<string>([
      ...[...listingMap.externalOptionIdMap.values()].map((value) => value.listingId),
      ...[...listingMap.externalIdMap.values()].map((value) => value.listingId),
    ]);
    const accountRuns = await tx.sourceImportRun.findMany({
      where: {
        organizationId: row.organizationId,
        sourceType: SOURCE_TYPE,
        channelAccountId: row.channelAccountId,
      },
      select: { id: true },
    });
    const accountRunIds = new Set(accountRuns.map((candidate) => candidate.id));
    const resetCandidates = await tx.channelListingDailySnapshot.findMany({
      where: {
        organizationId: row.organizationId,
        businessDate: { in: plan.expectedDates.map(dateAtUtc) },
      },
      select: { id: true, listingId: true, externalId: true, businessDate: true, metaJson: true },
    });
    const pageOneByDate = new Map(
      entries
        .filter(
          (entry): entry is ReceiptEntry & { input: AdTrafficSourceDailyReceiptInput } =>
            isDailyReceipt(entry.input) && entry.input.pageIndex === 1,
        )
        .map((entry) => [entry.input.businessDate, entry.input] as const),
    );
    const finalFacts = new Map<string, DailyFactPublication>();
    for (const candidate of resetCandidates) {
      const businessDate = businessDateKey(candidate.businessDate);
      const pageOne = pageOneByDate.get(businessDate);
      if (!pageOne) continue;
      const meta = asRecord(candidate.metaJson);
      const wingMeta = asRecord(meta['wing.traffic']);
      const previousAttemptId = wingMeta.sourceAttemptId;
      const hasWingMeta = Object.prototype.hasOwnProperty.call(meta, 'wing.traffic');
      const hasCsvMeta = Object.prototype.hasOwnProperty.call(meta, 'traffic.csv_upload');
      const currentSource = meta['traffic.currentSource'];
      const wingIsCurrent = currentSource === 'wing.traffic'
        || (currentSource === undefined && hasWingMeta && !hasCsvMeta);
      const wasWingOwned = currentListingIds.has(candidate.listingId)
        && (!Object.keys(meta).length || wingIsCurrent)
        || (typeof previousAttemptId === 'string' && accountRunIds.has(previousAttemptId) && wingIsCurrent);
      // A CSV-only fact is an independent source and must not be erased by an
      // empty Wing recollection. A pre-marker row with both namespaces is
      // ambiguous and therefore fails closed; the marker resolves newer rows.
      const markerSaysCsv = currentSource === 'traffic.csv_upload';
      const ambiguousPreMarker = currentSource === undefined && hasWingMeta && hasCsvMeta;
      if (!wasWingOwned || markerSaysCsv || ambiguousPreMarker) {
        continue;
      }
      const observedAt = new Date(pageOne.capturedAt);
      finalFacts.set(`${candidate.listingId}:${businessDate}`, {
        id: candidate.id,
        listingId: candidate.listingId,
        externalId: candidate.externalId,
        businessDate,
        observedAt,
        rawSnapshotId: null,
        metaJson: {
          'wing.traffic': {
            grain: 'listing_option_sum',
            scope: 'matched_listings',
            periodDays: 1,
            businessDate,
            sourceAttemptId: row.id,
            providerVendorId: plan.providerVendorId,
            filterScope: plan.filterScope,
            targetUrl: plan.targetUrl,
          },
          'traffic.currentSource': 'wing.traffic',
        },
        metrics: {
          visitors: 0,
          views: 0,
          cartAdds: 0,
          orders: 0,
          salesQty: 0,
          revenue: 0,
        },
      });
    }
    const aggregates = new Map<string, ListingAggregate>();
    let matchedCount = 0;
    let unmatchedCount = 0;
    for (const snapshot of snapshots) {
      if (!snapshot.listingId || !snapshot.businessDate) {
        unmatchedCount += 1;
        continue;
      }
      matchedCount += 1;
      const raw = asRecord(snapshot.normalizedJson ?? snapshot.rawJson);
      const metrics = trafficMetrics(raw);
      const businessDate = snapshot.businessDate;
      const key = `${snapshot.listingId}:${businessDateKey(businessDate)}`;
      const existing = aggregates.get(key);
      if (existing) {
        existing.metrics.visitors += metrics.visitors;
        existing.metrics.views += metrics.views;
        existing.metrics.cartAdds += metrics.cartAdds;
        existing.metrics.orders += metrics.orders;
        existing.metrics.salesQty += metrics.salesQty;
        existing.metrics.revenue += metrics.revenue;
        if (snapshot.observedAt > existing.observedAt) {
          existing.observedAt = snapshot.observedAt;
          existing.rawSnapshotId = snapshot.id;
        }
      } else {
        aggregates.set(key, {
          listingId: snapshot.listingId,
          externalId: snapshot.externalId ?? '',
          businessDate,
          observedAt: snapshot.observedAt,
          rawSnapshotId: snapshot.id,
          metrics: { ...metrics },
        });
      }
    }

    for (const aggregate of aggregates.values()) {
      const derivedConversionRate = aggregate.metrics.views !== 0
        ? Math.round((aggregate.metrics.orders / aggregate.metrics.views) * 10000) / 100
        : null;
      const metaJson = {
        'wing.traffic': {
          grain: 'listing_option_sum',
          scope: 'matched_listings',
          periodDays: 1,
          businessDate: businessDateKey(aggregate.businessDate),
          sourceAttemptId: row.id,
          providerVendorId: plan.providerVendorId,
          filterScope: plan.filterScope,
          targetUrl: plan.targetUrl,
          derivedConversionRate,
        },
        'traffic.currentSource': 'wing.traffic',
      } as const;
      const key = `${aggregate.listingId}:${businessDateKey(aggregate.businessDate)}`;
      const existing = finalFacts.get(key);
      finalFacts.set(key, {
        id: existing?.id ?? randomUUID(),
        listingId: aggregate.listingId,
        externalId: aggregate.externalId,
        businessDate: businessDateKey(aggregate.businessDate),
        observedAt: aggregate.observedAt,
        rawSnapshotId: aggregate.rawSnapshotId,
        metaJson,
        metrics: aggregate.metrics,
      });
    }

    const publishedAt = new Date();
    await upsertDailyFactPublication(tx, row.organizationId, [...finalFacts.values()], publishedAt);

    return { matchedCount, unmatchedCount };
  }

  private async attemptView(tx: Tx, row: SourceRun): Promise<AdTrafficSourceAttempt> {
    return attemptView(row, await this.receiptsIn(tx, row));
  }

  private async receiptsIn(tx: Tx, row: SourceRun): Promise<ReceiptEntry[]> {
    return receiptEntriesForRun(tx, row);
  }

  private async listingMap(tx: Tx, row: SourceRun): Promise<ListingMap> {
    const listings = await tx.channelListing.findMany({
      where: {
        organizationId: row.organizationId,
        channelAccountId: row.channelAccountId!,
        isActive: true,
      },
      select: {
        id: true,
        externalId: true,
        options: {
          where: { organizationId: row.organizationId, isActive: true },
          select: { id: true, externalOptionId: true },
        },
      },
    });
    return {
      channelAccountId: row.channelAccountId!,
      externalIdMap: new Map(listings.map((listing) => [listing.externalId, { listingId: listing.id }])),
      externalOptionIdMap: new Map(
        listings.flatMap((listing) =>
          listing.options
            .filter((option) => option.externalOptionId)
            .map((option) => [
              option.externalOptionId!,
              {
                listingId: listing.id,
                listingOptionId: option.id,
                externalId: listing.externalId,
              },
            ] as const),
        ),
      ),
    };
  }

  private async primaryAccount(tx: Tx, organizationId: string, accountId?: string) {
    return tx.channelAccount.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        status: 'active',
        ...(accountId ? { id: accountId } : {}),
      },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  private async accountMatches(tx: Tx, row: SourceRun): Promise<boolean> {
    const account = await this.primaryAccount(tx, row.organizationId, row.channelAccountId!);
    if (!account) return false;
    return resolveCoupangVendorId(account) === AdTrafficSourcePlanSchema.parse(row.plan).expectedAdvertiserId;
  }

  private async scrapeRun(tx: Tx, row: SourceRun) {
    const run = await tx.channelScrapeRun.findFirst({
      where: {
        organizationId: row.organizationId,
        sourceImportRunId: row.id,
        source: SNAPSHOT_SOURCE,
        pageType: SNAPSHOT_PAGE_TYPE,
      },
    });
    if (!run) throw new NotFoundException('TRAFFIC_STAGING_NOT_FOUND');
    return run;
  }

  private async findOptional(tx: Tx, organizationId: string, attemptId: string) {
    return tx.sourceImportRun.findFirst({
      where: { id: attemptId, organizationId, sourceType: SOURCE_TYPE },
    });
  }

  private async find(tx: Tx, organizationId: string, attemptId: string): Promise<SourceRun> {
    const row = await this.findOptional(tx, organizationId, attemptId);
    if (!row) throw new NotFoundException('AD_TRAFFIC_ATTEMPT_NOT_FOUND');
    return row;
  }

  private alertDedupeKey(channelAccountId: string): string {
    return `source:${SOURCE_TYPE}:${channelAccountId}`;
  }

  private async failIn(
    tx: Tx,
    row: SourceRun,
    code: string,
    message: string,
    checksum?: string,
  ) {
    const failed = await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: {
        status: 'failed',
        errorCode: code,
        errorMessage: message.slice(0, 300),
        ...(checksum ? { contentChecksum: checksum } : {}),
      },
    });
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: row.organizationId,
      sourceType: SOURCE_TYPE,
      attemptId: row.id,
      dedupeKey: this.alertDedupeKey(row.channelAccountId!),
      title: '쿠팡 Wing 트래픽 수집 실패',
      message: message,
      href: '/ad-ops',
    });
    return failed;
  }

  private async lock(tx: Tx, organizationId: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${SOURCE_TYPE}`}, 0))::text AS lock
      FROM (SELECT ${organizationId}::uuid AS organization_id) AS tenant WHERE organization_id = ${organizationId}::uuid`;
  }
}

async function receiptEntriesForRun(tx: Tx, row: SourceRun): Promise<ReceiptEntry[]> {
  const run = await tx.channelScrapeRun.findFirst({
    where: {
      organizationId: row.organizationId,
      sourceImportRunId: row.id,
      source: SNAPSHOT_SOURCE,
      pageType: SNAPSHOT_PAGE_TYPE,
    },
    select: { id: true },
  });
  if (!run) return [];
  const plan = AdTrafficSourcePlanSchema.parse(row.plan);
  const chunks = await tx.channelScrapeChunk.findMany({
    where: {
      organizationId: row.organizationId,
      scrapeRunId: run.id,
      kind: receiptChunkKind(plan),
    },
    orderBy: { sequence: 'asc' },
    select: { payload: true, publicationJson: true },
  });
  return chunks.map((chunk) => ({
    input: chunk.payload as unknown as AdTrafficSourceReceiptInput,
    receipt: AdTrafficSourceReceiptSchema.parse(asRecord(chunk.publicationJson).receipt),
  }));
}

async function readLegacyPublished(
  tx: Tx,
  channelAccountId: string,
  organizationId: string,
  run: SourceRun,
  plan: AdTrafficSourceLegacyPlan,
  from: Date | undefined,
  to: Date | undefined,
): Promise<AdTrafficSourcePublished> {
  // The v1 publication is a period observation, not a daily source. Keep the
  // compatibility read useful only for the exact interval that was captured;
  // an arbitrary subrange must never turn that period's rows into daily facts.
  const exactPeriodRequested =
    (!from && !to)
    || (from !== undefined
      && to !== undefined
      && businessDateKey(from) === plan.startDate
      && businessDateKey(to) === plan.endDate);
  if (!exactPeriodRequested) {
    return AdTrafficSourcePublishedSchema.parse({
      channelAccountId,
      attemptId: run.id,
      plan,
      rows: [],
    });
  }

  const snapshots = await tx.channelScrapeSnapshot.findMany({
    where: {
      organizationId,
      sourceImportRunId: run.id,
      source: SNAPSHOT_SOURCE,
      pageType: SNAPSHOT_PAGE_TYPE,
      listingId: { not: null },
      businessDate: { not: null },
    },
    select: { listingId: true, externalId: true, businessDate: true },
  });
  const keys = new Set(
    snapshots
      .filter((snapshot): snapshot is typeof snapshot & { listingId: string; businessDate: Date } =>
        !!snapshot.listingId && !!snapshot.businessDate)
      .map((snapshot) => `${snapshot.listingId}:${businessDateKey(snapshot.businessDate)}`),
  );
  const listingIds = [...new Set(snapshots.flatMap((snapshot) => snapshot.listingId ? [snapshot.listingId] : []))];
  const dailyRows = listingIds.length
    ? await tx.channelListingDailySnapshot.findMany({
        where: {
          organizationId,
          listingId: { in: listingIds },
        },
        select: {
          listingId: true,
          externalId: true,
          businessDate: true,
          trafficVisitors: true,
          trafficViews: true,
          trafficCartAdds: true,
          trafficOrders: true,
          trafficSalesQty: true,
          trafficRevenue: true,
          trafficObservedAt: true,
        },
      })
    : [];
  // A daily row without a traffic observation never measured traffic for
  // this capture; its unrelated `lastObservedAt` is not evidence, so the row
  // is not published.
  const rows = dailyRows
    .filter((daily): daily is typeof daily & { trafficObservedAt: Date } =>
      daily.trafficObservedAt !== null
      && keys.has(`${daily.listingId}:${businessDateKey(daily.businessDate)}`))
    .map((daily) => ({
      listingId: daily.listingId,
      externalId: daily.externalId,
      businessDate: businessDateKey(daily.businessDate),
      observedAt: daily.trafficObservedAt.toISOString(),
      traffic: {
        visitors: daily.trafficVisitors,
        views: daily.trafficViews,
        cartAdds: daily.trafficCartAdds,
        orders: daily.trafficOrders,
        salesQty: daily.trafficSalesQty,
        revenue: daily.trafficRevenue,
      },
    }));
  return AdTrafficSourcePublishedSchema.parse({
    channelAccountId,
    attemptId: run.id,
    plan,
    rows,
  });
}

async function readDailyPublished(
  tx: Tx,
  channelAccountId: string,
  organizationId: string,
  dailyRuns: Array<{ run: SourceRun; plan: AdTrafficSourceDailyPlan }>,
  from: Date | undefined,
  to: Date | undefined,
  legacyRuns: Array<{ run: SourceRun; plan: AdTrafficSourceLegacyPlan }>,
): Promise<AdTrafficSourcePublished> {
  // A default read represents the complete set of dates currently covered by
  // complete v2 runs. Anchoring it to the newest run's interval would make an
  // older, later recollection hide newer dates that belong to another run.
  const coveredDateValues = dailyRuns.flatMap((candidate) => candidate.plan.expectedDates);
  const firstCompleteDate = coveredDateValues.reduce<string | null>(
    (first, value) => !first || value < first ? value : first,
    null,
  );
  const lastCompleteDate = coveredDateValues.reduce<string | null>(
    (last, value) => !last || value > last ? value : last,
    null,
  );
  const anchor = dailyRuns[0]!.plan;
  const rangeFrom = from ?? dateAtUtc(firstCompleteDate ?? anchor.startDate);
  const rangeTo = to ?? dateAtUtc(lastCompleteDate ?? anchor.endDate);
  if (rangeFrom.getTime() > rangeTo.getTime()) {
    throw new BadRequestException('INVALID_TRAFFIC_DATE_RANGE');
  }
  const targetDates = datesBetween(rangeFrom, rangeTo);
  const rangeStartText = businessDateKey(rangeFrom);
  const rangeEndText = businessDateKey(rangeTo);
  const selected = new Map<string, { run: SourceRun; plan: AdTrafficSourceDailyPlan }>();
  for (const candidate of dailyRuns) {
    for (const businessDate of candidate.plan.expectedDates) {
      if (businessDate < rangeStartText || businessDate > rangeEndText) continue;
      if (!selected.has(businessDate)) selected.set(businessDate, candidate);
    }
  }
  const selectedRunIds = [...new Set([...selected.values()].map((candidate) => candidate.run.id))];
  // Keep an exact-range period receipt available even when every date in that
  // range has since been replaced by fresher daily runs. Its evidence is
  // intentionally marked stale below, but dropping it here loses the
  // provider's period provenance entirely.
  const exactPeriod = dailyRuns.find(
    (candidate) => candidate.plan.startDate === rangeStartText
      && candidate.plan.endDate === rangeEndText,
  );
  const entriesByRun = new Map<string, ReceiptEntry[]>();
  for (const candidate of dailyRuns) {
    if (!selectedRunIds.includes(candidate.run.id) && candidate.run.id !== exactPeriod?.run.id) continue;
    entriesByRun.set(candidate.run.id, await receiptEntriesForRun(tx, candidate.run));
  }
  const snapshots = selectedRunIds.length
    ? await tx.channelScrapeSnapshot.findMany({
        where: {
          organizationId,
          sourceImportRunId: { in: selectedRunIds },
          source: SNAPSHOT_SOURCE,
          pageType: SNAPSHOT_PAGE_TYPE,
          businessDate: { gte: rangeFrom, lte: rangeTo },
        },
        select: {
          sourceImportRunId: true,
          listingId: true,
          listingOptionId: true,
          externalId: true,
          externalOptionId: true,
          businessDate: true,
          observedAt: true,
          normalizedJson: true,
          rawJson: true,
        },
      })
    : [];
  const accountDaily: Array<Record<string, unknown>> = [];
  const completeDates = new Set<string>();
  for (const businessDate of targetDates) {
    const candidate = selected.get(businessDate);
    const entry = candidate
      ? entriesByRun.get(candidate.run.id)?.find(
          (value): value is ReceiptEntry & { input: AdTrafficSourceDailyReceiptInput } =>
            isDailyReceipt(value.input)
            && value.input.businessDate === businessDate
            && value.input.pageIndex === 1,
        )
      : undefined;
    const summary = entry ? accountSummaryFromRecord(asRecord(entry.input.accountSummary)) : null;
    if (!entry || !summary) continue;
    accountDaily.push({
      businessDate,
      observedAt: entry.input.capturedAt,
      sourceAttemptId: candidate!.run.id,
      ...summary,
    });
    completeDates.add(businessDate);
  }
  const optionDaily = snapshots
    .filter((snapshot) => {
      const date = snapshot.businessDate ? businessDateKey(snapshot.businessDate) : '';
      return !!snapshot.sourceImportRunId && selected.get(date)?.run.id === snapshot.sourceImportRunId;
    })
    .map((snapshot) => {
      const raw = asRecord(snapshot.normalizedJson ?? snapshot.rawJson);
      const traffic = trafficMetrics(raw);
      return {
        businessDate: businessDateKey(snapshot.businessDate!),
        observedAt: snapshot.observedAt.toISOString(),
        sourceAttemptId: snapshot.sourceImportRunId!,
        listingId: snapshot.listingId,
        listingOptionId: snapshot.listingOptionId,
        externalId: snapshot.externalId,
        externalOptionId: snapshot.externalOptionId,
        traffic,
      };
    });
  let periodSummary: Record<string, unknown> | null = null;
  if (exactPeriod) {
    const periodEntry = entriesByRun.get(exactPeriod.run.id)?.find(
      (value): value is ReceiptEntry & { input: AdTrafficSourcePeriodReceiptInput } =>
        isPeriodReceipt(value.input),
    );
    if (periodEntry) {
      const summary = accountSummaryFromRecord(asRecord(periodEntry.input.accountSummary));
      if (summary) {
        periodSummary = {
          startDate: exactPeriod.plan.startDate,
          endDate: exactPeriod.plan.endDate,
          observedAt: periodEntry.input.capturedAt,
          sourceAttemptId: exactPeriod.run.id,
          providerVendorId: exactPeriod.plan.providerVendorId,
          filterScope: exactPeriod.plan.filterScope,
          accountSummary: summary,
          accountSummaryRaw: asRecord(periodEntry.input.accountSummaryRaw),
        };
      }
    }
  }
  const legacyExactPeriodEvidence = await readLegacyExactPeriodEvidence(
    tx,
    legacyRuns,
    rangeStartText,
    rangeEndText,
  );
  const selectedIdSet = new Set(selectedRunIds);
  const outputCandidate = dailyRuns.find((candidate) => selectedIdSet.has(candidate.run.id))
    ?? dailyRuns[0]!;
  const periodEvidenceIsStale = !!exactPeriod
    && [...selected.values()].some((candidate) => runIsNewer(candidate.run, exactPeriod.run));
  const incompleteDailyCoverage = completeDates.size !== targetDates.length;
  return AdTrafficSourcePublishedSchema.parse({
    channelAccountId,
    attemptId: outputCandidate.run.id,
    plan: outputCandidate.plan,
    providerVendorId: outputCandidate.plan.providerVendorId,
    filterScope: outputCandidate.plan.filterScope,
    accountDaily,
    optionDaily: optionDaily.sort((left, right) =>
      left.businessDate.localeCompare(right.businessDate)
      || left.observedAt.localeCompare(right.observedAt)
      || (left.externalOptionId ?? '').localeCompare(right.externalOptionId ?? ''),
    ),
    periodSummary,
    coverage: {
      from: rangeStartText,
      to: rangeEndText,
      targetDays: targetDates.length,
      completedDays: completeDates.size,
      missingDates: targetDates.filter((businessDate) => !completeDates.has(businessDate)),
    },
    reconciliation: buildReconciliation(accountDaily, periodSummary, {
      forceUnverified: incompleteDailyCoverage || periodEvidenceIsStale,
    }),
    legacyExactPeriodEvidence,
  });
}

async function readLegacyExactPeriodEvidence(
  tx: Tx,
  legacyRuns: Array<{ run: SourceRun; plan: AdTrafficSourceLegacyPlan }>,
  startDate: string,
  endDate: string,
): Promise<Record<string, unknown> | null> {
  const exact = legacyRuns.find(
    (candidate) => candidate.plan.startDate === startDate && candidate.plan.endDate === endDate,
  );
  if (!exact) return null;
  const entries = await receiptEntriesForRun(tx, exact.run);
  const dashboard = dashboardPayload(entries);
  if (!dashboard) return null;
  return {
    startDate,
    endDate,
    observedAt: dashboard.capturedAt.toISOString(),
    sourceAttemptId: exact.run.id,
    summary: {
      kpis: dashboard.kpis,
      summary: dashboard.summary,
      adSummary: dashboard.adSummary,
      period: exact.plan.periodDays,
      startDate: exact.plan.startDate,
      endDate: exact.plan.endDate,
      timestamp: dashboard.capturedAt.toISOString(),
    },
    raw: dashboard.raw,
  };
}

function runIsNewer(left: SourceRun, right: SourceRun): boolean {
  const useGeneration = left.freshnessGeneration != null
    && right.freshnessGeneration != null;
  return isNewerAttempt(
    {
      observedAt: useGeneration ? left.freshnessGeneration : left.createdAt,
      importedAt: left.importedAt ?? left.createdAt,
      id: left.id,
    },
    {
      observedAt: useGeneration ? right.freshnessGeneration : right.createdAt,
      importedAt: right.importedAt ?? right.createdAt,
      id: right.id,
    },
  );
}

function attemptView(row: SourceRun, entries: ReceiptEntry[]): AdTrafficSourceAttempt {
  const plan = AdTrafficSourcePlanSchema.parse(row.plan);
  const isExpired = expired(row);
  const matchedRowCount = entries.reduce((sum, entry) => sum + entry.receipt.matchedCount, 0);
  const unmatchedRowCount = entries.reduce((sum, entry) => sum + entry.receipt.unmatchedCount, 0);
  if (isDailyPlan(plan)) {
    // v2 has an independent page count for every business date plus one
    // period-summary receipt; a single scalar expectedPages is therefore not
    // meaningful in the public attempt view. Coverage validation remains the
    // authoritative terminal signal.
    return AdTrafficSourceAttemptSchema.parse({
      attemptId: row.id,
      channelAccountId: row.channelAccountId,
      state:
        row.status === 'completed'
          ? 'COMPLETE'
          : row.status === 'running' && !isExpired
            ? 'RUNNING'
            : 'FAILED',
      plan,
      expiresAt: row.expiresAt?.toISOString() ?? new Date(0).toISOString(),
      actualCutoffAt: row.status === 'completed' ? row.importedAt?.toISOString() ?? null : null,
      manifestChecksum: hash({ plan, receipts: entries.map((entry) => entry.receipt) }),
      rowCount: row.rowCount,
      matchedRowCount,
      unmatchedRowCount,
      receiptCount: entries.length,
      expectedPages: null,
      terminalPageObserved: validateCoverage(plan, entries) === null,
      errorCode: isExpired ? 'ATTEMPT_EXPIRED' : row.errorCode,
      errorMessage: isExpired ? 'Wing traffic collection expired.' : row.errorMessage,
    });
  }
  const pageReceipts = entries.map((entry) => entry.receipt).filter(isPageReceipt);
  const expectedPages = pageReceipts[0]?.expectedPages ?? null;
  const terminalPageObserved = pageReceipts.at(-1)?.terminalPageObserved ?? false;
  return AdTrafficSourceAttemptSchema.parse({
    attemptId: row.id,
    channelAccountId: row.channelAccountId,
    state:
      row.status === 'completed'
        ? 'COMPLETE'
        : row.status === 'running' && !isExpired
          ? 'RUNNING'
          : 'FAILED',
    plan,
    expiresAt: row.expiresAt?.toISOString() ?? new Date(0).toISOString(),
    actualCutoffAt: row.status === 'completed' ? row.importedAt?.toISOString() ?? null : null,
    manifestChecksum: hash({ plan, receipts: entries.map((entry) => entry.receipt) }),
    rowCount: row.rowCount,
    matchedRowCount,
    unmatchedRowCount,
    receiptCount: entries.length,
    expectedPages,
    terminalPageObserved,
    errorCode: isExpired ? 'ATTEMPT_EXPIRED' : row.errorCode,
    errorMessage: isExpired ? 'Wing traffic collection expired.' : row.errorMessage,
  });
}

function validateReceipt(
  plan: ReturnType<typeof AdTrafficSourcePlanSchema.parse>,
  receipt: AdTrafficSourceReceiptInput,
  sequence: number,
  entries: ReceiptEntry[],
): string | null {
  if (isDailyPlan(plan)) {
    if (isDailyReceipt(receipt)) {
      if (
        receipt.providerVendorId !== plan.providerVendorId
        || receipt.filterScope !== plan.filterScope
        || !isWingTrafficUrl(receipt.url)
        || (plan.targetUrl !== null && receipt.url !== plan.targetUrl)
        || receipt.businessDate !== receipt.startDate
        || receipt.businessDate !== receipt.endDate
        || receipt.period !== 1
      ) {
        return 'SOURCE_RECEIPT_SCOPE_CONFLICT';
      }
      if (
        receipt.accountSummary
        && receipt.accountSummaryRaw
        && !accountSummaryMatchesRaw(asRecord(receipt.accountSummary), receipt.accountSummaryRaw)
      ) {
        return 'TRAFFIC_ACCOUNT_SUMMARY_CONFLICT';
      }
      const dateIndex = plan.expectedDates.indexOf(receipt.businessDate);
      if (dateIndex < 0) return 'SOURCE_RECEIPT_DATE_CONFLICT';
      const expectedSequence = dateIndex * 100 + receipt.pageIndex - 1;
      if (sequence !== expectedSequence) return 'SOURCE_RECEIPT_SEQUENCE_CONFLICT';
      const sameDay = entries.filter(
        (entry): entry is ReceiptEntry & { input: AdTrafficSourceDailyReceiptInput } =>
          isDailyReceipt(entry.input) && entry.input.businessDate === receipt.businessDate,
      );
      if (sameDay.some((entry) => entry.input.pageIndex === receipt.pageIndex)) {
        return 'SOURCE_RECEIPT_SEQUENCE_CONFLICT';
      }
      const expectedVisited = Array.from({ length: receipt.pageIndex }, (_, index) => index + 1);
      const proof = receipt.proof;
      if (
        !proof.verified
        || proof.expectedPages < receipt.pageIndex
        || proof.visitedPages.length !== receipt.pageIndex
        || proof.visitedPages.some((page, index) => page !== expectedVisited[index])
        || (receipt.pageIndex < proof.expectedPages && (proof.complete || proof.terminalPageObserved))
        || (receipt.pageIndex === proof.expectedPages && (!proof.complete || !proof.terminalPageObserved))
        || (proof.explicitEmpty && (receipt.data.length > 0 || receipt.pageIndex !== 1 || proof.expectedPages !== 1))
      ) {
        return 'INCOMPLETE_TRAFFIC_COVERAGE';
      }
      if (sameDay.length && sameDay[0]!.input.proof.expectedPages !== proof.expectedPages) {
        return 'SOURCE_RECEIPT_PAGE_COUNT_CONFLICT';
      }
      const priorOptionIds = new Set<string>();
      for (const entry of sameDay) {
        if (!isDailyReceipt(entry.input)) continue;
        for (const item of entry.input.data) {
          const optionId = pickStringField(item, [
            'vendorItemId',
            'vendor_item_id',
            'itemId',
            'externalOptionId',
          ]);
          if (optionId) priorOptionIds.add(optionId);
        }
      }
      for (const item of receipt.data) {
        const optionId = pickStringField(item, [
          'vendorItemId',
          'vendor_item_id',
          'itemId',
          'externalOptionId',
        ]);
        if (!optionId || !positiveWingOptionId(optionId)) return 'TRAFFIC_OPTION_IDENTITY_INVALID';
        if (priorOptionIds.has(optionId)) return 'TRAFFIC_OPTION_DUPLICATE';
        priorOptionIds.add(optionId);
        try {
          trafficMetrics(item);
        } catch {
          return 'TRAFFIC_METRIC_INVALID';
        }
      }
      if (entries.some((entry) => entry.input.key === receipt.key)) {
        return 'SOURCE_RECEIPT_KEY_CONFLICT';
      }
      return null;
    }
    if (isPeriodReceipt(receipt)) {
      // The period summary describes the dates this attempt confirmed, which can
      // be fewer than the plan asked for when the provider has not published a
      // later day yet. Here that only has to be a contiguous interval inside the
      // plan; `validateCoverage` is where it must equal the confirmed set, since
      // only the terminal submission knows what that set turned out to be.
      const periodStart = plan.expectedDates.indexOf(receipt.startDate);
      const periodEnd = plan.expectedDates.indexOf(receipt.endDate);
      if (
        // The sequence stays keyed to the plan so it is stable across attempts
        // and cannot collide with a daily page's `dateIndex * 100 + pageIndex - 1`.
        sequence !== plan.periodDays * 100
        || receipt.providerVendorId !== plan.providerVendorId
        || receipt.filterScope !== plan.filterScope
        || periodStart < 0
        || periodEnd < periodStart
        || receipt.period !== periodEnd - periodStart + 1
        || !isWingTrafficUrl(receipt.url)
        || (plan.targetUrl !== null && receipt.url !== plan.targetUrl)
      ) {
        return 'SOURCE_RECEIPT_SCOPE_CONFLICT';
      }
      if (!accountSummaryMatchesRaw(asRecord(receipt.accountSummary), receipt.accountSummaryRaw)) {
        return 'TRAFFIC_ACCOUNT_SUMMARY_CONFLICT';
      }
      if (entries.some((entry) => entry.input.key === receipt.key)) {
        return 'SOURCE_RECEIPT_KEY_CONFLICT';
      }
      if (entries.some((entry) => isPeriodReceipt(entry.input))) {
        return 'SOURCE_RECEIPT_SEQUENCE_CONFLICT';
      }
      return null;
    }
    return 'TRAFFIC_RECEIPT_KIND_CONFLICT';
  }

  if (!('pageIndex' in receipt) || !('proof' in receipt) || !('data' in receipt)) {
    return 'TRAFFIC_RECEIPT_KIND_CONFLICT';
  }
  if (sequence !== receipt.pageIndex - 1) return 'SOURCE_RECEIPT_SEQUENCE_CONFLICT';
  if (receipt.startDate !== plan.startDate || receipt.endDate !== plan.endDate) {
    return 'SOURCE_RECEIPT_DATE_CONFLICT';
  }
  if (receipt.period !== plan.periodDays) return 'SOURCE_RECEIPT_PERIOD_CONFLICT';
  if (plan.targetUrl && receipt.url !== plan.targetUrl) return 'SOURCE_RECEIPT_URL_CONFLICT';
  if (entries.length !== sequence) return 'SOURCE_RECEIPT_SEQUENCE_CONFLICT';
  const proof = receipt.proof;
  const expectedVisited = Array.from({ length: receipt.pageIndex }, (_, index) => index + 1);
  if (
    !proof.verified
    || proof.expectedPages < receipt.pageIndex
    || proof.visitedPages.length !== receipt.pageIndex
    || proof.visitedPages.some((page, index) => page !== expectedVisited[index])
    || (receipt.pageIndex < proof.expectedPages && (proof.complete || proof.terminalPageObserved))
    || (receipt.pageIndex === proof.expectedPages && (!proof.complete || !proof.terminalPageObserved))
    || (proof.explicitEmpty && (receipt.data.length > 0 || receipt.pageIndex !== 1 || proof.expectedPages !== 1))
  ) {
    return 'INCOMPLETE_TRAFFIC_COVERAGE';
  }
  const firstPageReceipt = entries.map((entry) => entry.receipt).find(isPageReceipt);
  if (firstPageReceipt && firstPageReceipt.expectedPages !== proof.expectedPages) {
    return 'SOURCE_RECEIPT_PAGE_COUNT_CONFLICT';
  }
  const keys = entries.map((entry) => entry.input.key);
  if (keys.includes(receipt.key)) return 'SOURCE_RECEIPT_KEY_CONFLICT';
  return null;
}

/**
 * The dates this submission actually confirmed, in plan order.
 *
 * Coupang publishes traffic and sales at different times — its own screen says
 * so, labelling them separately — so the last day of a requested window is
 * routinely not ready while every earlier day is. The collection used to be
 * all-or-nothing against `plan.expectedDates`, which threw away every measured
 * day for the sake of one unready one. That is the mirror image of inventing a
 * zero, and the approved source-units amendment rules it out: a date that can
 * be verified complete on its own is confirmed inside the owner's transaction
 * "even when other dates in the collection fail".
 *
 * The plan is not narrowed. Receipt sequences are numbered off the plan's full
 * date list, so dropping dates from the plan would renumber the dates that
 * remain and collide with receipts an earlier attempt already had accepted.
 * The confirmed set is a subset of the plan instead, and a later attempt fills
 * in the rest over the same sequence space.
 */
function confirmedDatesOf(
  plan: ReturnType<typeof AdTrafficSourcePlanSchema.parse>,
  entries: ReceiptEntry[],
): string[] {
  if (!isDailyPlan(plan)) return [];
  const period = entries.map((entry) => entry.input).find(isPeriodReceipt);
  if (!period) return [];
  const start = plan.expectedDates.indexOf(period.startDate);
  const end = plan.expectedDates.indexOf(period.endDate);
  if (start < 0 || end < start) return [];
  return plan.expectedDates.slice(start, end + 1);
}

function providerBackedEmptyDatesOf(
  confirmedDates: readonly string[],
  entries: readonly ReceiptEntry[],
): string[] {
  const dailyPages = entries
    .map((entry) => entry.input)
    .filter((input): input is AdTrafficSourceDailyReceiptInput => isDailyReceipt(input));
  return confirmedDates.filter((businessDate) => {
    const pages = dailyPages.filter((page) => page.businessDate === businessDate);
    return pages.length > 0 && pages.every((page) =>
      page.data.length === 0 && page.proof.explicitEmpty === true);
  });
}

function validateCoverage(plan: ReturnType<typeof AdTrafficSourcePlanSchema.parse>, entries: ReceiptEntry[]): string | null {
  if (!entries.length) return 'INCOMPLETE_TRAFFIC_COVERAGE';
  if (isDailyPlan(plan)) {
    const daily = entries
      .map((entry) => entry.input)
      .filter((input): input is AdTrafficSourceDailyReceiptInput => isDailyReceipt(input));
    const period = entries.find((entry) => isPeriodReceipt(entry.input));
    if (!period || !isPeriodReceipt(period.input)) return 'INCOMPLETE_TRAFFIC_COVERAGE';
    // A date outside the plan is still a scope conflict: the owner decides which
    // window may be collected, and nothing here lets a client widen it.
    const confirmed = confirmedDatesOf(plan, entries);
    // Nothing confirmed is the one case that is still a flat failure — there is
    // no measured date to publish.
    if (!confirmed.length) return 'INCOMPLETE_TRAFFIC_COVERAGE';
    // Stray pages for a date outside the declared window would otherwise be
    // accepted and then silently dropped, which is how a half-collected day
    // would come to look absent rather than incomplete. Every page has to belong
    // to the window the collection says it confirmed.
    const confirmedSet = new Set(confirmed);
    if (daily.some((page) => !confirmedSet.has(page.businessDate))) {
      return 'SOURCE_RECEIPT_SCOPE_CONFLICT';
    }
    for (const businessDate of confirmed) {
      const pages = daily
        .filter((page) => page.businessDate === businessDate)
        .sort((left, right) => left.pageIndex - right.pageIndex);
      if (!pages.length) return 'INCOMPLETE_TRAFFIC_COVERAGE';
      const expectedPages = pages[0]!.proof.expectedPages;
      if (pages.length !== expectedPages) return 'INCOMPLETE_TRAFFIC_COVERAGE';
      for (const [index, page] of pages.entries()) {
        const expectedVisited = Array.from({ length: index + 1 }, (_, value) => value + 1);
        if (
          page.pageIndex !== index + 1
          || page.proof.expectedPages !== expectedPages
          || !page.proof.verified
          || page.proof.visitedPages.length !== expectedVisited.length
          || page.proof.visitedPages.some((value, valueIndex) => value !== expectedVisited[valueIndex])
          || (index === pages.length - 1
            ? !page.proof.complete || !page.proof.terminalPageObserved
            : page.proof.complete || page.proof.terminalPageObserved)
        ) {
          return 'INCOMPLETE_TRAFFIC_COVERAGE';
        }
      }
      const rowCount = pages.reduce((sum, page) => sum + page.data.length, 0);
      if (rowCount === 0 && !pages.every((page) => page.proof.explicitEmpty === true)) {
        return 'EMPTY_TRAFFIC_PROOF_REQUIRED';
      }
    }
    return null;
  }
  const pages = entries
    .map((entry) => entry.input)
    .filter((input): input is AdTrafficSourceLegacyReceiptInput => isLegacyReceiptInput(input));
  const expectedPages = pages[0]!.proof.expectedPages;
  if (pages.length !== expectedPages) return 'INCOMPLETE_TRAFFIC_COVERAGE';
  for (const [index, page] of pages.entries()) {
    const expectedVisited = Array.from({ length: index + 1 }, (_, value) => value + 1);
    if (
      page.pageIndex !== index + 1
      || page.startDate !== plan.startDate
      || page.endDate !== plan.endDate
      || page.period !== plan.periodDays
      || (plan.targetUrl && page.url !== plan.targetUrl)
      || !page.proof.verified
      || page.proof.expectedPages !== expectedPages
      || page.proof.visitedPages.length !== expectedVisited.length
      || page.proof.visitedPages.some((value, valueIndex) => value !== expectedVisited[valueIndex])
      || (index === pages.length - 1
        ? !page.proof.complete || !page.proof.terminalPageObserved
        : page.proof.complete || page.proof.terminalPageObserved)
    ) {
      return 'INCOMPLETE_TRAFFIC_COVERAGE';
    }
  }
  const rowCount = pages.reduce((sum, page) => sum + page.data.length, 0);
  if (rowCount === 0 && !(pages.length === 1 && pages[0]!.proof.explicitEmpty === true)) {
    return 'EMPTY_TRAFFIC_PROOF_REQUIRED';
  }
  return null;
}

function dashboardPayload(entries: ReceiptEntry[]) {
  const nonEmpty = <T extends Record<string, unknown>>(key: 'kpis' | 'summary' | 'adSummary') => {
    const values = entries
      .map((entry) => entry.input)
      .filter((input): input is AdTrafficSourceLegacyReceiptInput => isLegacyReceiptInput(input))
      .map((input) => input[key])
      .filter((value): value is T => !!value && typeof value === 'object' && Object.keys(value).length > 0);
    if (!values.length) return {} as T;
    const first = values[0]!;
    const firstHash = hash(first);
    if (values.some((value) => hash(value) !== firstHash)) {
      throw new ConflictException('TRAFFIC_DASHBOARD_SUMMARY_CONFLICT');
    }
    return first;
  };
  const kpis = nonEmpty('kpis');
  const summary = nonEmpty('summary');
  const adSummary = nonEmpty('adSummary');
  const hasSignal = Object.keys(kpis).length > 0 || Object.keys(summary).length > 0 || Object.keys(adSummary).length > 0;
  if (!hasSignal) return null;
  const capturedAt = entries
    .map((entry) => new Date(entry.input.capturedAt))
    .sort((left, right) => right.getTime() - left.getTime())[0]!;
  return {
    kpis,
    summary,
    adSummary: Object.keys(adSummary).length ? adSummary : null,
    capturedAt,
    raw: { kpis, summary, adSummary: Object.keys(adSummary).length ? adSummary : null },
  };
}
