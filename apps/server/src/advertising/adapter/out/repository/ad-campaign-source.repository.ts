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
  AdCampaignSourcePlanSchema,
  type AdCampaignSourceBegin,
  type AdCampaignSourceAttempt,
  type AdCampaignSourceControl,
  type AdCampaignSourceStatus,
  type AdCampaignSourceReceiptInput,
  type AdCampaignSourceReceipt,
  type AdCampaignPayload,
} from '@kiditem/shared/advertising';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { canonicalOwnerInputHash as hash } from '../../../../common/owner-idempotency-key';
import { OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE } from '../../../../common/operator-cancel';
import { resolveCoupangVendorId } from '../../../../channels/domain/coupang-account-identity';
import {
  addDays,
  businessDateKey,
  datesInclusive,
  evidenceCutoffDate,
  inclusiveDayCount,
  kstDayStart,
  parseBusinessDate,
  shiftBusinessDateKey,
} from '../../../../common/kst';
import {
  normalizeAdCampaignTarget,
  hasCompleteObservedAdditiveMetrics,
  mergeAuthoritativeTargetInputs,
} from '../../../application/service/ad-campaign-normalizer';
import {
  normalizeAdKeywordTarget,
  mergeKeywordTargets,
} from '../../../application/service/ad-keyword-normalizer';
import { resolveCampaignReportAuthority } from '../../../domain/campaign-report-authority';
import { adReportEvidenceCutoff, confirmedAdReportEnd } from '../../../domain/ad-report-confirmation';
import {
  AdMetricUnparseableError,
  pairScrapeRows,
  cleanString,
  parseProviderNumber,
} from '../../../domain/scrape-row-normalizers';
import {
  matchListingFromRow,
  matchStatusOf,
  pickStringField,
  type ListingMap,
} from '../../../domain/listing-match';
import { canonicalCampaignIdentity } from '../../../domain/util/ad-target-key';
import type { UpsertAdTargetDailyInput } from '../../../application/port/out/repository/channel-target-daily.repository.port';

const SOURCE = 'coupang_ad_campaign';
const PARSER = 'ad-campaign-v1';
type Tx = Prisma.TransactionClient;
type Attempt = Prisma.SourceImportRunGetPayload<{}>;
const scope = (organizationId: string) => ({
  organizationId,
  sourceType: SOURCE,
  parserVersion: PARSER,
});
const json = (value: unknown) => value as Prisma.InputJsonValue;

/** SourceImportRun owns terminality; its linked scrape run contains only private receipts. */
@Injectable()
export class AdCampaignSourceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async begin(org: string, key: string, input: AdCampaignSourceBegin) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const replay = await tx.sourceImportRun.findFirst({
        where: { ...scope(org), idempotencyKey: key },
      });
      if (replay) {
        if (replay.requestFingerprint !== hash(input))
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        const row = expired(replay)
          ? await this.failIn(tx, replay, 'ATTEMPT_EXPIRED', 'Ad campaign collection expired.')
          : replay;
        return this.viewIn(tx, row, true);
      }
      const account = await tx.channelAccount.findFirst({
        where: {
          organizationId: org,
          channel: 'coupang',
          status: 'active',
          ...(input.channelAccountId ? { id: input.channelAccountId } : {}),
        },
        orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      });
      if (!account) throw new NotFoundException('COUPANG_ACCOUNT_NOT_FOUND');
      const running = await tx.sourceImportRun.findFirst({
        where: {
          ...scope(org),
          channelAccountId: account.id,
          status: 'running',
        },
      });
      if (running) {
        if (!expired(running))
          throw new ConflictException({
            code: 'ATTEMPT_IN_PROGRESS',
            attemptId: running.id,
          });
        await this.failIn(tx, running, 'ATTEMPT_EXPIRED', 'Ad campaign collection expired.');
      }
      const advertiserId = resolveCoupangVendorId(account);
      if (!advertiserId) throw new BadRequestException('ADVERTISER_IDENTITY_MISSING');
      const end = evidenceCutoffDate();
      const isManual = 'captureMode' in input && input.captureMode === 'manual_report';
      const plan = isManual
        ? manualPlan(input, account.id, advertiserId)
        : AdCampaignSourcePlanSchema.parse({
            sourceType: SOURCE,
            parserVersion: PARSER,
            channelAccountId: account.id,
            expectedAdvertiserId: advertiserId,
            startDate: businessDateKey(addDays(end, -30)),
            endDate: businessDateKey(end),
            businessDates: datesInclusive(addDays(end, -30), end)
              .map(businessDateKey)
              .reverse(),
          });
      const start = new Date(`${plan.startDate}T00:00:00.000Z`);
      const period = plan.captureMode === 'manual_report' ? plan.period : '31d';
      const previous = await tx.sourceImportRun.aggregate({
        where: { ...scope(org), channelAccountId: account.id },
        _max: { freshnessGeneration: true },
      });
      const row = await tx.sourceImportRun.create({
        data: {
          ...scope(org),
          channelAccountId: account.id,
          idempotencyKey: key,
          requestFingerprint: hash(input),
          attemptToken: randomUUID(),
          plan: json(plan),
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
          freshnessGeneration: (previous._max.freshnessGeneration ?? 0n) + 1n,
        },
      });
      await tx.channelScrapeRun.create({
        data: {
          organizationId: org,
          channelAccountId: account.id,
          sourceImportRunId: row.id,
          channel: 'coupang',
          source: SOURCE,
          pageType: isManual ? 'manual_report' : 'campaign',
          parserVersion: PARSER,
          businessDate: new Date(`${plan.endDate}T00:00:00.000Z`),
          periodStart: start,
          periodEnd: new Date(`${plan.endDate}T00:00:00.000Z`),
          period,
        },
      });
      return this.viewIn(tx, row, true);
    });
  }

  async read(org: string, id: string, control = false) {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await this.find(tx, org, id);
        return control ? this.viewIn(tx, row, true) : this.viewIn(tx, row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readManualReports(org: string, startDate: string, endDate: string) {
    const start = dateAtUtc(startDate);
    const end = dateAtUtc(endDate);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      startDate !== businessDateKey(start) ||
      endDate !== businessDateKey(end) ||
      start.getTime() > end.getTime()
    ) {
      throw new BadRequestException('INVALID_MANUAL_REPORT_RANGE');
    }
    return this.prisma.$transaction(
      async (tx) => {
        const account = await tx.channelAccount.findFirst({
          where: {
            organizationId: org,
            channel: 'coupang',
            status: 'active',
          },
          orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
        });
        if (!account) throw new NotFoundException('COUPANG_ACCOUNT_NOT_FOUND');
        const rows = await tx.sourceImportRun.findMany({
          where: {
            ...scope(org),
            channelAccountId: account.id,
            status: 'completed',
          },
          orderBy: [{ freshnessGeneration: 'desc' }, { importedAt: 'desc' }, { id: 'desc' }],
        });
        const reports = [];
        for (const row of rows) {
          const parsed = AdCampaignSourcePlanSchema.safeParse(row.plan);
          if (
            !parsed.success ||
            parsed.data.captureMode !== 'manual_report' ||
            parsed.data.startDate !== startDate ||
            parsed.data.endDate !== endDate
          )
            continue;
          // A report that held its day back as unreported is not authoritative.
          if (!row.coverageEndDate || businessDateKey(row.coverageEndDate) < parsed.data.endDate)
            continue;
          const entries = (await this.receiptsIn(tx, row)).entries;
          const report = entries.find((entry) => entry.report)?.report;
          if (!report) continue;
          reports.push({
            attemptId: row.id,
            generation: String(row.freshnessGeneration ?? 0n),
            plan: parsed.data,
            payload: report,
          });
          // A completed report that confirmed its whole range, even an empty
          // one, is authoritative for this exact displayed range. Do not fall
          // through to an older manual report; failed attempts are absent from
          // `rows` and therefore keep the previous completed report visible.
          break;
        }
        return { channelAccountId: account.id, reports };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async source(org: string, accountId?: string): Promise<AdCampaignSourceStatus> {
    return this.prisma.$transaction(
      async (tx) => {
        const account = await tx.channelAccount.findFirst({
          where: {
            organizationId: org,
            channel: 'coupang',
            status: 'active',
            ...(accountId ? { id: accountId } : {}),
          },
          orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
        });
        if (!account && accountId) throw new NotFoundException('COUPANG_ACCOUNT_NOT_FOUND');
        if (!account)
          return {
            channelAccountId: null,
            ready: false,
            latestAttempt: null,
            latestComplete: null,
            actualCutoffAt: null,
          };
        const where = { ...scope(org), channelAccountId: account.id };
        const rows = await tx.sourceImportRun.findMany({
          where,
          orderBy: [{ freshnessGeneration: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        });
        const latest = rows.find(isCampaignSweepRow) ?? null;
        const complete = rows.find((row) => row.status === 'completed' && isCampaignSweepRow(row)) ?? null;
        const latestAttempt = latest ? await this.viewIn(tx, latest) : null;
        const latestComplete = complete
          ? complete.id === latest?.id
            ? latestAttempt
            : await this.viewIn(tx, complete)
          : null;
        const confirmedEnd = complete?.coverageEndDate
          ? businessDateKey(complete.coverageEndDate)
          : null;
        const expectedEnd = adReportEvidenceCutoff({
          closedDay: businessDateKey(evidenceCutoffDate()),
          collections: [latestComplete && confirmedEnd
            ? { requestedEnd: latestComplete.plan.endDate, confirmedEnd }
            : null],
        });
        const eligibleComplete = latestComplete !== null
          && latestComplete.plan.expectedAdvertiserId === resolveCoupangVendorId(account)
          ? { actualCutoff: confirmedEnd ?? latestComplete.plan.endDate }
          : null;
        return {
          channelAccountId: account.id,
          ready: deriveSourceReadiness({
            latestAttempt,
            latestComplete: eligibleComplete,
            requiredCutoff: expectedEnd,
          }).ready,
          latestAttempt,
          latestComplete,
          actualCutoffAt: latestComplete?.actualCutoffAt ?? null,
        } satisfies AdCampaignSourceStatus;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async fail(org: string, id: string, token: string, code: string, message: string) {
    const clean = message
      .replace(/(api[_-]?key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
      .slice(0, 300);
    const checksum = hash({ code, message: clean });
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const row = await this.find(tx, org, id);
      if (row.attemptToken !== token) throw new ConflictException('ATTEMPT_FENCE_LOST');
      if (row.status !== 'running') {
        if (row.status === 'failed' && row.contentChecksum === checksum)
          return await this.viewIn(tx, row);
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      const failed = expired(row)
        ? await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Ad campaign collection expired.')
        : await this.failIn(tx, row, code, clean, checksum);
      return await this.viewIn(tx, failed);
    });
  }

  /** Operator stop without the attempt token; a terminal attempt is returned as it is. */
  async cancel(org: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const row = await this.find(tx, org, id);
      if (row.status !== 'running') return await this.viewIn(tx, row);
      const failed = expired(row)
        ? await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Ad campaign collection expired.')
        : await this.failIn(
            tx,
            row,
            OPERATOR_CANCEL_CODE,
            OPERATOR_CANCEL_MESSAGE,
            hash({ code: OPERATOR_CANCEL_CODE, message: OPERATOR_CANCEL_MESSAGE }),
          );
      return await this.viewIn(tx, failed);
    });
  }

  async capture(
    org: string,
    id: string,
    token: string,
    sequence: number,
    payload: AdCampaignSourceReceiptInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const row = await this.find(tx, org, id);
      if (row.attemptToken !== token) throw new ConflictException('ATTEMPT_FENCE_LOST');
      const checksum = hash(payload);
      if (row.status !== 'running') {
        if (row.status === 'failed' && row.contentChecksum === checksum)
          return { ...(await this.viewIn(tx, row)), receipt: null };
        throw new ConflictException('SOURCE_ATTEMPT_TERMINAL');
      }
      if (expired(row))
        return {
          ...(await this.viewIn(
            tx,
            await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Ad campaign collection expired.'),
          )),
          receipt: null,
        };
      const data = await this.receiptsIn(tx, row);
      const previous = data.entries.find((entry) => entry.receipt.sequence === sequence);
      if (previous) {
        if (previous.receipt.checksum !== checksum)
          throw new ConflictException('SOURCE_RECEIPT_CONFLICT');
        return { ...attemptView(row, data.entries), receipt: previous.receipt };
      }
      if (
        data.entries.some((entry) => entry.receipt.key === payload.key) ||
        sequence !== (data.entries.at(-1)?.receipt.sequence ?? -1) + 1
      )
        throw new ConflictException('SOURCE_RECEIPT_SEQUENCE_CONFLICT');
      const plan = AdCampaignSourcePlanSchema.parse(row.plan);
      if (
        !(await this.accountMatches(tx, row)) ||
        (payload.kind !== 'auxiliary_keywords' &&
          payload.advertiserId !== plan.expectedAdvertiserId)
      ) {
        return {
          ...(await this.viewIn(
            tx,
            await this.failIn(
              tx,
              row,
              'ADVERTISER_IDENTITY_MISMATCH',
              'Ad campaign account does not match its frozen identity.',
              checksum,
            ),
          )),
          receipt: null,
        };
      }
      const receipt: AdCampaignSourceReceipt = {
        sequence,
        key: payload.key,
        kind: payload.kind,
        checksum,
        ...('campaignKey' in payload ? { campaignKey: payload.campaignKey } : {}),
        ...(payload.kind === 'campaign_day' ? { businessDate: payload.businessDate } : {}),
        ...(payload.kind === 'campaign' ? { mode: payload.mode } : {}),
        ...(payload.kind === 'manual_report'
          ? { period: payload.period, startDate: payload.startDate, endDate: payload.endDate }
          : {}),
      };
      const entry: ReceiptEntry = { receipt };
      const validation = validateReceipt(plan, payload, data.entries);
      if (validation && payload.kind !== 'auxiliary_keywords') {
        return {
          ...(await this.viewIn(
            tx,
            await this.failIn(
              tx,
              row,
              validation,
              'Ad campaign receipt lacks complete frozen coverage.',
              checksum,
            ),
          )),
          receipt: null,
        };
      }
      if (payload.kind === 'dashboard_page') entry.page = payload;
      if (payload.kind === 'campaign') {
        const { payload: _raw, ...descriptor } = payload;
        entry.campaign = descriptor;
      }
      if (payload.kind === 'manual_report') {
        entry.report = payload.payload;
        await this.stageReport(
          tx,
          row,
          data.run.id,
          payload.payload,
          payload.capturedAt,
          null,
          null,
        );
      }
      let targets: UpsertAdTargetDailyInput[] = [];
      if (payload.kind === 'campaign_day' || (payload.kind === 'campaign' && payload.payload)) {
        const campaign =
          payload.kind === 'campaign'
            ? payload
            : data.entries.find((e) => e.campaign?.campaignKey === payload.campaignKey)!.campaign!;
        const normalized = await this.stageReport(
          tx,
          row,
          data.run.id,
          payload.payload!,
          payload.capturedAt,
          payload.kind === 'campaign_day' ? payload.businessDate : null,
          campaign.campaignId,
        );
        if (payload.kind === 'campaign_day' && normalized.invalid) {
          return {
            ...(await this.viewIn(
              tx,
              await this.failIn(
                tx,
                row,
                'INVALID_CAMPAIGN_REPORT',
                'Campaign report cannot prove authoritative daily facts.',
                checksum,
              ),
            )),
            receipt: null,
          };
        }
        targets = normalized.targets;
      }
      if (payload.kind === 'auxiliary_keywords') {
        if (validation || !validKeywords(payload, plan.expectedAdvertiserId)) entry.warning = true;
        else {
          const campaign = data.entries.find(
            (e) => e.campaign?.campaignKey === payload.campaignKey,
          )!.campaign!;
          const map = await this.listingMap(tx, row);
          const merged = new Map<string, UpsertAdTargetDailyInput>();
          let unreadableMetric = false;
          for (const raw of payload.groupResult.rows) {
            let target: UpsertAdTargetDailyInput | null;
            try {
              target = normalizeAdKeywordTarget(raw, {
                organizationId: org,
                map,
                businessDate: new Date(plan.endDate),
                windowDays: 7,
                campaignName: data.entries
                  .flatMap((e) => e.page?.campaigns ?? [])
                  .find((c) => c.key === payload.campaignKey)!.name,
              });
            } catch (error) {
              // Optional keyword evidence with an unreadable observed cell is
              // a warning like any other invalid keyword receipt.
              if (!(error instanceof AdMetricUnparseableError)) throw error;
              unreadableMetric = true;
              break;
            }
            if (!target) continue;
            const previous = merged.get(target.targetKey);
            merged.set(target.targetKey, previous ? mergeKeywordTargets(previous, target) : target);
          }
          if (unreadableMetric) entry.warning = true;
          else {
            targets = [...merged.values()];
            entry.keywordCoverage = {
              campaignIdentity: `campaign:${campaign.campaignId}`,
              adGroupId: payload.adGroupId,
              capturedAt: payload.groupResult.capturedAt,
              businessDate: plan.endDate,
            };
          }
        }
      }
      if (targets.length)
        await tx.channelAdTargetDailySnapshot.createMany({
          data: targets.map((target) => ({
            ...target,
            sourceImportRunId: id,
            adGroupId: payload.kind === 'auxiliary_keywords' ? payload.adGroupId : null,
            spend: target.spend ?? 0,
            revenue: target.revenue ?? 0,
            impressions: target.impressions ?? 0,
            clicks: target.clicks ?? 0,
            conversions: target.conversions ?? 0,
            orders: target.orders ?? 0,
            adSpend: target.adSpend ?? 0,
            adRevenue: target.adRevenue ?? 0,
            metaJson: json(target.metaJson),
            firstObservedAt: new Date(payload.capturedAt),
            lastObservedAt: new Date(payload.capturedAt),
          })),
        });
      await tx.channelScrapeChunk.create({
        data: {
          organizationId: org,
          scrapeRunId: data.run.id,
          kind: 'receipt',
          sequence,
          checksum,
          itemCount: payload.kind === 'manual_report' ? payload.payload.data.length : targets.length,
          payload: json(payload),
          publicationJson: json(entry),
        },
      });
      const updated = await tx.sourceImportRun.update({
        where: { id, organizationId: org },
        data: {
          rowCount: {
            increment: payload.kind === 'manual_report' ? payload.payload.data.length : targets.length,
          },
        },
      });
      return { ...attemptView(updated, [...data.entries, entry]), receipt };
    });
  }

  private async listingMap(tx: Tx, row: Attempt): Promise<ListingMap> {
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
      externalIdMap: new Map(listings.map((l) => [l.externalId, { listingId: l.id }])),
      externalOptionIdMap: new Map(
        listings.flatMap((l) =>
          l.options
            .filter((o) => o.externalOptionId)
            .map(
              (o) =>
                [
                  o.externalOptionId!,
                  { listingId: l.id, listingOptionId: o.id, externalId: l.externalId },
                ] as const,
            ),
        ),
      ),
    };
  }

  private async stageReport(
    tx: Tx,
    row: Attempt,
    runId: string,
    payload: AdCampaignPayload,
    capturedAt: string,
    businessDate: string | null,
    campaignId: string | null,
  ) {
    const map = await this.listingMap(tx, row);
    const pairs = pairScrapeRows(payload.data, payload.normalizedRows);
    const authority = resolveCampaignReportAuthority({
      campaignReportScope: payload.campaignReportScope,
      dashboardOnOff: payload.dashboardOnOff,
      normalizedRows: payload.normalizedRows,
      hasSingleDayRange:
        !!businessDate && payload.startDate === businessDate && payload.endDate === businessDate,
    });
    const targets = new Map<string, UpsertAdTargetDailyInput>();
    let invalid = !!businessDate && authority.effectiveScope !== 'single_campaign_authoritative';
    const rawRows: Prisma.ChannelScrapeSnapshotCreateManyInput[] = [];
    for (const pair of pairs) {
      const raw = pair.normalizedRow,
        match = matchListingFromRow(raw, map),
        snapshotId = randomUUID();
      rawRows.push({
        id: snapshotId,
        organizationId: row.organizationId,
        sourceImportRunId: row.id,
        scrapeRunId: runId,
        channel: 'coupang',
        source: 'advertising',
        pageType: cleanString(raw.pageType) || 'campaign',
        businessDate: businessDate ? new Date(businessDate) : null,
        observedAt: new Date(capturedAt),
        externalId: pickStringField(raw, [
          'externalId',
          'external_id',
          'productId',
          'coupangProductId',
        ]),
        externalOptionId: pickStringField(raw, ['vendorItemId', 'vendor_item_id', 'itemId']),
        listingId: match.listingId,
        listingOptionId: match.listingOptionId,
        matchStatus: matchStatusOf(match),
        matchReason: !pair.hasNormalizedRow
          ? 'missing normalized row (snapshot only)'
          : raw._kpiOnly
            ? 'kpi-only row (snapshot only)'
            : !raw.campaignName && !raw.productName && !raw.keyword
              ? 'missing campaign/product/keyword identity (snapshot only)'
              : null,
        rawJson: json(pair.rawRow),
        normalizedJson: pair.hasNormalizedRow ? json(raw) : Prisma.DbNull,
      });
      if (!businessDate) continue;
      if (!pair.hasNormalizedRow || (!raw.campaignName && !raw.productName && !raw.keyword)) {
        invalid = true;
        continue;
      }
      if (raw._kpiOnly) continue;
      if (
        (!raw._campaignOnly && !hasCompleteObservedAdditiveMetrics(raw)) ||
        canonicalCampaignIdentity({
          campaignId: cleanString(raw.campaignId),
          campaignIdentity: cleanString(raw.campaignIdentity),
        }) !== `campaign:${campaignId}`
      ) {
        invalid = true;
        continue;
      }
      try {
        const target = normalizeAdCampaignTarget(raw, payload, {
          organizationId: row.organizationId,
          map,
          businessDate: new Date(businessDate),
          campaignName: payload.campaignName,
          campaignScopeId: campaignId,
          stableCampaignScopeIdentity: `campaign:${campaignId}`,
          snapshotId,
        });
        const previous = targets.get(target.targetKey);
        targets.set(
          target.targetKey,
          previous ? mergeAuthoritativeTargetInputs(previous, target) : target,
        );
      } catch {
        invalid = true;
      }
    }
    if (rawRows.length) await tx.channelScrapeSnapshot.createMany({ data: rawRows });
    return {
      targets: invalid ? [] : [...targets.values()],
      invalid: invalid || (!!businessDate && targets.size === 0),
    };
  }

  async complete(org: string, id: string, token: string, manifestChecksum: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const row = await this.find(tx, org, id);
      if (row.attemptToken !== token) throw new ConflictException('ATTEMPT_FENCE_LOST');
      if (row.status !== 'running') {
        if (row.contentChecksum === manifestChecksum) return this.viewIn(tx, row);
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row))
        return this.viewIn(
          tx,
          await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Ad campaign collection expired.'),
        );
      const { entries } = await this.receiptsIn(tx, row);
      const view = attemptView(row, entries);
      if (view.manifestChecksum !== manifestChecksum)
        throw new ConflictException('SOURCE_MANIFEST_MISMATCH');
      if (!(await this.accountMatches(tx, row)))
        return this.viewIn(
          tx,
          await this.failIn(
            tx,
            row,
            'ADVERTISER_IDENTITY_MISMATCH',
            'Ad campaign account changed.',
            manifestChecksum,
          ),
        );
      if (!completeCoverage(view.plan, entries))
        throw new ConflictException('INCOMPLETE_CAMPAIGN_COVERAGE');
      const confirmedEnd = await this.confirmedEndIn(tx, row, view.plan, entries);
      const completedAt = new Date();
      const completed = await tx.sourceImportRun.update({
        where: { id, organizationId: org },
        data: {
          status: 'completed',
          contentChecksum: manifestChecksum,
          importedAt: completedAt,
          lastVerifiedAt: completedAt,
          verificationCount: 1,
          coverageStartDate: new Date(view.plan.startDate),
          coverageEndDate: new Date(confirmedEnd),
          providerBackedEmptyProof: view.campaignCount === 0,
          qualityReport: {
            rawOnlyCampaignCount: view.rawOnlyCampaignCount,
            warningCount: view.warningCount,
            campaignDescriptors: json(
              entries
                .flatMap((e) => e.page?.campaigns ?? [])
                .map((descriptor) => {
                  const campaign = entries.find(
                    (e) => e.campaign?.campaignKey === descriptor.key,
                  )!.campaign!;
                  return {
                    campaignId: campaign.campaignId,
                    campaignIdentity: campaign.campaignId
                      ? `campaign:${campaign.campaignId}`
                      : null,
                    campaignName: descriptor.name,
                    onOff: descriptor.onOff,
                    status: descriptor.status,
                    mode: campaign.mode,
                  };
                }),
            ),
            keywordCoverage: json(
              entries.flatMap((e) => (e.keywordCoverage ? [e.keywordCoverage] : [])),
            ),
          },
        },
      });
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: org,
        dedupeKey: `source:${SOURCE}:${row.channelAccountId}`,
        attemptId: id,
      });
      return attemptView(completed, entries);
    });
  }

  /**
   * The end a completed collection confirms: its requested end, unless Coupang
   * had not reported the closed day yet. A sweep observed every requested date
   * through its staged target rows; a one-day manual report observed only its
   * day, and a seven-day report only its range total.
   */
  private async confirmedEndIn(
    tx: Tx,
    row: Attempt,
    plan: AdCampaignSourceAttempt['plan'],
    entries: ReceiptEntry[],
  ): Promise<string> {
    if (plan.captureMode === 'manual_report') {
      const report = entries.find((entry) => entry.report)?.report;
      return confirmedAdReportEnd({
        requestedEnd: plan.endDate,
        closedDay: businessDateKey(evidenceCutoffDate(row.createdAt)),
        daySpend: plan.period === '1d'
          ? (date) => (date === plan.endDate && report ? manualReportSpend(report) : undefined)
          : null,
      });
    }
    const totals = await tx.channelAdTargetDailySnapshot.groupBy({
      by: ['businessDate'],
      where: {
        organizationId: row.organizationId,
        sourceImportRunId: row.id,
        targetType: { not: 'keyword' },
        businessDate: {
          in: [plan.endDate, shiftBusinessDateKey(plan.endDate, -1)].map((date) => new Date(date)),
        },
      },
      _sum: { spend: true },
    });
    const spend = new Map(totals.map((total) => [
      businessDateKey(total.businessDate),
      total._sum.spend ?? 0,
    ]));
    const requested = new Set<string>(plan.businessDates);
    return confirmedAdReportEnd({
      requestedEnd: plan.endDate,
      closedDay: plan.endDate,
      daySpend: (date) => (requested.has(date) ? spend.get(date) ?? 0 : undefined),
    });
  }

  private async receiptsIn(tx: Tx, row: Attempt) {
    const run = await tx.channelScrapeRun.findFirst({
      where: { organizationId: row.organizationId, sourceImportRunId: row.id, source: SOURCE },
      select: { id: true },
    });
    if (!run) throw new NotFoundException('CAMPAIGN_STAGING_NOT_FOUND');
    const chunks = await tx.channelScrapeChunk.findMany({
      where: { organizationId: row.organizationId, scrapeRunId: run.id },
      orderBy: { sequence: 'asc' },
      select: { publicationJson: true },
    });
    return {
      run,
      entries: chunks.map((chunk) => chunk.publicationJson as unknown as ReceiptEntry),
    };
  }
  private async viewIn(tx: Tx, row: Attempt, control = false) {
    const { entries } = await this.receiptsIn(tx, row);
    const view = attemptView(row, entries);
    return control
      ? ({
          ...view,
          attemptToken: row.attemptToken,
          receipts: entries.map((e) => e.receipt),
          pages: entries.flatMap((e) => (e.page ? [e.page] : [])),
          campaigns: entries.flatMap((e) => (e.campaign ? [e.campaign] : [])),
        } satisfies AdCampaignSourceControl)
      : view;
  }

  private async accountMatches(tx: Tx, row: Attempt) {
    const account = await tx.channelAccount.findFirst({
      where: {
        id: row.channelAccountId!,
        organizationId: row.organizationId,
        channel: 'coupang',
        status: 'active',
      },
    });
    return (
      !!account &&
      resolveCoupangVendorId(account) ===
        AdCampaignSourcePlanSchema.parse(row.plan).expectedAdvertiserId
    );
  }

  private async failIn(tx: Tx, row: Attempt, code: string, message: string, checksum?: string) {
    const result = await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: {
        status: 'failed',
        errorCode: code,
        errorMessage: message,
        ...(checksum ? { contentChecksum: checksum } : {}),
      },
    });
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: row.organizationId,
      sourceType: SOURCE,
      attemptId: row.id,
      dedupeKey: `source:${SOURCE}:${row.channelAccountId}`,
      title: '쿠팡 광고 캠페인 수집 실패',
      message: message,
      href: '/ad-ops',
    });
    return result;
  }
  private async find(tx: Tx, org: string, id: string) {
    const row = await tx.sourceImportRun.findFirst({
      where: { ...scope(org), id },
    });
    if (!row) throw new NotFoundException('AD_CAMPAIGN_ATTEMPT_NOT_FOUND');
    return row;
  }
  private async lock(tx: Tx, org: string) {
    // ponytail: short source-wide write lock; split by account only if contention is measured.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${org}:${SOURCE}`}, 0))::text AS lock
      FROM (SELECT ${org}::uuid AS organization_id) AS tenant WHERE organization_id = ${org}::uuid`;
  }
}
function expired(row: Attempt) {
  return row.status === 'running' && (!row.expiresAt || row.expiresAt.getTime() <= Date.now());
}

function isCampaignSweepRow(row: Attempt): boolean {
  const parsed = AdCampaignSourcePlanSchema.safeParse(row.plan);
  return parsed.success && parsed.data.captureMode === 'campaign_sweep';
}

function dateAtUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

type ReceiptEntry = {
  receipt: AdCampaignSourceReceipt;
  page?: Extract<AdCampaignSourceReceiptInput, { kind: 'dashboard_page' }>;
  campaign?: Omit<Extract<AdCampaignSourceReceiptInput, { kind: 'campaign' }>, 'payload'>;
  report?: Extract<AdCampaignSourceReceiptInput, { kind: 'manual_report' }>['payload'];
  warning?: boolean;
  keywordCoverage?: {
    campaignIdentity: string;
    adGroupId: string;
    capturedAt: string;
    businessDate: string;
  };
};
function attemptView(row: Attempt, entries: ReceiptEntry[]): AdCampaignSourceAttempt {
  const plan = AdCampaignSourcePlanSchema.parse(row.plan),
    isExpired = expired(row);
  const rawOnlyCampaignCount = entries.filter((e) => e.campaign?.mode === 'raw_only').length;
  return {
    attemptId: row.id,
    channelAccountId: row.channelAccountId!,
    state:
      row.status === 'completed'
        ? 'COMPLETE'
        : row.status === 'running' && !isExpired
          ? 'RUNNING'
          : 'FAILED',
    plan,
    expiresAt: row.expiresAt!.toISOString(),
    actualCutoffAt: row.status === 'completed' ? row.importedAt!.toISOString() : null,
    manifestChecksum: hash({ plan, receipts: entries.map((e) => e.receipt) }),
    rowCount: row.rowCount,
    campaignCount: entries.flatMap((e) => e.page?.campaigns ?? []).length,
    rawOnlyCampaignCount,
    warningCount: rawOnlyCampaignCount + entries.filter((e) => e.warning).length,
    errorCode: isExpired ? 'ATTEMPT_EXPIRED' : row.errorCode,
    errorMessage: isExpired ? 'Ad campaign collection expired.' : row.errorMessage,
  };
}
function validateReceipt(
  plan: AdCampaignSourceAttempt['plan'],
  p: AdCampaignSourceReceiptInput,
  entries: ReceiptEntry[],
): string | null {
  if (p.kind === 'manual_report') {
    if (plan.captureMode !== 'manual_report') return 'MANUAL_REPORT_NOT_ALLOWED';
    if (
      entries.some((entry) => entry.receipt.kind === 'manual_report') ||
      p.period !== plan.period ||
      p.startDate !== plan.startDate ||
      p.endDate !== plan.endDate ||
      p.payload.startDate !== plan.startDate ||
      p.payload.endDate !== plan.endDate ||
      p.payload.url !== plan.targetUrl
    )
      return 'MANUAL_REPORT_SCOPE_MISMATCH';
    return null;
  }
  if (plan.captureMode === 'manual_report') return 'MANUAL_REPORT_REQUIRED';
  if (p.kind === 'dashboard_page') {
    const pages = entries.flatMap((e) => (e.page ? [e.page] : []));
    if (
      p.explicitEmpty &&
      p.campaigns.length === 0 &&
      p.pageIndex === 1 &&
      pages.length === 0 &&
      p.totalPages <= 1
    )
      return null;
    if (
      !p.verified ||
      p.pageIndex !== pages.length + 1 ||
      p.totalPages < 1 ||
      p.pageIndex > p.totalPages ||
      p.pageIndex > 100 ||
      (pages.length && p.totalPages !== pages[0].totalPages) ||
      (p.campaigns.length === 0 && !(p.explicitEmpty && p.pageIndex === 1 && p.totalPages === 1)) ||
      (p.explicitEmpty && p.campaigns.length > 0)
    )
      return 'INCOMPLETE_CAMPAIGN_ROSTER';
    const keys = [
      ...pages.flatMap((page) => page.campaigns.map((c) => c.key)),
      ...p.campaigns.map((c) => c.key),
    ];
    return new Set(keys).size === keys.length ? null : 'DUPLICATE_CAMPAIGN_ROSTER';
  }
  const descriptor = entries
    .flatMap((e) => e.page?.campaigns ?? [])
    .find((c) => c.key === p.campaignKey);
  if (!descriptor) return 'CAMPAIGN_NOT_FROZEN';
  const campaign = entries.find((e) => e.campaign?.campaignKey === p.campaignKey)?.campaign;
  if (p.kind === 'campaign') {
    if (campaign) return 'CAMPAIGN_ALREADY_FROZEN';
    if (p.mode === 'daily' && !p.campaignId) return 'CAMPAIGN_IDENTITY_MISSING';
    if (
      p.mode === 'metadata' &&
      descriptor.hasDetailHref !== false &&
      !/AI\s*스마트\s*광고|\(\s*HUB\s*\)/i.test(descriptor.name)
    )
      return 'CAMPAIGN_DETAIL_COVERAGE_REQUIRED';
    if (p.mode === 'raw_only' && p.campaignId) return 'CAMPAIGN_RAW_IDENTITY_CONFLICT';
    if (descriptor.campaignId && descriptor.campaignId !== p.campaignId)
      return 'CAMPAIGN_IDENTITY_MISMATCH';
    if (p.mode !== 'daily' && !p.payload) return 'CAMPAIGN_RAW_EVIDENCE_MISSING';
    return null;
  }
  if (!campaign || campaign.mode !== 'daily') return 'CAMPAIGN_NOT_FROZEN';
  if (p.kind === 'campaign_day') {
    const proof = p.proof;
    if ('kind' in proof && proof.kind === 'product_sales_api') {
      const apiValidation = validateProductSalesApiDayReceipt(plan, p, campaign);
      if (apiValidation) return apiValidation;
    } else {
      const domProof = proof as {
        dateApplied: boolean;
        complete: boolean;
        explicitEmpty: boolean;
        expectedPages: number;
        visitedPages: number[];
      };
      if (
        !plan.businessDates.includes(p.businessDate) ||
        p.payload.startDate !== p.businessDate ||
        p.payload.endDate !== p.businessDate ||
        !domProof.dateApplied ||
        !domProof.complete ||
        domProof.expectedPages < 1 ||
        domProof.expectedPages > 8 ||
        domProof.visitedPages.length !== domProof.expectedPages ||
        domProof.visitedPages.some((page, index) => page !== index + 1) ||
        (domProof.explicitEmpty && domProof.expectedPages !== 1)
      )
        return 'INCOMPLETE_CAMPAIGN_DAY';
    }
    if (
      entries.some(
        (e) =>
          e.receipt.kind === 'campaign_day' &&
          e.receipt.campaignKey === p.campaignKey &&
          e.receipt.businessDate === p.businessDate,
      )
    )
      return 'CAMPAIGN_DAY_ALREADY_FROZEN';
  } else {
    if (
      entries.some(
        (e) =>
          e.keywordCoverage?.campaignIdentity === `campaign:${campaign.campaignId}` &&
          e.keywordCoverage.adGroupId === p.adGroupId,
      )
    )
      return 'KEYWORD_GROUP_ALREADY_FROZEN';
    if (
      p.groupResult.rows.some(
        (raw) =>
          canonicalCampaignIdentity({
            campaignId: cleanString(raw.campaignId),
            campaignIdentity: cleanString(raw.campaignIdentity),
          }) !== `campaign:${campaign.campaignId}`,
      )
    )
      return 'KEYWORD_CAMPAIGN_MISMATCH';
  }
  return null;
}

/**
 * Validate the provider-owned exact-day product_sales receipt without a
 * database.  Keeping this pure makes the frozen campaign/group/ad contract
 * testable at the owner boundary and prevents a truthful API proof from being
 * weakened into a generic positive-number check.
 */
export function validateProductSalesApiDayReceipt(
  plan: AdCampaignSourceAttempt['plan'],
  payload: Extract<AdCampaignSourceReceiptInput, { kind: 'campaign_day' }>,
  campaign: Omit<Extract<AdCampaignSourceReceiptInput, { kind: 'campaign' }>, 'payload'>,
): string | null {
  const proof = payload.proof;
  if (!('kind' in proof) || proof.kind !== 'product_sales_api') return null;
  if (plan.captureMode !== 'campaign_sweep') return 'MANUAL_REPORT_REQUIRED';
  if (!plan.businessDates.includes(payload.businessDate)) return 'INCOMPLETE_CAMPAIGN_DAY';
  if (
    payload.payload.startDate !== payload.businessDate ||
    payload.payload.endDate !== payload.businessDate ||
    payload.payload.campaignReportScope !== 'single_campaign_authoritative' ||
    !payload.payload.kpis ||
    typeof payload.payload.kpis !== 'object' ||
    Array.isArray(payload.payload.kpis) ||
    Object.keys(payload.payload.kpis).length !== 0
  )
    return 'INCOMPLETE_CAMPAIGN_DAY';
  const campaignId = providerIdValue(campaign.campaignId);
  const proofCampaignId = providerIdValue(proof.campaignId);
  const proofAdGroupId = providerIdValue(proof.adGroupId);
  if (
    !campaignId ||
    !proofCampaignId ||
    !proofAdGroupId ||
    proof.businessDate !== payload.businessDate ||
    proof.start !== kstMidnightEpoch(proof.businessDate) ||
    proof.end !== kstMidnightEpoch(proof.businessDate) ||
    proof.tableType !== 'product_sales' ||
    proof.creativeId !== null ||
    proof.isMatchTypeEnabled !== false ||
    proof.expectedGroupIds.length !== 1 ||
    providerIdValue(proof.expectedGroupIds[0]) !== proofAdGroupId ||
    !Number.isSafeInteger(proof.totalAdCount) ||
    proof.totalAdCount <= 0 ||
    proof.totalAdCount !== proof.expectedAds.length ||
    proof.complete !== true ||
    proof.explicitEmpty !== false ||
    proofCampaignId !== campaignId
  )
    return 'INCOMPLETE_CAMPAIGN_DAY';

  const route = parseCoupangCampaignAdGroupRoute(payload.payload.url);
  if (!route || route.campaignId !== proofCampaignId || route.adGroupId !== proofAdGroupId)
    return 'CAMPAIGN_IDENTITY_MISMATCH';

  const expected = proof.expectedAds;
  const expectedByAdId = new Map<string, string>();
  const expectedVendorIds = new Set<string>();
  const expectedAdIds: string[] = [];
  for (const entry of expected) {
    const adId = providerIdValue(entry.adId);
    const vendorItemId = providerIdValue(entry.vendorItemId);
    if (
      !adId ||
      !vendorItemId ||
      expectedByAdId.has(adId) ||
      expectedVendorIds.has(vendorItemId)
    )
      return 'INCOMPLETE_CAMPAIGN_DAY';
    expectedAdIds.push(adId);
    expectedByAdId.set(adId, vendorItemId);
    expectedVendorIds.add(vendorItemId);
  }
  const observed = proof.observedAdIds.map(providerIdValue);
  if (
    observed.some((adId): adId is null => adId === null) ||
    expected.length === 0 ||
    proof.totalAdCount !== expected.length ||
    observed.length !== expected.length ||
    new Set(observed).size !== observed.length ||
    observed.some((adId, index) => adId !== expectedAdIds[index] || !expectedByAdId.has(adId)) ||
    new Set(observed).size !== expectedByAdId.size
  )
    return 'INCOMPLETE_CAMPAIGN_DAY';

  const rows = payload.payload.normalizedRows;
  if (rows.length !== expected.length) return 'INCOMPLETE_CAMPAIGN_DAY';
  const rowAdIds = new Set<string>();
  const normalizedByAdId = new Map<string, Record<string, unknown>>();
  for (const [index, row] of rows.entries()) {
    const adId = idField(row, ['adId']);
    const vendorItemId = idField(row, ['vendorItemId', 'itemId']);
    if (
      !adId ||
      !vendorItemId ||
      rowAdIds.has(adId) ||
      adId !== expectedAdIds[index] ||
      expectedByAdId.get(adId) !== vendorItemId
    )
      return 'INCOMPLETE_CAMPAIGN_DAY';
    rowAdIds.add(adId);
    normalizedByAdId.set(adId, row);
    if (
      idField(row, ['campaignId']) !== proofCampaignId ||
      stringField(row, ['campaignIdentity']) !== `campaign:${proofCampaignId}`
    )
      return 'CAMPAIGN_IDENTITY_MISMATCH';
    if (idField(row, ['adGroupId']) !== proofAdGroupId) return 'INCOMPLETE_CAMPAIGN_DAY';
    if (row.adSelectionType !== 'MANUAL_SELECTION') return 'INVALID_CAMPAIGN_REPORT';
    const observedMetrics = row._observedMetrics;
    if (!observedMetrics || typeof observedMetrics !== 'object' || Array.isArray(observedMetrics))
      return 'INVALID_CAMPAIGN_REPORT';
    if (!['adSpend', 'adRevenue', 'impressions', 'clicks', 'conversions', 'orders'].every((key) => (observedMetrics as Record<string, unknown>)[key] === true))
      return 'INVALID_CAMPAIGN_REPORT';
  }
  if (rowAdIds.size !== expected.length) return 'INCOMPLETE_CAMPAIGN_DAY';

  if (!Array.isArray(payload.payload.data) || payload.payload.data.length !== expected.length)
    return 'INCOMPLETE_CAMPAIGN_DAY';
  const rawAdIds = new Set<string>();
  for (const [index, raw] of payload.payload.data.entries()) {
    const adId = idField(raw, ['adId']);
    const vendorItemId = idField(raw, ['vendorItemId']);
    if (
      !adId ||
      !vendorItemId ||
      rawAdIds.has(adId) ||
      adId !== expectedAdIds[index] ||
      expectedByAdId.get(adId) !== vendorItemId ||
      idField(raw, ['campaignId']) !== proofCampaignId ||
      idField(raw, ['adGroupId']) !== proofAdGroupId ||
      stringField(raw, ['tableType']) !== 'product_sales' ||
      stringField(raw, ['sourceApi']) !== '/marketing/cmg-api/tableMetric' ||
      idField(raw, ['responseKey']) !== adId ||
      raw.source !== 'coupang' ||
      raw.creativeId !== null
    )
      return 'INCOMPLETE_CAMPAIGN_DAY';
    rawAdIds.add(adId);
    const request = raw.request;
    if (!request || typeof request !== 'object' || Array.isArray(request)) return 'INCOMPLETE_CAMPAIGN_DAY';
    const requestRecord = request as Record<string, unknown>;
    const requestCampaignIds = requestRecord.campaignIds;
    const requestTargetList = requestRecord.targetList;
    const requestAdGroupId = providerIdValue(requestRecord.adGroupId);
    const requestTargetIds = Array.isArray(requestTargetList)
      ? requestTargetList.map(providerIdValue)
      : [];
    if (
      !Array.isArray(requestCampaignIds) ||
      requestCampaignIds.length !== 1 ||
      providerIdValue(requestCampaignIds[0]) !== proofCampaignId ||
      requestAdGroupId !== proofAdGroupId ||
      requestRecord.creativeId !== null ||
      requestRecord.start !== proof.start ||
      requestRecord.end !== proof.end ||
      requestRecord.tableType !== 'product_sales' ||
      requestRecord.isMatchTypeEnabled !== false ||
      !Array.isArray(requestTargetList) ||
      requestTargetList.length !== expected.length ||
      requestTargetIds.some((value): value is null => value === null) ||
      new Set(requestTargetIds).size !== expected.length ||
      requestTargetIds.some((value, targetIndex) =>
        value !== expectedAdIds[targetIndex] || !expectedByAdId.has(value),
      )
    )
      return 'INCOMPLETE_CAMPAIGN_DAY';

    const metrics = raw.metrics;
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics))
      return 'INVALID_CAMPAIGN_REPORT';
    const metricRecord = metrics as Record<string, unknown>;
    const rawMetricValues = {
      deliveredAdCost: metricValue(metricRecord.deliveredAdCost),
      adAttributedSales: metricValue(metricRecord.adAttributedSales),
      impressions: metricValue(metricRecord.impressions),
      clicks: metricValue(metricRecord.clicks),
      adAttributedUnits: metricValue(metricRecord.adAttributedUnits),
      adAttributedOrders: metricValue(metricRecord.adAttributedOrders),
    };
    if (Object.values(rawMetricValues).some((value) => value === null))
      return 'INVALID_CAMPAIGN_REPORT';
    const row = normalizedByAdId.get(adId);
    if (!row) return 'INCOMPLETE_CAMPAIGN_DAY';
    const expectedMetrics = {
      adSpend: Math.round(rawMetricValues.deliveredAdCost!),
      adRevenue: Math.round(rawMetricValues.adAttributedSales!),
      impressions: Math.round(rawMetricValues.impressions!),
      clicks: Math.round(rawMetricValues.clicks!),
      conversions: Math.round(rawMetricValues.adAttributedUnits!),
      orders: Math.round(rawMetricValues.adAttributedOrders!),
    };
    const aliases: Record<keyof typeof expectedMetrics, string[]> = {
      adSpend: ['runningAdSpend', 'spend', 'adSpend'],
      adRevenue: ['revenue', 'adRevenue'],
      impressions: ['impressions'],
      clicks: ['clicks'],
      conversions: ['conversions'],
      orders: ['orders'],
    };
    for (const [metric, fields] of Object.entries(aliases) as [keyof typeof expectedMetrics, string[]][]) {
      for (const field of fields) {
        const value = metricValue(row[field]);
        if (value === null || value !== expectedMetrics[metric]) return 'INVALID_CAMPAIGN_REPORT';
      }
    }
  }
  return null;
}

function stringField(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function idField(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    return providerIdValue(value[key]);
  }
  return null;
}

function providerIdValue(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && String(parsed) === value ? value : null;
}

function metricValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseCoupangCampaignAdGroupRoute(value: string | undefined): { campaignId: string; adGroupId: string } | null {
  if (!value || typeof value !== 'string') return null;
  try {
    const authority = value.match(/^https:\/\/([^/?#]+)/i)?.[1] || '';
    if (authority.includes('@') || authority.toLowerCase() !== 'advertising.coupang.com') return null;
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'advertising.coupang.com' ||
      url.username ||
      url.password ||
      url.port
    ) return null;
    const match = url.pathname.match(
      /^\/marketing\/dashboard\/sales\/campaign\/([1-9]\d*)\/group\/([1-9]\d*)\/product\/?$/,
    );
    if (!match) return null;
    const campaignId = providerIdValue(match[1]);
    const adGroupId = providerIdValue(match[2]);
    return campaignId && adGroupId ? { campaignId, adGroupId } : null;
  } catch {
    return null;
  }
}

function kstMidnightEpoch(value: string): number | null {
  const parsed = parseBusinessDate(value);
  return parsed ? kstDayStart(parsed).getTime() : null;
}
function validKeywords(
  p: Extract<AdCampaignSourceReceiptInput, { kind: 'auxiliary_keywords' }>,
  advertiserId: string,
) {
  const plan = p.groupPlan,
    result = p.groupResult;
  if (
    p.advertiserId !== advertiserId ||
    plan.advertiserId !== advertiserId ||
    result.advertiserId !== advertiserId ||
    !plan.adsArrayObserved ||
    plan.enumeratedAdCount !== plan.ads.length ||
    new Set(plan.ads.map((a) => a.adId)).size !== plan.ads.length ||
    result.ads.length !== plan.ads.length ||
    new Set(result.ads.map((a) => a.adId)).size !== result.ads.length
  )
    return false;
  const ads = new Map(plan.ads.map((a) => [a.adId, a]));
  return (
    result.ads.every((a) => ads.has(a.adId) && a.metricsOk && a.registeredOk) &&
    result.rows.every((raw) => {
      const ad = ads.get(String(raw.adId));
      return (
        ad &&
        String(raw.externalOptionId) === ad.vendorItemId &&
        (raw.adGroup ?? null) === plan.adGroupName
      );
    })
  );
}
function completeCoverage(plan: AdCampaignSourceAttempt['plan'], entries: ReceiptEntry[]) {
  if (plan.captureMode === 'manual_report') {
    return entries.length === 1 && entries[0]?.receipt.kind === 'manual_report';
  }
  const pages = entries.flatMap((e) => (e.page ? [e.page] : []));
  if (!pages.length || pages.length !== Math.max(1, pages[0].totalPages)) return false;
  return pages
    .flatMap((p) => p.campaigns)
    .every((d) => {
      const campaign = entries.find((e) => e.campaign?.campaignKey === d.key)?.campaign;
      return (
        campaign &&
        (campaign.mode !== 'daily' ||
          plan.businessDates.every((date) =>
            entries.some(
              (e) =>
                e.receipt.kind === 'campaign_day' &&
                e.receipt.campaignKey === d.key &&
                e.receipt.businessDate === date,
            ),
          ))
      );
    });
}

/** A displayed manual report's spend: the sum of its rows' positive spend cells. */
function manualReportSpend(report: NonNullable<ReceiptEntry['report']>): number {
  return report.normalizedRows.reduce<number>((total, row) => {
    const spend = parseProviderNumber(row.runningAdSpend ?? row.spend);
    return total + (spend !== null && spend > 0 ? spend : 0);
  }, 0);
}

function manualPlan(
  input: Extract<AdCampaignSourceBegin, { captureMode: 'manual_report' }>,
  channelAccountId: string,
  expectedAdvertiserId: string,
) {
  const start = dateAtUtc(input.startDate);
  const end = dateAtUtc(input.endDate);
  const spanDays = inclusiveDayCount(start, end);
  const expectedSpan = input.period === '1d' ? 1 : 7;
  if (
    !isAdvertisingDashboardUrl(input.targetUrl) ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    spanDays !== expectedSpan ||
    end.getTime() > evidenceCutoffDate().getTime()
  ) {
    throw new BadRequestException('INVALID_MANUAL_REPORT_SCOPE');
  }
  if (input.period === '1d') {
    const targetDate = input.targetUrl.match(/(?:^|[#&])targetDate=(\d{4}-\d{2}-\d{2})(?:&|$)/i)?.[1];
    if (targetDate !== input.startDate || targetDate !== input.endDate) {
      throw new BadRequestException('MANUAL_REPORT_TARGET_DATE_MISMATCH');
    }
  } else if (/[#&]targetDate=\d{4}-\d{2}-\d{2}/i.test(input.targetUrl)) {
    throw new BadRequestException('MANUAL_REPORT_TARGET_DATE_MISMATCH');
  }
  return AdCampaignSourcePlanSchema.parse({
    sourceType: SOURCE,
    parserVersion: PARSER,
    captureMode: 'manual_report',
    period: input.period,
    channelAccountId,
    expectedAdvertiserId,
    startDate: input.startDate,
    endDate: input.endDate,
    targetUrl: input.targetUrl,
    // A displayed-range report is one atomic receipt. It is deliberately not
    // expanded into per-day coverage; the account/day source owns that grain.
    businessDates: [input.endDate],
  });
}

function isAdvertisingDashboardUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.toLowerCase() === 'advertising.coupang.com' &&
      /\/marketing\/dashboard\/sales/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
