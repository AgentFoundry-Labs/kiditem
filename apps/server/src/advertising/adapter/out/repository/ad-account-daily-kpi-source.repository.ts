import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AdAccountDailyKpiLegacyNormalizedSchema,
  AdAccountDailyKpiNormalizedSchema,
  AdAccountDailyKpiPublishedSchema,
  AdAccountDailyKpiSourceAttemptSchema,
  AdAccountDailyKpiSourceControlSchema,
  AdAccountDailyKpiSourcePlanSchema,
  AdAccountDailyKpiSourceReceiptInputSchema,
  AdAccountDailyKpiSourceReceiptWireSchema,
  AdAccountDailyKpiSourceReceiptSchema,
  AdAccountDailyKpiSourceStatusSchema,
  type AdAccountDailyKpiNormalized,
  type AdAccountDailyKpiPublished,
  type AdAccountDailyKpiSourceAttempt,
  type AdAccountDailyKpiSourceControl,
  type AdAccountDailyKpiSourceReceipt,
  type AdAccountDailyKpiSourceReceiptInput,
  type AdAccountDailyKpiSourceStatus,
} from '@kiditem/shared/advertising';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { canonicalOwnerInputHash as hash } from '../../../../common/owner-idempotency-key';
import { resolveCoupangVendorId } from '../../../../channels/domain/coupang-account-identity';
import { currentBusinessDate, toBusinessDate } from '../../../domain/business-date';
import { toNumber } from '../../../domain/scrape-row-normalizers';
import type {
  AdAccountDailyKpiReadPort,
  AdAccountDailyKpiSourcePort,
} from '../../../application/port/in/ad-account-daily-kpi-source.port';

const SOURCE_TYPE = 'coupang_ads_daily';
const SNAPSHOT_SOURCE = 'coupang_ads';
const KPI_TYPE = 'coupang_ads_daily';
const LEGACY_PARSER_VERSION = 'ad-account-daily-kpi-v1';
const PARSER_VERSION = 'ad-account-daily-kpi-v2';
const SNAPSHOT_PAGE_TYPE = 'dashboard_daily';
const RECEIPT_KIND = 'account_daily_kpi';
const SOURCE_ALERT_DEDUPE_KEY = `source:${SOURCE_TYPE}`;
const SOURCE_ALERT_TITLE = '쿠팡 계정 일별 광고 KPI 수집 실패';
const EXPIRES_IN_MS = 30 * 60_000;
const DAY_MS = 86_400_000;
// Recent 30 days is the initial recollection operating recommendation. It is
// a refresh window, not a provider finalization/maturity guarantee.
const DEFAULT_COVERAGE_DAYS = 30;

const ADDITIVE_METRICS = [
  'adSpend',
  'adRevenue',
  'impressions',
  'clicks',
  'conversions',
  'orders',
] as const;

type Tx = Prisma.TransactionClient;
type SourceRun = Prisma.SourceImportRunGetPayload<{}>;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function dateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateAtUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(value: Date, amount: number): Date {
  return new Date(value.getTime() + amount * DAY_MS);
}

function datesInclusive(from: Date, to: Date): string[] {
  const result: string[] = [];
  for (let current = from; current.getTime() <= to.getTime(); current = addDays(current, 1)) {
    result.push(dateText(current));
  }
  return result;
}

function expired(row: SourceRun): boolean {
  return row.status === 'running' && (!row.expiresAt || row.expiresAt.getTime() <= Date.now());
}

/**
 * Legacy v1 receipts remain parseable for terminal replay/resume, but their
 * numeric zeroes carry no column-presence evidence. Published analytics must
 * therefore require a complete v2 evidence stamp before exposing a row.
 */
function hasCompleteObservedMetrics(
  row: AdAccountDailyKpiNormalized,
): boolean {
  return Boolean(
    row.observedMetrics &&
      ADDITIVE_METRICS.every((metric) => row.observedMetrics?.[metric] === true),
  );
}

function normalizedRow(
  row: AdAccountDailyKpiSourceReceiptInput,
  parserVersion: string,
): AdAccountDailyKpiNormalized {
  const observedMetrics = 'observedMetrics' in row.normalized
    ? row.normalized.observedMetrics
    : null;
  if (parserVersion !== PARSER_VERSION && parserVersion !== LEGACY_PARSER_VERSION) {
    throw new BadRequestException('UNSUPPORTED_ACCOUNT_DAILY_KPI_PARSER');
  }
  const missingMetrics = parserVersion === PARSER_VERSION
    ? ADDITIVE_METRICS.filter((metric) => observedMetrics?.[metric] !== true)
    : [];
  if (missingMetrics.length > 0) {
    throw new BadRequestException({
      code: 'INCOMPLETE_DAILY_KPI_METRICS',
      missingMetrics,
    });
  }
  return AdAccountDailyKpiNormalizedSchema.parse({
    adSpend: Math.round(toNumber(row.normalized.adSpend)),
    adRevenue: Math.round(toNumber(row.normalized.adRevenue)),
    impressions: Math.round(toNumber(row.normalized.impressions)),
    clicks: Math.round(toNumber(row.normalized.clicks)),
    // Preserve the provider field mapping: `conversions` is attributed
    // selling units (`adAttributedUnits` / `광고 전환 판매수`), while
    // consumer-facing order counts are read from `orders`
    // (`adAttributedOrders` / `광고 전환 주문수`).
    conversions: Math.round(toNumber(row.normalized.conversions)),
    orders: Math.round(toNumber(row.normalized.orders)),
    // Provider ratios remain provider evidence. A missing provider ratio is
    // not replaced with a derived ratio or a zero.
    providerRoas: row.normalized.roas === null ? null : toNumber(row.normalized.roas),
    providerCtr: row.normalized.ctr === null ? null : toNumber(row.normalized.ctr),
    providerConversionRate:
      row.normalized.conversionRate === null
        ? null
        : toNumber(row.normalized.conversionRate),
    ...(observedMetrics ? { observedMetrics } : {}),
  });
}

@Injectable()
export class AdAccountDailyKpiSourceRepository
  implements AdAccountDailyKpiSourcePort, AdAccountDailyKpiReadPort
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
    targetDate?: string;
  }): Promise<AdAccountDailyKpiSourceAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const requestFingerprint = hash({ targetDate: input.targetDate ?? null });
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
              'Account daily KPI collection expired.',
            )
          : replay;
        return this.attemptView(tx, row);
      }

      const account = await this.primaryAccount(tx, input.organizationId);
      if (!account) throw new NotFoundException('COUPANG_ACCOUNT_NOT_FOUND');
      const advertiserId = resolveCoupangVendorId(account);
      if (!advertiserId) throw new BadRequestException('ADVERTISER_IDENTITY_MISSING');

      const running = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
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
          'Account daily KPI collection expired.',
        );
      }

      const yesterday = addDays(currentBusinessDate(), -1);
      let coverageRangeStart: Date;
      let coverageRangeEnd: Date;
      let expectedDates: string[];
      let businessDates: string[];
      if (input.targetDate) {
        const targetDate = toBusinessDate(input.targetDate);
        if (!targetDate || dateText(targetDate) !== input.targetDate) {
          throw new BadRequestException('INVALID_TARGET_DATE');
        }
        if (targetDate.getTime() > yesterday.getTime()) {
          throw new BadRequestException('TARGET_DATE_IN_FUTURE');
        }
        coverageRangeStart = targetDate;
        coverageRangeEnd = targetDate;
        expectedDates = [input.targetDate];
        businessDates = [input.targetDate];
      } else {
        coverageRangeEnd = yesterday;
        coverageRangeStart = addDays(yesterday, -(DEFAULT_COVERAGE_DAYS - 1));
        expectedDates = datesInclusive(coverageRangeStart, coverageRangeEnd);
        // Recollect every recent date on an explicit start. Delayed provider
        // attribution can revise an already-complete day, so a missing-only
        // plan would leave stale complete values published forever.
        businessDates = [...expectedDates];
      }
      const plan = AdAccountDailyKpiSourcePlanSchema.parse({
        sourceType: SOURCE_TYPE,
        parserVersion: PARSER_VERSION,
        channelAccountId: account.id,
        expectedAdvertiserId: advertiserId,
        coverageRangeStartDate: dateText(coverageRangeStart),
        coverageRangeEndDate: dateText(coverageRangeEnd),
        expectedDates,
        businessDates,
      });

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
          coverageStartDate: coverageRangeStart,
          coverageEndDate: coverageRangeEnd,
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
          businessDate: coverageRangeEnd,
          periodStart: coverageRangeStart,
          periodEnd: coverageRangeEnd,
          period: `${businessDates.length}d`,
        },
      });
      return this.attemptView(tx, row);
    });
  }

  async readSourceStatus(input: {
    organizationId: string;
  }): Promise<AdAccountDailyKpiSourceStatus> {
    return this.prisma.$transaction(
      (tx) => this.sourceStatusIn(tx, input.organizationId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdAccountDailyKpiSourceAttempt | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.sourceImportRun.findFirst({
          where: {
            id: input.attemptId,
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
          },
        });
        return row ? this.attemptView(tx, row) : null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<AdAccountDailyKpiSourceControl | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.sourceImportRun.findFirst({
          where: {
            id: input.attemptId,
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
          },
        });
        if (!row) return null;
        return this.controlView(tx, row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async uploadReceipt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    sequence: number;
    receipt: AdAccountDailyKpiSourceReceiptInput;
  }): Promise<AdAccountDailyKpiSourceReceipt> {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.find(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      // Match the existing source-owner wire convention: the receipt checksum
      // authenticates the submitted body; sequence is fenced separately by
      // the ChannelScrapeChunk unique key and frozen plan.
      const checksum = hash(input.receipt);
      const run = await this.scrapeRun(tx, row);
      const existingChunk = await tx.channelScrapeChunk.findFirst({
        where: {
          organizationId: input.organizationId,
          scrapeRunId: run.id,
          kind: RECEIPT_KIND,
          sequence: input.sequence,
        },
      });
      if (existingChunk) {
        if (existingChunk.checksum !== checksum) {
          throw new ConflictException('SOURCE_RECEIPT_CONFLICT');
        }
        const publication = existingChunk.publicationJson as Record<string, unknown>;
        return {
          receipt: AdAccountDailyKpiSourceReceiptSchema.parse(publication.receipt),
        };
      }
      if (row.status !== 'running') throw new ConflictException('SOURCE_ATTEMPT_TERMINAL');
      if (expired(row)) {
        await this.failIn(
          tx,
          row,
          'ATTEMPT_EXPIRED',
          'Account daily KPI collection expired.',
        );
        return { failure: 'ATTEMPT_EXPIRED' as const };
      }

      const plan = AdAccountDailyKpiSourcePlanSchema.parse(row.plan);
      if (input.sequence >= plan.businessDates.length) {
        throw new ConflictException('SOURCE_RECEIPT_SEQUENCE_CONFLICT');
      }
      if (input.receipt.businessDate !== plan.businessDates[input.sequence]) {
        throw new ConflictException('SOURCE_RECEIPT_DATE_CONFLICT');
      }
      if (input.receipt.normalized.date !== input.receipt.businessDate) {
        throw new BadRequestException('SOURCE_RECEIPT_DATE_MISMATCH');
      }
      const parsedDate = toBusinessDate(input.receipt.businessDate);
      if (!parsedDate || dateText(parsedDate) !== input.receipt.businessDate) {
        throw new BadRequestException('INVALID_BUSINESS_DATE');
      }
      if (!input.receipt.providerAdvertiserId) {
        await this.failIn(
          tx,
          row,
          'ADVERTISER_IDENTITY_MISSING',
          'Account daily KPI receipt is missing the observed advertiser identity.',
          checksum,
        );
        return { failure: 'ADVERTISER_IDENTITY_MISSING' as const };
      }
      if (
        input.receipt.providerAdvertiserId !== plan.expectedAdvertiserId
      ) {
        await this.failIn(
          tx,
          row,
          'ADVERTISER_IDENTITY_MISMATCH',
          'Account daily KPI advertiser identity does not match the frozen account.',
          checksum,
        );
        return { failure: 'ADVERTISER_IDENTITY_MISMATCH' as const };
      }

      const normalized = normalizedRow(input.receipt, plan.parserVersion);
      const snapshot = await tx.channelScrapeSnapshot.create({
        data: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          scrapeRunId: run.id,
          channel: 'coupang',
          source: SNAPSHOT_SOURCE,
          pageType: SNAPSHOT_PAGE_TYPE,
          businessDate: parsedDate,
          observedAt: new Date(input.receipt.observedAt),
          matchStatus: 'unmatched',
          matchReason: 'kpi-only daily aggregate (account total; no listing identity)',
          rowHash: checksum,
          rawJson: json(input.receipt.rawJson),
          normalizedJson: json(normalized),
        },
      });
      const receipt = AdAccountDailyKpiSourceReceiptSchema.parse({
        sequence: input.sequence,
        businessDate: input.receipt.businessDate,
        observedAt: input.receipt.observedAt,
        checksum,
        rowCount: input.receipt.normalized.rowCount,
        snapshotId: snapshot.id,
      });
      await tx.channelScrapeChunk.create({
        data: {
          organizationId: input.organizationId,
          scrapeRunId: run.id,
          kind: RECEIPT_KIND,
          sequence: input.sequence,
          checksum,
          itemCount: receipt.rowCount,
          payload: json(input.receipt),
          publicationJson: json({ receipt }),
        },
      });
      await tx.sourceImportRun.update({
        where: { id: row.id, organizationId: input.organizationId },
        data: { rowCount: { increment: receipt.rowCount } },
      });
      return { receipt };
    });
    if ('failure' in result) throw new ConflictException(result.failure);
    return result.receipt;
  }

  async finalizeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    manifestChecksum: string;
  }): Promise<AdAccountDailyKpiSourceStatus> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.find(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      const receipts = await this.receiptsIn(tx, row);
      const currentView = await this.attemptView(tx, row, receipts);
      if (row.status !== 'running') {
        if (row.contentChecksum === input.manifestChecksum) {
          return this.sourceStatusIn(tx, input.organizationId);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) {
        await this.failIn(
          tx,
          row,
          'ATTEMPT_EXPIRED',
          'Account daily KPI collection expired.',
        );
        return this.sourceStatusIn(tx, input.organizationId);
      }
      if (currentView.manifestChecksum !== input.manifestChecksum) {
        throw new ConflictException('SOURCE_MANIFEST_MISMATCH');
      }
      const plan = AdAccountDailyKpiSourcePlanSchema.parse(row.plan);
      const receiptInputs = await this.receiptInputsIn(tx, row);
      if (
        receipts.length !== plan.businessDates.length ||
        receipts.some(
          (receipt, index) =>
            receipt.sequence !== index || receipt.businessDate !== plan.businessDates[index],
        )
      ) {
        throw new ConflictException('INCOMPLETE_DAILY_KPI_COVERAGE');
      }
      for (const receipt of receipts) {
        const observedAdvertiserId = receiptInputs.get(receipt.sequence);
        if (!observedAdvertiserId) {
          await this.failIn(
            tx,
            row,
            'ADVERTISER_IDENTITY_MISSING',
            'Account daily KPI receipt is missing the observed advertiser identity.',
            input.manifestChecksum,
          );
          return this.sourceStatusIn(tx, input.organizationId);
        }
        if (observedAdvertiserId !== plan.expectedAdvertiserId) {
          await this.failIn(
            tx,
            row,
            'ADVERTISER_IDENTITY_MISMATCH',
            'Account daily KPI advertiser identity does not match the frozen account.',
            input.manifestChecksum,
          );
          return this.sourceStatusIn(tx, input.organizationId);
        }
      }
      if (!(await this.accountMatches(tx, row))) {
        await this.failIn(
          tx,
          row,
          'ADVERTISER_IDENTITY_MISMATCH',
          'Account daily KPI advertiser identity changed.',
          input.manifestChecksum,
        );
        return this.sourceStatusIn(tx, input.organizationId);
      }

      const snapshots = await tx.channelScrapeSnapshot.findMany({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          source: SNAPSHOT_SOURCE,
          pageType: SNAPSHOT_PAGE_TYPE,
          businessDate: { not: null },
        },
        select: {
          id: true,
          businessDate: true,
          observedAt: true,
          normalizedJson: true,
        },
      });
      const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
      for (const receipt of receipts) {
        const snapshot = snapshotsById.get(receipt.snapshotId);
        if (
          !snapshot ||
          !snapshot.businessDate ||
          dateText(snapshot.businessDate) !== receipt.businessDate ||
          !snapshot.normalizedJson
        ) {
          throw new ConflictException('INCOMPLETE_DAILY_KPI_COVERAGE');
        }
        // v1 snapshots intentionally have no observedMetrics proof. Validate
        // their legacy shape for replay/finalization without upgrading them.
        const normalizedSchema = plan.parserVersion === LEGACY_PARSER_VERSION
          ? AdAccountDailyKpiLegacyNormalizedSchema
          : AdAccountDailyKpiNormalizedSchema;
        normalizedSchema.parse(snapshot.normalizedJson);
      }
      const completedAt = new Date();
      await tx.sourceImportRun.update({
        where: { id: row.id, organizationId: input.organizationId },
        data: {
          status: 'completed',
          contentChecksum: input.manifestChecksum,
          importedAt: completedAt,
          lastVerifiedAt: completedAt,
          verificationCount: { increment: 1 },
          coverageStartDate: dateAtUtc(plan.businessDates[0]),
          coverageEndDate: dateAtUtc(plan.businessDates.at(-1)!),
          qualityReport: json({
            expectedDates: plan.businessDates,
            receiptCount: receipts.length,
            rowCount: receipts.reduce((sum, receipt) => sum + receipt.rowCount, 0),
            canonicalKpiType: KPI_TYPE,
          }),
        },
      });
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: SOURCE_ALERT_DEDUPE_KEY,
        attemptId: row.id,
      });
      return this.sourceStatusIn(tx, input.organizationId);
    });
  }

  async failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<AdAccountDailyKpiSourceStatus> {
    const message = input.message.replace(/(api[_-]?key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]').slice(0, 300);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.find(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      if (row.status !== 'running') {
        if (row.status === 'failed' && row.errorCode === input.code && row.errorMessage === message) {
          return this.sourceStatusIn(tx, input.organizationId);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) {
        await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Account daily KPI collection expired.');
      } else {
        await this.failIn(tx, row, input.code, message, hash({ code: input.code, message }));
      }
      return this.sourceStatusIn(tx, input.organizationId);
    });
  }

  async readPublished(input: {
    organizationId: string;
    from?: string;
    to?: string;
  }): Promise<AdAccountDailyKpiPublished> {
    return this.prisma.$transaction(
      async (tx) => {
        const account = await this.primaryAccount(tx, input.organizationId);
        if (!account) throw new NotFoundException('COUPANG_ACCOUNT_NOT_FOUND');
        const from = input.from ? toBusinessDate(input.from) : null;
        const to = input.to ? toBusinessDate(input.to) : null;
        if (input.from && (!from || dateText(from) !== input.from)) {
          throw new BadRequestException('INVALID_FROM_DATE');
        }
        if (input.to && (!to || dateText(to) !== input.to)) {
          throw new BadRequestException('INVALID_TO_DATE');
        }
        if (from && to && from.getTime() > to.getTime()) {
          throw new BadRequestException('INVALID_DATE_RANGE');
        }
        const rows = await this.completeSnapshotsIn(
          tx,
          input.organizationId,
          account.id,
          from,
          to,
        );
        // Sort first so the newest generation wins for a duplicate business
        // date, then discard incomplete/legacy rows before de-duplicating.
        // If an older v1 row sorts ahead of a complete v2 row, deduplicating
        // before validation would hide the valid row and make the date look
        // unpublished forever.
        const seenDates = new Set<string>();
        const publishedRows = rows
          .sort((left, right) => {
            const dateOrder = left.businessDate!.getTime() - right.businessDate!.getTime();
            if (dateOrder !== 0) return dateOrder;
            const leftGeneration = left.sourceImportRun?.freshnessGeneration ?? 0n;
            const rightGeneration = right.sourceImportRun?.freshnessGeneration ?? 0n;
            if (leftGeneration !== rightGeneration) {
              return leftGeneration > rightGeneration ? -1 : 1;
            }
            const observedOrder = right.observedAt.getTime() - left.observedAt.getTime();
            return observedOrder !== 0 ? observedOrder : left.id.localeCompare(right.id);
          })
          .flatMap((row) => {
            if (!row.businessDate) {
              return [];
            }
            const normalized = AdAccountDailyKpiNormalizedSchema.safeParse(row.normalizedJson);
            // v1 rows are retained in storage for parser-aware replay and
            // control inspection, but they are not availability evidence.
            if (!normalized.success || !hasCompleteObservedMetrics(normalized.data)) {
              return [];
            }
            const businessDate = dateText(row.businessDate);
            if (seenDates.has(businessDate)) return [];
            seenDates.add(businessDate);
            return [{
              businessDate,
              observedAt: row.observedAt.toISOString(),
              normalized: normalized.data,
            }];
          });
        return AdAccountDailyKpiPublishedSchema.parse({
          channelAccountId: account.id,
          rows: publishedRows,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async sourceStatusIn(tx: Tx, organizationId: string): Promise<AdAccountDailyKpiSourceStatus> {
    const account = await this.primaryAccount(tx, organizationId);
    if (!account) {
      return AdAccountDailyKpiSourceStatusSchema.parse({
        channelAccountId: null,
        status: 'MISSING',
        refreshing: false,
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
    const [latest, complete] = await Promise.all([
      tx.sourceImportRun.findFirst({ where, orderBy: [{ freshnessGeneration: 'desc' }, { createdAt: 'desc' }] }),
      tx.sourceImportRun.findFirst({
        where: { ...where, status: 'completed' },
        orderBy: [{ freshnessGeneration: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    const latestAttempt = latest ? await this.attemptView(tx, latest) : null;
    const latestComplete = complete ? await this.attemptView(tx, complete) : null;
    if (!latestComplete) {
      return AdAccountDailyKpiSourceStatusSchema.parse({
        channelAccountId: account.id,
        status: 'MISSING',
        refreshing: latestAttempt?.state === 'RUNNING',
        latestAttempt,
        latestComplete: null,
        actualCutoffAt: null,
      });
    }
    const yesterday = addDays(currentBusinessDate(), -1);
    const coverageStart = addDays(yesterday, -(DEFAULT_COVERAGE_DAYS - 1));
    const expectedDates = datesInclusive(coverageStart, yesterday);
    const rows = await this.completeSnapshotsIn(
      tx,
      organizationId,
      account.id,
      coverageStart,
      yesterday,
    );
    const present = new Set(
      rows.flatMap((row) => {
        const normalized = AdAccountDailyKpiNormalizedSchema.safeParse(row.normalizedJson);
        return normalized.success && hasCompleteObservedMetrics(normalized.data)
          ? [dateText(row.businessDate!)]
          : [];
      }),
    );
    const covered = expectedDates.every((date) => present.has(date));
    const failed = latestAttempt?.state === 'FAILED';
    return AdAccountDailyKpiSourceStatusSchema.parse({
      channelAccountId: account.id,
      status: covered && !failed ? 'READY' : 'STALE',
      refreshing: latestAttempt?.state === 'RUNNING',
      latestAttempt,
      latestComplete,
      actualCutoffAt: latestComplete.actualCutoffAt,
    });
  }

  private async primaryAccount(tx: Tx, organizationId: string) {
    return tx.channelAccount.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        status: 'active',
      },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  private completeSnapshotsIn(
    tx: Tx,
    organizationId: string,
    channelAccountId: string,
    from?: Date | null,
    to?: Date | null,
  ) {
    return tx.channelScrapeSnapshot.findMany({
      where: {
        organizationId,
        source: SNAPSHOT_SOURCE,
        pageType: SNAPSHOT_PAGE_TYPE,
        businessDate: {
          not: null,
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
        sourceImportRun: {
          organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId,
          status: 'completed',
        },
      },
      select: {
        id: true,
        businessDate: true,
        observedAt: true,
        normalizedJson: true,
        sourceImportRun: {
          select: { freshnessGeneration: true },
        },
      },
    });
  }

  private async accountMatches(tx: Tx, row: SourceRun): Promise<boolean> {
    const account = await tx.channelAccount.findFirst({
      where: {
        id: row.channelAccountId!,
        organizationId: row.organizationId,
        channel: 'coupang',
        status: 'active',
      },
    });
    const expected = AdAccountDailyKpiSourcePlanSchema.parse(row.plan).expectedAdvertiserId;
    return !!account && resolveCoupangVendorId(account) === expected;
  }

  private async find(tx: Tx, organizationId: string, attemptId: string): Promise<SourceRun> {
    const row = await tx.sourceImportRun.findFirst({
      where: { id: attemptId, organizationId, sourceType: SOURCE_TYPE },
    });
    if (!row) throw new NotFoundException('AD_ACCOUNT_DAILY_KPI_ATTEMPT_NOT_FOUND');
    return row;
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
    if (!run) throw new NotFoundException('AD_ACCOUNT_DAILY_KPI_STAGING_NOT_FOUND');
    return run;
  }

  private async receiptsIn(tx: Tx, row: SourceRun): Promise<AdAccountDailyKpiSourceReceipt[]> {
    const run = await this.scrapeRun(tx, row);
    const chunks = await tx.channelScrapeChunk.findMany({
      where: { organizationId: row.organizationId, scrapeRunId: run.id, kind: RECEIPT_KIND },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      select: { publicationJson: true },
    });
    return chunks.flatMap((chunk) => {
      if (!chunk.publicationJson || typeof chunk.publicationJson !== 'object') return [];
      const value = (chunk.publicationJson as Record<string, unknown>).receipt;
      const parsed = AdAccountDailyKpiSourceReceiptSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    });
  }

  private async receiptInputsIn(
    tx: Tx,
    row: SourceRun,
  ): Promise<Map<number, string | null>> {
    const run = await this.scrapeRun(tx, row);
    const plan = AdAccountDailyKpiSourcePlanSchema.parse(row.plan);
    const chunks = await tx.channelScrapeChunk.findMany({
      where: { organizationId: row.organizationId, scrapeRunId: run.id, kind: RECEIPT_KIND },
      select: { sequence: true, payload: true },
    });
    return new Map(
      chunks.map((chunk) => {
        const parsed = plan.parserVersion === PARSER_VERSION
          ? AdAccountDailyKpiSourceReceiptInputSchema.safeParse(chunk.payload)
          : plan.parserVersion === LEGACY_PARSER_VERSION
            ? AdAccountDailyKpiSourceReceiptWireSchema.safeParse(chunk.payload)
            : { success: false as const };
        return [chunk.sequence, parsed.success ? parsed.data.providerAdvertiserId ?? null : null];
      }),
    );
  }

  private async attemptView(
    tx: Tx,
    row: SourceRun,
    receipts?: AdAccountDailyKpiSourceReceipt[],
  ): Promise<AdAccountDailyKpiSourceAttempt> {
    const entries = receipts ?? (await this.receiptsIn(tx, row));
    const plan = AdAccountDailyKpiSourcePlanSchema.parse(row.plan);
    return AdAccountDailyKpiSourceAttemptSchema.parse({
      attemptId: row.id,
      sourceImportRunId: row.id,
      channelAccountId: row.channelAccountId,
      state:
        row.status === 'completed'
          ? 'COMPLETE'
          : row.status === 'running' && !expired(row)
            ? 'RUNNING'
            : 'FAILED',
      plan,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      // This is the latest business date proven by the complete generation,
      // not the wall-clock time at which the terminal transaction committed.
      actualCutoffAt:
        row.status === 'completed'
          ? dateAtUtc(plan.coverageRangeEndDate).toISOString()
          : null,
      receiptCount: entries.length,
      rowCount: row.rowCount,
      manifestChecksum: hash({ plan, receipts: entries }),
      errorCode: expired(row) ? 'ATTEMPT_EXPIRED' : row.errorCode,
      errorMessage: expired(row) ? 'Account daily KPI collection expired.' : row.errorMessage,
    });
  }

  private async controlView(tx: Tx, row: SourceRun): Promise<AdAccountDailyKpiSourceControl> {
    const attempt = await this.attemptView(tx, row);
    const receipts = await this.receiptsIn(tx, row);
    return AdAccountDailyKpiSourceControlSchema.parse({
      ...attempt,
      attemptToken: row.attemptToken,
      receipts,
    });
  }

  private async failIn(
    tx: Tx,
    row: SourceRun,
    code: string,
    message: string,
    checksum?: string,
  ): Promise<SourceRun> {
    const failed = await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: {
        status: 'failed',
        errorCode: code,
        errorMessage: message,
        ...(checksum ? { contentChecksum: checksum } : {}),
      },
    });
    if (code !== 'USER_CANCELLED') {
      await this.alerts.upsertSourceFailure(tx, {
        organizationId: row.organizationId,
        sourceType: SOURCE_TYPE,
        attemptId: row.id,
        dedupeKey: SOURCE_ALERT_DEDUPE_KEY,
        severity: 'error',
        title: SOURCE_ALERT_TITLE,
        message: `${code}: ${message}`.slice(0, 300),
        href: '/ad-ops',
      });
    }
    return failed;
  }

  private async lock(tx: Tx, organizationId: string): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${SOURCE_TYPE}`}, 0))::text AS lock
      FROM (SELECT ${organizationId}::uuid AS organization_id) AS tenant WHERE organization_id = ${organizationId}::uuid`;
  }
}
