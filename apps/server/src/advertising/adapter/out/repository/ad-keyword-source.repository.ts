import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { randomUUID } from 'node:crypto';
import { Inject,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { deriveSourceReadiness } from '@kiditem/shared/source-readiness';
import {
  AdKeywordSourcePlanSchema,
  AdKeywordRosterSchema,
  AdKeywordReceiptSchema,
  AdKeywordGroupPlanSchema,
  AdKeywordGroupResultSchema,
  type AdKeywordSourceStatus,
  type AdKeywordGroupPlan,
  type AdKeywordGroupResult,
  type AdKeywordRoster,
  type AdKeywordQueueUnit,
  type AdKeywordSourceBegin,
  type AdKeywordSourceControl,
  type AdKeywordSourceAttempt,
} from '@kiditem/shared/advertising';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { canonicalOwnerInputHash as hash } from '../../../../common/owner-idempotency-key';
import { OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE } from '../../../../common/operator-cancel';
import { resolveCoupangVendorId } from '../../../../channels/domain/account/coupang-account-identity';
import { addDays, businessDateKey, evidenceCutoffDate } from '../../../../common/kst';
import { normalizeAdKeywordTarget } from '../../../application/service/ad-keyword-normalizer';
import { mergeKeywordTargets } from '../../../domain/ad-keyword-target-merge';
import { readCompleteAdKeywordFacts } from '../persistence/read/ad-target-facts';
import type { UpsertAdTargetDailyInput } from '../../../application/port/out/repository/channel-target-daily.repository.port';
import type { ListingMap } from '../../../domain/listing-match';
import { AdMetricUnparseableError } from '../../../domain/scrape-row-normalizers';

const SOURCE = 'coupang_ad_keyword';
const PARSER = 'ad-keyword-v1';
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
export class AdKeywordSourceRepository {
  constructor(
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async begin(org: string, key: string, input: AdKeywordSourceBegin) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const replay = await tx.sourceImportRun.findFirst({
        where: { ...scope(org), idempotencyKey: key },
      });
      if (replay) {
        if (replay.requestFingerprint !== hash(input))
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        const row = expired(replay)
          ? await this.failIn(tx, replay, 'ATTEMPT_EXPIRED', 'Ad keyword collection expired.')
          : replay;
        return this.controlIn(tx, row);
      }
      const account = await this.channelAccounts.resolveActiveProvider(ownerTransaction(tx), { organizationId: org, accountId: input.channelAccountId, channel: 'coupang' });
      if (!account) throw new NotFoundException('COUPANG_ACCOUNT_NOT_FOUND');
      const running = await tx.sourceImportRun.findFirst({
        where: {
          ...scope(org),
          channelAccountId: account.id,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        },
      });
      if (running) {
        if (!expired(running))
          throw new ConflictException({
            code: 'ATTEMPT_IN_PROGRESS',
            attemptId: running.id,
          });
        await this.failIn(tx, running, 'ATTEMPT_EXPIRED', 'Ad keyword collection expired.');
      }
      const advertiserId = resolveCoupangVendorId(account);
      if (!advertiserId) throw new BadRequestException('ADVERTISER_IDENTITY_MISSING');
      const end = evidenceCutoffDate();
      const start = addDays(end, -6);
      const plan = AdKeywordSourcePlanSchema.parse({
        sourceType: SOURCE,
        parserVersion: PARSER,
        channelAccountId: account.id,
        expectedAdvertiserId: advertiserId,
        startDate: businessDateKey(start),
        endDate: businessDateKey(end),
        windowDays: 7,
      });
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
          pageType: 'keyword',
          parserVersion: PARSER,
          businessDate: end,
          periodStart: start,
          periodEnd: end,
          period: '7d',
        },
      });
      return this.controlIn(tx, row);
    });
  }

  async read(org: string, id: string, control = false) {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await this.find(tx, org, id);
        return control ? this.controlIn(tx, row) : this.attemptIn(tx, row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async source(org: string, accountId?: string): Promise<AdKeywordSourceStatus> {
    return this.prisma.$transaction(
      async (tx) => {
        const account = await this.channelAccounts.resolveActiveProvider(ownerTransaction(tx), { organizationId: org, accountId, channel: 'coupang' });
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
        const [latest, complete] = await Promise.all([
          tx.sourceImportRun.findFirst({
            where,
            orderBy: { freshnessGeneration: 'desc' },
          }),
          tx.sourceImportRun.findFirst({
            where: { ...where, status: SOURCE_IMPORT_RUN_COMPLETED_STATUS },
            orderBy: { freshnessGeneration: 'desc' },
          }),
        ]);
        const latestAttempt = latest ? await this.attemptIn(tx, latest) : null;
        const latestComplete = complete
          ? complete.id === latest?.id
            ? latestAttempt
            : await this.attemptIn(tx, complete)
          : null;
        const expectedEnd = businessDateKey(evidenceCutoffDate());
        const eligibleComplete = latestComplete !== null
          && latestComplete.plan.expectedAdvertiserId === resolveCoupangVendorId(account)
          ? { actualCutoff: latestComplete.plan.endDate }
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
        } satisfies AdKeywordSourceStatus;
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
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        if (row.status === SOURCE_IMPORT_RUN_FAILED_STATUS && row.contentChecksum === checksum)
          return await this.attemptIn(tx, row);
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      const failed = expired(row)
        ? await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Ad keyword collection expired.')
        : await this.failIn(tx, row, code, clean, checksum);
      return await this.attemptIn(tx, failed);
    });
  }

  /** Operator stop without the attempt token; a terminal attempt is returned as it is. */
  async cancel(org: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const row = await this.find(tx, org, id);
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) return await this.attemptIn(tx, row);
      const failed = expired(row)
        ? await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Ad keyword collection expired.')
        : await this.failIn(
            tx,
            row,
            OPERATOR_CANCEL_CODE,
            OPERATOR_CANCEL_MESSAGE,
            hash({ code: OPERATOR_CANCEL_CODE, message: OPERATOR_CANCEL_MESSAGE }),
          );
      return await this.attemptIn(tx, failed);
    });
  }

  async captureRoster(org: string, id: string, token: string, payload: AdKeywordRoster) {
    return this.capture(org, id, token, 'roster', 0, payload);
  }

  async captureGroupPlan(
    org: string,
    id: string,
    token: string,
    sequence: number,
    payload: AdKeywordGroupPlan,
  ) {
    return this.capture(org, id, token, 'group_plan', sequence, payload);
  }
  async captureGroupResult(
    org: string,
    id: string,
    token: string,
    sequence: number,
    payload: AdKeywordGroupResult,
  ) {
    return this.capture(org, id, token, 'group_result', sequence, payload);
  }
  private async capture(
    org: string,
    id: string,
    token: string,
    kind: 'roster' | 'group_plan' | 'group_result',
    sequence: number,
    payload: AdKeywordRoster | AdKeywordGroupPlan | AdKeywordGroupResult,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const row = await this.find(tx, org, id);
      if (row.attemptToken !== token) throw new ConflictException('ATTEMPT_FENCE_LOST');
      const checksum = hash(payload);
      const terminalChecksum = hash({ kind, sequence, checksum });
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        if (row.status === SOURCE_IMPORT_RUN_FAILED_STATUS && row.contentChecksum === terminalChecksum)
          return await this.attemptIn(tx, row);
        throw new ConflictException('SOURCE_ATTEMPT_TERMINAL');
      }
      if (expired(row))
        return await this.attemptIn(
          tx,
          await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Ad keyword collection expired.'),
        );
      const run = await this.staging(tx, row);
      const previous = await tx.channelScrapeChunk.findUnique({
        where: {
          scrapeRunId_kind_sequence: { scrapeRunId: run.id, kind, sequence },
          organizationId: org,
        },
        select: { checksum: true },
      });
      if (previous) {
        if (previous.checksum !== checksum) throw new ConflictException('SOURCE_RECEIPT_CONFLICT');
        return await this.attemptIn(tx, row);
      }
      const plan = AdKeywordSourcePlanSchema.parse(row.plan);
      if (
        payload.advertiserId !== plan.expectedAdvertiserId ||
        !(await this.accountMatches(tx, row))
      )
        return await this.attemptIn(
          tx,
          await this.failIn(
            tx,
            row,
            'ADVERTISER_IDENTITY_MISMATCH',
            'Ad keyword advertiser identity is not the frozen account.',
            terminalChecksum,
          ),
        );
      let itemCount = 0;
      if (kind === 'roster') {
        const roster = AdKeywordRosterSchema.parse(payload);
        if (!validRoster(roster))
          return await this.attemptIn(
            tx,
            await this.failIn(
              tx,
              row,
              'INCOMPLETE_KEYWORD_ROSTER',
              'Campaign roster did not reach a proven terminal page.',
              terminalChecksum,
            ),
          );
        itemCount = roster.campaigns.length;
      } else {
        const roster = await this.rosterIn(tx, row, run.id);
        const unit = roster ? buildQueue(roster)[sequence] : undefined;
        if (!unit) throw new ConflictException('KEYWORD_GROUP_NOT_FROZEN');
        if (kind === 'group_plan') {
          const group = AdKeywordGroupPlanSchema.parse(payload);
          if (
            !group.adsArrayObserved ||
            group.enumeratedAdCount !== group.ads.length ||
            new Set(group.ads.map((ad) => ad.adId)).size !== group.ads.length
          )
            return await this.attemptIn(
              tx,
              await this.failIn(
                tx,
                row,
                'INCOMPLETE_KEYWORD_GROUP',
                'Ad group enumeration is missing, invalid or truncated.',
                terminalChecksum,
              ),
            );
          itemCount = group.ads.length;
        } else {
          const result = AdKeywordGroupResultSchema.parse(payload);
          const storedPlan = await tx.channelScrapeChunk.findFirst({
            where: {
              organizationId: org,
              scrapeRunId: run.id,
              kind: 'group_plan',
              sequence,
            },
            select: { payload: true },
          });
          if (!storedPlan) throw new ConflictException('KEYWORD_AD_PLAN_NOT_FROZEN');
          if (!validGroupResult(unit, AdKeywordGroupPlanSchema.parse(storedPlan.payload), result))
            return await this.attemptIn(
              tx,
              await this.failIn(
                tx,
                row,
                'INCOMPLETE_KEYWORD_RESULT',
                'Every frozen ad requires both successful keyword responses.',
                terminalChecksum,
              ),
            );
          try {
            await this.stageTargets(tx, row, unit, result);
          } catch (error) {
            // Normalization throws before any staging write, so the attempt
            // can still be failed in this transaction.
            if (!(error instanceof AdMetricUnparseableError)) throw error;
            return await this.attemptIn(
              tx,
              await this.failIn(
                tx,
                row,
                error.code,
                `Ad keyword result has an unreadable ${error.field} cell.`,
                terminalChecksum,
              ),
            );
          }
          itemCount = result.rows.length;
        }
      }
      await tx.channelScrapeChunk.create({
        data: {
          organizationId: org,
          scrapeRunId: run.id,
          kind,
          sequence,
          checksum,
          itemCount,
          payload: json(payload),
        },
      });
      return await this.attemptIn(tx, await this.find(tx, org, id));
    });
  }

  private async stageTargets(
    tx: Tx,
    row: Attempt,
    unit: AdKeywordQueueUnit,
    result: AdKeywordGroupResult,
  ) {
    const plan = AdKeywordSourcePlanSchema.parse(row.plan);
    const options = await this.channelListings.readExternalIdentities(ownerTransaction(tx), { organizationId: row.organizationId, accountId: row.channelAccountId!, optionExternalIds: result.rows.map(item => String(item.externalOptionId)), activeOnly: true }).then(rows => rows.flatMap(row => row.optionId && row.externalOptionId ? [{ id: row.optionId, externalOptionId: row.externalOptionId, listingId: row.listingId, listing: { externalId: row.externalId } }] : []));
    const map: ListingMap = {
      channelAccountId: row.channelAccountId!,
      externalIdMap: new Map(),
      externalOptionIdMap: new Map(
        options.map((option) => [
          option.externalOptionId!,
          {
            listingId: option.listingId,
            listingOptionId: option.id,
            externalId: option.listing.externalId,
          },
        ]),
      ),
    };
    const targets = new Map<string, UpsertAdTargetDailyInput>();
    for (const raw of result.rows) {
      const target = normalizeAdKeywordTarget(raw, {
        organizationId: row.organizationId,
        map,
        businessDate: new Date(plan.endDate),
        windowDays: 7,
        campaignName: unit.campaignName,
      });
      if (!target) continue;
      const previous = targets.get(target.targetKey);
      targets.set(target.targetKey, previous ? mergeKeywordTargets(previous, target) : target);
    }
    await tx.channelAdTargetDailySnapshot.createMany({
      data: [...targets.values()].map((target) => ({
        ...target,
        spend: target.spend ?? 0,
        revenue: target.revenue ?? 0,
        impressions: target.impressions ?? 0,
        clicks: target.clicks ?? 0,
        conversions: target.conversions ?? 0,
        orders: target.orders ?? 0,
        adSpend: target.adSpend ?? 0,
        adRevenue: target.adRevenue ?? 0,
        sourceImportRunId: row.id,
        adGroupId: unit.adGroupId,
        metaJson: json(target.metaJson),
        firstObservedAt: new Date(result.capturedAt),
        lastObservedAt: new Date(result.capturedAt),
      })),
    });
    const rowCount = await tx.channelAdTargetDailySnapshot.count({
      where: { organizationId: row.organizationId, sourceImportRunId: row.id },
    });
    await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: { rowCount },
    });
  }

  async complete(org: string, id: string, token: string, manifestChecksum: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const row = await this.find(tx, org, id);
      if (row.attemptToken !== token) throw new ConflictException('ATTEMPT_FENCE_LOST');
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        if (row.contentChecksum === manifestChecksum) return await this.attemptIn(tx, row);
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row))
        return await this.attemptIn(
          tx,
          await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Ad keyword collection expired.'),
        );
      const data = await this.receiptsIn(tx, row);
      const control = attemptView(row, data.chunks, data.roster);
      if (control.manifestChecksum !== manifestChecksum)
        throw new ConflictException('SOURCE_MANIFEST_MISMATCH');
      if (!(await this.accountMatches(tx, row)))
        return await this.attemptIn(
          tx,
          await this.failIn(
            tx,
            row,
            'ADVERTISER_IDENTITY_MISMATCH',
            'Ad keyword account changed.',
            manifestChecksum,
          ),
        );
      if (
        !data.roster ||
        buildQueue(data.roster).some((_, sequence) =>
          ['group_plan', 'group_result'].some(
            (kind) =>
              !data.chunks.some((chunk) => chunk.kind === kind && chunk.sequence === sequence),
          ),
        )
      )
        throw new ConflictException('INCOMPLETE_KEYWORD_COVERAGE');
      const observationReceipts = await tx.channelScrapeChunk.findMany({
        where: {
          organizationId: org,
          scrapeRunId: data.run.id,
          kind: { in: ['roster', 'group_result'] },
        },
        select: { kind: true, sequence: true, createdAt: true, payload: true },
      });
      const rosterCapturedAt = observationReceipts.find(
        (receipt) => receipt.kind === 'roster',
      )!.createdAt;
      const queue = buildQueue(data.roster);
      const keywordCoverage = observationReceipts
        .filter((receipt) => receipt.kind === 'group_result')
        .map((receipt) => ({
          campaignIdentity: queue[receipt.sequence].campaignIdentity,
          adGroupId: queue[receipt.sequence].adGroupId,
          capturedAt: AdKeywordGroupResultSchema.parse(receipt.payload).capturedAt,
          businessDate: control.plan.endDate,
        }));
      const completedAt = new Date();
      const complete = await tx.sourceImportRun.update({
        where: { id, organizationId: org },
        data: {
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          contentChecksum: manifestChecksum,
          importedAt: completedAt,
          lastVerifiedAt: completedAt,
          verificationCount: 1,
          coverageStartDate: new Date(control.plan.startDate),
          coverageEndDate: new Date(control.plan.endDate),
          providerBackedEmptyProof: row.rowCount === 0,
          qualityReport: {
            groupCount: control.groupCount,
            completedGroupCount: control.completedGroupCount,
            receipts: json(data.chunks),
            rosterCapturedAt: rosterCapturedAt.toISOString(),
            keywordCoverage: json(keywordCoverage),
          },
        },
      });
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: org,
        dedupeKey: `source:${SOURCE}:${row.channelAccountId}`,
        attemptId: id,
      });
      return attemptView(complete, data.chunks, data.roster);
    });
  }

  async readComplete(org: string, input: { channelAccountId: string; from?: Date; to?: Date }) {
    return this.prisma.$transaction(
      async (tx) => {
        const { attempts, rows } = await readCompleteAdKeywordFacts(tx, org, input);
        return {
          attempt: attempts[0] ? await this.attemptIn(tx, attempts[0]) : null,
          rows,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async staging(tx: Tx, row: Attempt) {
    const run = await tx.channelScrapeRun.findFirst({
      where: {
        organizationId: row.organizationId,
        sourceImportRunId: row.id,
        source: SOURCE,
      },
    });
    if (!run) throw new NotFoundException('KEYWORD_STAGING_NOT_FOUND');
    return run;
  }
  private async accountMatches(tx: Tx, row: Attempt) {
    const account = await this.channelAccounts.resolveActiveProvider(ownerTransaction(tx), { organizationId: row.organizationId, accountId: row.channelAccountId!, channel: 'coupang' });
    return (
      !!account &&
      resolveCoupangVendorId(account) ===
        AdKeywordSourcePlanSchema.parse(row.plan).expectedAdvertiserId
    );
  }

  private async rosterIn(tx: Tx, row: Attempt, scrapeRunId: string) {
    const chunk = await tx.channelScrapeChunk.findFirst({
      where: {
        organizationId: row.organizationId,
        scrapeRunId,
        kind: 'roster',
        sequence: 0,
      },
      select: { payload: true },
    });
    return chunk ? AdKeywordRosterSchema.parse(chunk.payload) : null;
  }

  private async receiptsIn(tx: Tx, row: Attempt) {
    const run = await this.staging(tx, row);
    const chunks = await tx.channelScrapeChunk.findMany({
      where: { organizationId: row.organizationId, scrapeRunId: run.id },
      orderBy: [{ kind: 'asc' }, { sequence: 'asc' }],
      select: { kind: true, sequence: true, checksum: true, itemCount: true },
    });
    return {
      run,
      chunks: chunks.map((chunk) => AdKeywordReceiptSchema.parse(chunk)),
      roster: await this.rosterIn(tx, row, run.id),
    };
  }

  private async attemptIn(tx: Tx, row: Attempt): Promise<AdKeywordSourceAttempt> {
    const { chunks, roster } = await this.receiptsIn(tx, row);
    return attemptView(row, chunks, roster);
  }

  private async controlIn(tx: Tx, row: Attempt): Promise<AdKeywordSourceControl> {
    const { run, chunks, roster } = await this.receiptsIn(tx, row);
    // Only explicit resume reads all frozen group plans; safe status never does.
    const plans = await tx.channelScrapeChunk.findMany({
      where: {
        organizationId: row.organizationId,
        scrapeRunId: run.id,
        kind: 'group_plan',
      },
      select: { sequence: true, payload: true },
    });
    return {
      ...attemptView(row, chunks, roster),
      attemptToken: row.attemptToken,
      roster,
      queue: (roster ? buildQueue(roster) : []).map((unit, sequence) => {
        const group = plans.find((chunk) => chunk.sequence === sequence);
        return {
          ...unit,
          sequence,
          plan: group ? AdKeywordGroupPlanSchema.parse(group.payload) : null,
          resultComplete: chunks.some(
            (chunk) => chunk.kind === 'group_result' && chunk.sequence === sequence,
          ),
        };
      }),
      receipts: chunks,
    };
  }

  private async failIn(tx: Tx, row: Attempt, code: string, message: string, checksum?: string) {
    const result = await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: {
        status: SOURCE_IMPORT_RUN_FAILED_STATUS,
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
      title: '쿠팡 광고 키워드 수집 실패',
      message: message,
      href: '/ad-ops',
    });
    return result;
  }
  private async find(tx: Tx, org: string, id: string) {
    const row = await tx.sourceImportRun.findFirst({
      where: { ...scope(org), id },
    });
    if (!row) throw new NotFoundException('AD_KEYWORD_ATTEMPT_NOT_FOUND');
    return row;
  }
  private async lock(tx: Tx, org: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${org}:${SOURCE}`}, 0))::text AS lock
      FROM (SELECT ${org}::uuid AS organization_id) AS tenant WHERE organization_id = ${org}::uuid`;
  }
}
function expired(row: Attempt) {
  return row.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && (!row.expiresAt || row.expiresAt.getTime() <= Date.now());
}
function attemptView(
  row: Attempt,
  chunks: Array<{
    kind: string;
    sequence: number;
    checksum: string;
    itemCount: number;
  }>,
  roster: AdKeywordRoster | null,
): AdKeywordSourceAttempt {
  const plan = AdKeywordSourcePlanSchema.parse(row.plan);
  const isExpired = expired(row);
  return {
    attemptId: row.id,
    channelAccountId: row.channelAccountId!,
    state:
      row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
        ? 'COMPLETE'
        : row.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && !isExpired
          ? 'RUNNING'
          : 'FAILED',
    plan,
    expiresAt: row.expiresAt!.toISOString(),
    actualCutoffAt: row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS ? row.importedAt!.toISOString() : null,
    manifestChecksum: hash({
      plan,
      receipts: chunks.map(({ kind, sequence, checksum }) => ({
        kind,
        sequence,
        checksum,
      })),
    }),
    rowCount: row.rowCount,
    groupCount: roster
      ? roster.campaigns.reduce((count, campaign) => count + campaign.groups.length, 0)
      : 0,
    completedGroupCount: chunks.filter((chunk) => chunk.kind === 'group_result').length,
    errorCode: isExpired ? 'ATTEMPT_EXPIRED' : row.errorCode,
    errorMessage: isExpired ? 'Ad keyword collection expired.' : row.errorMessage,
  };
}
function buildQueue(roster: AdKeywordRoster): AdKeywordQueueUnit[] {
  return roster.campaigns
    .flatMap((campaign) =>
      campaign.groups.map((group) => ({
        key: `${campaign.campaignId}:${group.adGroupId}`,
        campaignId: campaign.campaignId,
        campaignName: campaign.name,
        campaignIdentity: `campaign:${campaign.campaignId}`,
        adGroupId: group.adGroupId,
        adGroupName: group.adGroupName,
        isActive: campaign.isActive,
        totalAdCount: campaign.totalAdCount,
      })),
    )
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        a.totalAdCount - b.totalAdCount ||
        a.key.localeCompare(b.key),
    );
}
function validRoster(roster: AdKeywordRoster) {
  const queue = buildQueue(roster);
  return (
    roster.pages.every(
      (page, index) =>
        page.page === index &&
        page.campaignsArrayObserved &&
        page.hasNextPage === index < roster.pages.length - 1,
    ) &&
    roster.pages.reduce((sum, page) => sum + page.campaignCount, 0) === roster.campaigns.length &&
    roster.campaigns.every((campaign) => campaign.groupsArrayObserved) &&
    new Set(roster.campaigns.map((campaign) => campaign.campaignId)).size ===
      roster.campaigns.length &&
    new Set(queue.map((unit) => unit.key)).size === queue.length
  );
}
function validGroupResult(
  unit: AdKeywordQueueUnit,
  plan: AdKeywordGroupPlan,
  result: AdKeywordGroupResult,
) {
  const ads = new Map(plan.ads.map((ad) => [ad.adId, ad]));
  return (
    result.ads.length === plan.ads.length &&
    new Set(result.ads.map((ad) => ad.adId)).size === ads.size &&
    result.ads.every((ad) => ads.has(ad.adId) && ad.metricsOk && ad.registeredOk) &&
    result.rows.every((row) => {
      const ad = ads.get(String(row.adId));
      return (
        ad &&
        String(row.externalOptionId) === ad.vendorItemId &&
        String(row.campaignId) === unit.campaignId &&
        (row.campaignIdentity == null || row.campaignIdentity === unit.campaignIdentity) &&
        (row.adGroup ?? null) === plan.adGroupName
      );
    })
  );
}
