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
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { businessDateKey, evidenceCutoffDate, parseBusinessDate } from '../../../../common/kst';
import { canonicalOwnerInputHash as hash } from '../../../../common/owner-idempotency-key';
import { OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE } from '../../../../common/operator-cancel';
import { resolveCoupangVendorId } from '../../../../channels/domain/coupang-account-identity';
import { currentBusinessDate, toBusinessDate } from '../../../domain/business-date';
import {
  matchListingFromRow,
  pickStringField,
  type ListingMap,
} from '../../../domain/listing-match';
import {
  normalizeWingListingState,
  normalizeWingOptionState,
} from '../../../domain/scrape-row-normalizers';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  WING_ITEMWINNER_PARSER,
  WING_ITEMWINNER_SOURCE,
  WING_ITEMWINNER_TARGET_URL,
} from '../../../application/port/in/wing-itemwinner-kpi-source.port';
import type {
  WingItemwinnerAttempt,
  WingItemwinnerCapture,
  WingItemwinnerKpiReadPort,
  WingItemwinnerKpiSourcePort,
  WingItemwinnerListingObservation,
  WingItemwinnerPublished,
  WingItemwinnerSourceControl,
  WingItemwinnerSourcePlan,
  WingItemwinnerSourceStatus,
} from '../../../application/port/in/wing-itemwinner-kpi-source.port';

const SNAPSHOT_SOURCE = 'wing';
const PAGE_TYPE = 'itemwinner';
const EXPIRES_IN_MS = 30 * 60_000;
// One failure Alert per account, as Wing traffic, campaigns and keywords keep:
// an account's completion resolves only its own failure.
function sourceAlertDedupeKey(channelAccountId: string | null): string {
  return `source:${WING_ITEMWINNER_SOURCE}:${channelAccountId}`;
}
const SOURCE_ALERT_TITLE = '쿠팡 Wing 아이템위너 수집 실패';

type Tx = Prisma.TransactionClient;
type SourceRun = Prisma.SourceImportRunGetPayload<{}>;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function dateAtUtc(value: string): Date {
  const parsed = parseBusinessDate(value);
  if (!parsed) throw new Error(`Invalid business date: ${value}`);
  return parsed;
}

function expired(row: SourceRun): boolean {
  return row.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && (!row.expiresAt || row.expiresAt.getTime() <= Date.now());
}

function isExplicitWingItemWinnerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== 'wing.coupang.com') return false;
    return /item[-_]?winner|price/i.test(`${url.pathname}${url.hash}`);
  } catch {
    return false;
  }
}

function objectJson(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function listingObservationsFromJson(
  value: unknown,
): WingItemwinnerListingObservation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = objectJson(entry as Prisma.JsonValue);
    if (!record || typeof record.listingId !== 'string') return [];
    if (
      typeof record.lastObservedAt !== 'string' ||
      !Number.isFinite(Date.parse(record.lastObservedAt))
    ) {
      return [];
    }
    const isOfferWinner =
      record.isOfferWinner === true
        ? true
        : record.isOfferWinner === false
          ? false
          : null;
    return [
      {
        listingId: record.listingId,
        isOfferWinner,
        lastObservedAt: record.lastObservedAt,
      },
    ];
  });
}

@Injectable()
export class WingItemwinnerKpiSourceRepository
  implements WingItemwinnerKpiSourcePort, WingItemwinnerKpiReadPort
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async begin(input: {
    organizationId: string;
    idempotencyKey: string;
    channelAccountId?: string;
  }): Promise<WingItemwinnerSourceControl> {
    return this.prisma.$transaction(async (tx) => {
      // One organization-wide admission lock, as Wing traffic and campaigns
      // take: the idempotency key is unique per organization and source, so a
      // per-account lock would let two accounts race on one key.
      await this.lock(tx, input.organizationId);
      const requestFingerprint = hash({ channelAccountId: input.channelAccountId ?? null });
      const replay = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: WING_ITEMWINNER_SOURCE,
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
              'Wing itemwinner collection expired.',
            )
          : replay;
        return this.controlView(tx, row);
      }

      const account = await this.account(tx, input.organizationId, input.channelAccountId);
      if (!account) throw new NotFoundException('COUPANG_ACCOUNT_NOT_FOUND');
      const expectedVendorId = resolveCoupangVendorId(account);
      if (!expectedVendorId) {
        throw new BadRequestException('VENDOR_IDENTITY_MISSING');
      }

      const running = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: WING_ITEMWINNER_SOURCE,
          channelAccountId: account.id,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        },
      });
      if (running) {
        if (!expired(running)) {
          throw new ConflictException({
            code: 'ATTEMPT_IN_PROGRESS',
            attemptId: running.id,
          });
        }
        await this.failIn(
          tx,
          running,
          'ATTEMPT_EXPIRED',
          'Wing itemwinner collection expired.',
        );
      }

      const businessDate = currentBusinessDate();
      const plan: WingItemwinnerSourcePlan = {
        sourceType: WING_ITEMWINNER_SOURCE,
        parserVersion: WING_ITEMWINNER_PARSER,
        channelAccountId: account.id,
        expectedVendorId,
        businessDate: businessDateKey(businessDate),
        pageType: PAGE_TYPE,
        targetUrl: WING_ITEMWINNER_TARGET_URL,
      };
      const previous = await tx.sourceImportRun.aggregate({
        where: {
          organizationId: input.organizationId,
          sourceType: WING_ITEMWINNER_SOURCE,
          channelAccountId: account.id,
        },
        _max: { freshnessGeneration: true },
      });
      const row = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: WING_ITEMWINNER_SOURCE,
          channelAccountId: account.id,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          attemptToken: randomUUID(),
          freshnessGeneration: (previous._max.freshnessGeneration ?? 0n) + 1n,
          plan: json(plan),
          parserVersion: WING_ITEMWINNER_PARSER,
          expiresAt: new Date(Date.now() + EXPIRES_IN_MS),
        },
      });
      await tx.channelScrapeRun.create({
        data: {
          organizationId: input.organizationId,
          channelAccountId: account.id,
          sourceImportRunId: row.id,
          channel: 'coupang',
          source: SNAPSHOT_SOURCE,
          pageType: PAGE_TYPE,
          parserVersion: WING_ITEMWINNER_PARSER,
          businessDate,
        },
      });
      return this.controlView(tx, row);
    });
  }

  async read(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<WingItemwinnerSourceControl | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.sourceImportRun.findFirst({
          where: {
            id: input.attemptId,
            organizationId: input.organizationId,
            sourceType: WING_ITEMWINNER_SOURCE,
          },
        });
        return row ? this.controlView(tx, row) : null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async complete(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    capture: WingItemwinnerCapture;
  }): Promise<WingItemwinnerSourceControl> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, input.organizationId);
        const row = await this.find(tx, input.organizationId, input.attemptId);
        this.fence(row, input.attemptToken);
        const checksum = hash(input.capture);
        if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
          if (row.contentChecksum === checksum) return { row };
          throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
        }
        if (expired(row)) {
          const failed = await this.failIn(
            tx,
            row,
            'ATTEMPT_EXPIRED',
            'Wing itemwinner collection expired.',
            checksum,
          );
          return { failure: 'ATTEMPT_EXPIRED' as const, row: failed };
        }

        const plan = this.planOf(row);
        const observedBusinessDate = toBusinessDate(input.capture.observedAt);
        if (!observedBusinessDate || businessDateKey(observedBusinessDate) !== plan.businessDate) {
          const failed = await this.failIn(
            tx,
            row,
            'BUSINESS_DATE_CHANGED',
            'Wing itemwinner evidence crossed the frozen KST business date.',
            checksum,
          );
          return { failure: 'BUSINESS_DATE_CHANGED' as const, row: failed };
        }
        if (!input.capture.providerVendorId) {
          const failed = await this.failIn(
            tx,
            row,
            'VENDOR_IDENTITY_MISSING',
            'Wing itemwinner capture is missing the observed vendor identity.',
            checksum,
          );
          return { failure: 'VENDOR_IDENTITY_MISSING' as const, row: failed };
        }
        if (input.capture.providerVendorId !== plan.expectedVendorId) {
          const failed = await this.failIn(
            tx,
            row,
            'VENDOR_IDENTITY_MISMATCH',
            'Wing itemwinner vendor identity does not match the frozen account.',
            checksum,
          );
          return { failure: 'VENDOR_IDENTITY_MISMATCH' as const, row: failed };
        }
        if (!isExplicitWingItemWinnerUrl(input.capture.url)) {
          const failed = await this.failIn(
            tx,
            row,
            'INVALID_PAGE_TARGET',
            'Wing itemwinner capture URL is not an explicit item-winner page.',
            checksum,
          );
          return { failure: 'INVALID_PAGE_TARGET' as const, row: failed };
        }
        if (input.capture.url !== plan.targetUrl) {
          const failed = await this.failIn(
            tx,
            row,
            'PAGE_TARGET_CHANGED',
            'Wing itemwinner capture URL differs from the frozen collection page.',
            checksum,
          );
          return { failure: 'PAGE_TARGET_CHANGED' as const, row: failed };
        }
        if (input.capture.data.length === 0 && Object.keys(input.capture.kpis).length === 0) {
          const failed = await this.failIn(
            tx,
            row,
            'EMPTY_CAPTURE_EVIDENCE',
            'Wing itemwinner capture has no rows or provider cards proving a page result.',
            checksum,
          );
          return { failure: 'EMPTY_CAPTURE_EVIDENCE' as const, row: failed };
        }
        if (!(await this.accountMatches(tx, row, plan))) {
          const failed = await this.failIn(
            tx,
            row,
            'ACCOUNT_CHANGED',
            'The frozen Coupang account changed during collection.',
            checksum,
          );
          return { failure: 'ACCOUNT_CHANGED' as const, row: failed };
        }

        const map = await this.listingMap(tx, input.organizationId, plan.channelAccountId);
        const observedAt = new Date(input.capture.observedAt);
        const listingObservationsById = new Map<
          string,
          WingItemwinnerListingObservation
        >();
        for (const rawRow of input.capture.data) {
          const match = matchListingFromRow(rawRow, map);
          if (!match.listingId) continue;
          const listingState = normalizeWingListingState(rawRow);
          if (!listingState) continue;
          listingObservationsById.set(match.listingId, {
            listingId: match.listingId,
            isOfferWinner: listingState.isOfferWinner ?? null,
            lastObservedAt: observedAt.toISOString(),
          });
        }
        const normalizedJson = {
          kpis: input.capture.kpis,
          rowCount: input.capture.data.length,
          timestamp: input.capture.timestamp ?? null,
          listingObservations: [...listingObservationsById.values()],
        };
        const snapshot = await tx.channelScrapeSnapshot.create({
          data: {
            organizationId: input.organizationId,
            scrapeRunId: await this.scrapeRunId(tx, row),
            sourceImportRunId: row.id,
            channel: 'coupang',
            source: SNAPSHOT_SOURCE,
            pageType: PAGE_TYPE,
            businessDate: dateAtUtc(plan.businessDate),
            observedAt,
            matchStatus: 'unmatched',
            matchReason: 'current-page capture; row evidence is preserved in rawJson.data',
            rowHash: checksum,
            rawJson: json(input.capture),
            normalizedJson: json(normalizedJson),
          },
          select: { id: true },
        });

        let matchedCount = 0;
        for (const rawRow of input.capture.data) {
          const match = matchListingFromRow(rawRow, map);
          if (!match.listingId) continue;
          matchedCount += 1;
          const listingState = normalizeWingListingState(rawRow);
          if (listingState) {
            await this.upsertListingDaily(tx, {
              organizationId: input.organizationId,
              listingId: match.listingId,
              externalId: match.externalId ?? pickStringField(rawRow, ['externalId']) ?? '',
              businessDate: dateAtUtc(plan.businessDate),
              observedAt,
              rawSnapshotId: snapshot.id,
              state: listingState,
            });
          }
          if (!match.listingOptionId) continue;
          const optionState = normalizeWingOptionState(rawRow);
          if (optionState) {
            await this.upsertOptionDaily(tx, {
              organizationId: input.organizationId,
              listingId: match.listingId,
              listingOptionId: match.listingOptionId,
              externalId: match.externalId ?? pickStringField(rawRow, ['externalId']) ?? '',
              externalOptionId:
                match.externalOptionId ?? pickStringField(rawRow, ['vendorItemId']) ?? '',
              businessDate: dateAtUtc(plan.businessDate),
              observedAt,
              rawSnapshotId: snapshot.id,
              state: optionState,
            });
          }
        }

        const scrapeRunId = await this.scrapeRunId(tx, row);
        await tx.channelScrapeRun.update({
          where: { id: scrapeRunId, organizationId: input.organizationId },
          data: {
            status: 'complete',
            targetUrl: input.capture.url,
            finishedAt: new Date(),
            metaJson: json({
              kpis: input.capture.kpis,
              rowCount: input.capture.data.length,
              scope: 'current-page',
            }),
          },
        });
        const completed = await tx.sourceImportRun.update({
          where: { id: row.id, organizationId: input.organizationId },
          data: {
            status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
            importedAt: new Date(),
            lastVerifiedAt: observedAt,
            verificationCount: { increment: 1 },
            contentChecksum: checksum,
            contentByteCount: Buffer.byteLength(JSON.stringify(input.capture)),
            rowCount: input.capture.data.length,
            qualityReport: json({
              scope: 'current-page',
              pageType: PAGE_TYPE,
              rowCount: input.capture.data.length,
              matchedCount,
              unmatchedCount: input.capture.data.length - matchedCount,
            }),
          },
        });
        await this.alerts.resolveSourceFailure(tx, {
          organizationId: input.organizationId,
          dedupeKey: sourceAlertDedupeKey(row.channelAccountId),
          attemptId: row.id,
        });
        return { row: completed };
      },
      { timeout: 30_000 },
    );
    if ('failure' in result) throw new ConflictException(result.failure);
    return this.controlView(this.prisma, result.row);
  }

  async fail(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<WingItemwinnerSourceControl> {
    const message = input.message
      .replace(/(api[_-]?key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
      .slice(0, 300);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.find(tx, input.organizationId, input.attemptId);
      this.fence(row, input.attemptToken);
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        if (row.status === SOURCE_IMPORT_RUN_FAILED_STATUS && row.errorCode === input.code && row.errorMessage === message) {
          return this.controlView(tx, row);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      const failed = await this.failIn(
        tx,
        row,
        expired(row) ? 'ATTEMPT_EXPIRED' : input.code,
        expired(row) ? 'Wing itemwinner collection expired.' : message,
        hash({ code: input.code, message }),
      );
      return this.controlView(tx, failed);
    });
  }

  async cancel(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<WingItemwinnerAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.find(tx, input.organizationId, input.attemptId);
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) return this.attemptView(tx, row);
      const failed = expired(row)
        ? await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Wing itemwinner collection expired.')
        : await this.failIn(
            tx,
            row,
            OPERATOR_CANCEL_CODE,
            OPERATOR_CANCEL_MESSAGE,
            hash({ code: OPERATOR_CANCEL_CODE, message: OPERATOR_CANCEL_MESSAGE }),
          );
      return this.attemptView(tx, failed);
    });
  }

  async readSourceStatus(input: {
    organizationId: string;
    channelAccountId?: string;
  }): Promise<WingItemwinnerSourceStatus> {
    return this.prisma.$transaction(
      (tx) => this.sourceStatusIn(tx, input.organizationId, input.channelAccountId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readPublished(input: {
    organizationId: string;
  }): Promise<WingItemwinnerPublished | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const account = await this.account(tx, input.organizationId);
        if (!account) return null;
        const row = await tx.sourceImportRun.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceType: WING_ITEMWINNER_SOURCE,
            channelAccountId: account.id,
            status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          },
          orderBy: [{ freshnessGeneration: 'desc' }, { importedAt: 'desc' }, { id: 'desc' }],
        });
        if (!row) return null;
        const snapshot = await tx.channelScrapeSnapshot.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceImportRunId: row.id,
            source: SNAPSHOT_SOURCE,
            pageType: PAGE_TYPE,
            sourceImportRun: { status: SOURCE_IMPORT_RUN_COMPLETED_STATUS, sourceType: WING_ITEMWINNER_SOURCE },
          },
          orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
          select: { id: true, businessDate: true, observedAt: true, normalizedJson: true },
        });
        if (!snapshot?.businessDate || !snapshot.normalizedJson) return null;
        const normalizedJson = objectJson(snapshot.normalizedJson);
        if (!normalizedJson) return null;
        return {
          channelAccountId: account.id,
          attemptId: row.id,
          generation: String(row.freshnessGeneration ?? 0n),
          businessDate: businessDateKey(snapshot.businessDate),
          observedAt: snapshot.observedAt.toISOString(),
          normalizedJson,
          listingObservations: listingObservationsFromJson(
            normalizedJson.listingObservations,
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async sourceStatusIn(
    tx: Tx,
    organizationId: string,
    channelAccountId?: string,
  ): Promise<WingItemwinnerSourceStatus> {
    const account = await this.account(tx, organizationId, channelAccountId);
    if (!account && channelAccountId) throw new NotFoundException('COUPANG_ACCOUNT_NOT_FOUND');
    if (!account) {
      return {
        channelAccountId: null,
        ready: false,
        latestAttempt: null,
        latestComplete: null,
        actualCutoffAt: null,
      };
    }
    const where = {
      organizationId,
      sourceType: WING_ITEMWINNER_SOURCE,
      channelAccountId: account.id,
    };
    const [latest, complete] = await Promise.all([
      tx.sourceImportRun.findFirst({
        where,
        orderBy: [{ freshnessGeneration: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      }),
      tx.sourceImportRun.findFirst({
        where: { ...where, status: SOURCE_IMPORT_RUN_COMPLETED_STATUS },
        orderBy: [{ freshnessGeneration: 'desc' }, { importedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const latestAttempt = latest ? await this.attemptView(tx, latest) : null;
    const latestComplete = complete ? await this.attemptView(tx, complete) : null;
    if (!latestComplete) {
      return {
        channelAccountId: account.id,
        ready: false,
        latestAttempt,
        latestComplete: null,
        actualCutoffAt: null,
      };
    }
    const actualCutoffDate = toBusinessDate(latestComplete.actualCutoffAt);
    return {
      channelAccountId: account.id,
      ready: deriveSourceReadiness({
        latestAttempt,
        latestComplete: {
          actualCutoff: actualCutoffDate ? businessDateKey(actualCutoffDate) : null,
        },
        requiredCutoff: businessDateKey(evidenceCutoffDate()),
      }).ready,
      latestAttempt,
      latestComplete,
      actualCutoffAt: latestComplete.actualCutoffAt,
    };
  }

  private async controlView(tx: Tx | PrismaService, row: SourceRun): Promise<WingItemwinnerSourceControl> {
    const attempt = await this.attemptView(tx, row);
    return { ...attempt, attemptToken: row.attemptToken };
  }

  private async attemptView(tx: Tx | PrismaService, row: SourceRun): Promise<WingItemwinnerAttempt> {
    const snapshot = row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
      ? await tx.channelScrapeSnapshot.findFirst({
          where: {
            organizationId: row.organizationId,
            sourceImportRunId: row.id,
            source: SNAPSHOT_SOURCE,
            pageType: PAGE_TYPE,
          },
          orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
          select: { observedAt: true },
        })
      : null;
    const isExpired = expired(row);
    const plan = this.planOf(row);
    return {
      attemptId: row.id,
      channelAccountId: row.channelAccountId!,
      generation: String(row.freshnessGeneration ?? 0n),
      state:
        row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
          ? 'COMPLETE'
          : row.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && !isExpired
            ? 'RUNNING'
            : 'FAILED',
      plan,
      expiresAt: row.expiresAt?.toISOString() ?? new Date(0).toISOString(),
      actualCutoffAt: snapshot?.observedAt.toISOString() ?? null,
      observedAt: snapshot?.observedAt.toISOString() ?? null,
      contentChecksum: row.contentChecksum ?? null,
      itemCount: row.rowCount,
      errorCode: isExpired ? 'ATTEMPT_EXPIRED' : row.errorCode,
      errorMessage: isExpired ? 'Wing itemwinner collection expired.' : row.errorMessage,
    };
  }

  private planOf(row: SourceRun): WingItemwinnerSourcePlan {
    const plan = row.plan;
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      throw new ConflictException('SOURCE_PLAN_INVALID');
    }
    return plan as unknown as WingItemwinnerSourcePlan;
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
        status: SOURCE_IMPORT_RUN_FAILED_STATUS,
        errorCode: code,
        errorMessage: message,
        ...(checksum ? { contentChecksum: checksum } : {}),
      },
    });
    await tx.channelScrapeRun.updateMany({
      where: {
        organizationId: row.organizationId,
        sourceImportRunId: row.id,
        source: SNAPSHOT_SOURCE,
        pageType: PAGE_TYPE,
      },
      data: {
        status: 'error',
        finishedAt: new Date(),
        errorJson: json({ code, message }),
      },
    });
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: row.organizationId,
      sourceType: WING_ITEMWINNER_SOURCE,
      attemptId: row.id,
      dedupeKey: sourceAlertDedupeKey(row.channelAccountId),
      title: SOURCE_ALERT_TITLE,
      message: message,
      href: '/ad-ops',
    });
    return failed;
  }

  private async find(tx: Tx, organizationId: string, attemptId: string): Promise<SourceRun> {
    const row = await tx.sourceImportRun.findFirst({
      where: { id: attemptId, organizationId, sourceType: WING_ITEMWINNER_SOURCE },
    });
    if (!row) throw new NotFoundException('WING_ITEMWINNER_ATTEMPT_NOT_FOUND');
    return row;
  }

  private fence(row: SourceRun, token: string): void {
    if (row.attemptToken !== token) throw new ConflictException('ATTEMPT_FENCE_LOST');
  }

  /** The named active Coupang account, or the primary one when none is named. */
  private async account(tx: Tx, organizationId: string, channelAccountId?: string) {
    return tx.channelAccount.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        status: 'active',
        ...(channelAccountId ? { id: channelAccountId } : {}),
      },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  /** The frozen account is still active with the vendor identity it was admitted with. */
  private async accountMatches(
    tx: Tx,
    row: SourceRun,
    plan: WingItemwinnerSourcePlan,
  ): Promise<boolean> {
    const current = await this.account(tx, row.organizationId, plan.channelAccountId);
    return !!current && resolveCoupangVendorId(current) === plan.expectedVendorId;
  }

  private async listingMap(tx: Tx, organizationId: string, channelAccountId: string): Promise<ListingMap> {
    const [options, listings] = await Promise.all([
      tx.channelListingOption.findMany({
        where: {
          organizationId,
          isActive: true,
          listing: { organizationId, channelAccountId, isActive: true },
        },
        select: { id: true, externalOptionId: true, listingId: true },
      }),
      tx.channelListing.findMany({
        where: { organizationId, channelAccountId, isActive: true },
        select: { id: true, externalId: true },
      }),
    ]);
    const listingById = new Map(listings.map((listing) => [listing.id, listing]));
    const externalOptionIdMap = new Map<string, { listingId: string; listingOptionId: string; externalId: string }>();
    for (const option of options) {
      const listing = listingById.get(option.listingId);
      if (listing) {
        externalOptionIdMap.set(option.externalOptionId, {
          listingId: option.listingId,
          listingOptionId: option.id,
          externalId: listing.externalId,
        });
      }
    }
    return {
      channelAccountId,
      externalOptionIdMap,
      externalIdMap: new Map(listings.map((listing) => [listing.externalId, { listingId: listing.id }])),
    };
  }

  private async scrapeRunId(tx: Tx, row: SourceRun): Promise<string> {
    const scrapeRun = await tx.channelScrapeRun.findFirst({
      where: {
        organizationId: row.organizationId,
        sourceImportRunId: row.id,
        source: SNAPSHOT_SOURCE,
        pageType: PAGE_TYPE,
      },
      select: { id: true },
    });
    if (!scrapeRun) throw new NotFoundException('WING_ITEMWINNER_SCRAPE_RUN_NOT_FOUND');
    return scrapeRun.id;
  }

  private async upsertListingDaily(
    tx: Tx,
    input: {
      organizationId: string;
      listingId: string;
      externalId: string;
      businessDate: Date;
      observedAt: Date;
      rawSnapshotId: string;
      state: ReturnType<typeof normalizeWingListingState>;
    },
  ): Promise<void> {
    if (!input.state) return;
    const observedState = Object.fromEntries(
      Object.entries(input.state).filter(([, value]) => value !== null && value !== undefined),
    );
    await tx.channelListingDailySnapshot.upsert({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: input.organizationId,
          listingId: input.listingId,
          businessDate: input.businessDate,
        },
      },
      create: {
        organizationId: input.organizationId,
        listingId: input.listingId,
        channel: 'coupang',
        externalId: input.externalId,
        businessDate: input.businessDate,
        ...input.state,
        sampleCount: 1,
        firstObservedAt: input.observedAt,
        lastObservedAt: input.observedAt,
        rawSnapshotId: input.rawSnapshotId,
      },
      update: {
        ...observedState,
        sampleCount: { increment: 1 },
        lastObservedAt: input.observedAt,
        rawSnapshotId: input.rawSnapshotId,
      },
      select: { id: true },
    });
  }

  private async upsertOptionDaily(
    tx: Tx,
    input: {
      organizationId: string;
      listingId: string;
      listingOptionId: string;
      externalId: string;
      externalOptionId: string;
      businessDate: Date;
      observedAt: Date;
      rawSnapshotId: string;
      state: ReturnType<typeof normalizeWingOptionState>;
    },
  ): Promise<void> {
    if (!input.state) return;
    const observedState = Object.fromEntries(
      Object.entries(input.state).filter(([, value]) => value !== null && value !== undefined),
    );
    await tx.channelListingOptionDailySnapshot.upsert({
      where: {
        organizationId_listingOptionId_businessDate: {
          organizationId: input.organizationId,
          listingOptionId: input.listingOptionId,
          businessDate: input.businessDate,
        },
      },
      create: {
        organizationId: input.organizationId,
        listingId: input.listingId,
        listingOptionId: input.listingOptionId,
        channel: 'coupang',
        externalId: input.externalId,
        externalOptionId: input.externalOptionId,
        businessDate: input.businessDate,
        ...input.state,
        sampleCount: 1,
        firstObservedAt: input.observedAt,
        lastObservedAt: input.observedAt,
        rawSnapshotId: input.rawSnapshotId,
      },
      update: {
        ...observedState,
        sampleCount: { increment: 1 },
        lastObservedAt: input.observedAt,
        rawSnapshotId: input.rawSnapshotId,
      },
      select: { id: true },
    });
  }

  private async lock(tx: Tx, organizationId: string): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${WING_ITEMWINNER_SOURCE}`}, 0))::text AS lock
      FROM (SELECT ${organizationId}::uuid AS organization_id) AS tenant WHERE organization_id = ${organizationId}::uuid`;
  }
}
