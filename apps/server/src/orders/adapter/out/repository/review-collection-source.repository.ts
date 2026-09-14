import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SourceImportRun } from '@prisma/client';
import {
  ReviewIngestItemSchema,
  type ReviewIngestItem,
  type ReviewIngestResponse,
} from '@kiditem/shared/reviews';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { redact } from '../../../../common/redact';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { businessDateKey, kstBusinessDate } from '../../../../common/kst';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { PrismaService } from '../../../../prisma/prisma.service';
import { allocatePublicationSequence } from '../../../../common/publication-sequence';
import { ReviewIngestService } from '../../../services/review-ingest.service';
import {
  COUPANG_REVIEW_COLLECTION_MAX_MONTHS,
  COUPANG_REVIEW_COLLECTION_MAX_PAGES,
  COUPANG_REVIEW_COLLECTION_PAGE_SIZE,
  COUPANG_REVIEW_COLLECTION_PARSER_VERSION,
  COUPANG_REVIEW_COLLECTION_SOURCE_TYPE,
  type ReviewCollectionAttempt,
  type ReviewCollectionAttemptControl,
  type ReviewCollectionPlan,
  type ReviewCollectionSourcePort,
  type ReviewCollectionWindow,
  type ReviewCollectionWindowCompletion,
  type ReviewCollectionWindowReceipt,
} from '../../../application/port/in/review-collection-source.port';

const SOURCE_ALERT_TITLE = '쿠팡 상품평 수집 실패';
const SOURCE_ALERT_HREF = '/reviews';
const ATTEMPT_EXPIRES_IN_MS = 45 * 60_000;

type Tx = Prisma.TransactionClient;
type SourceRun = Prisma.SourceImportRunGetPayload<{}>;
type Progress = {
  completedWindows: number[];
  windows: Record<
    string,
    {
      itemCount: number;
      chunkCount: number;
      pageCount: number;
      pageLimitReached: boolean;
      coverageStartDate?: string;
      coverageEndDate?: string;
      received: number;
      created: number;
      updated: number;
      linked: number;
      unlinked: number;
    }
  >;
  publication?: ReviewIngestResponse & { collected: number };
};

@Injectable()
export class ReviewCollectionSourceRepository implements ReviewCollectionSourcePort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
    private readonly reviewIngest: ReviewIngestService,
  ) {}

  async beginAttempt(input: {
    organizationId: string;
    userId?: string;
    idempotencyKey: string;
    months: number;
  }): Promise<ReviewCollectionAttemptControl> {
    const months = normalizeMonths(input.months);
    const plan = createPlan(months);
    const requestFingerprint = canonicalOwnerInputHash({ months, windows: plan.windows });

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const replay = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: COUPANG_REVIEW_COLLECTION_SOURCE_TYPE,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint) {
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        }
        if (expired(replay)) {
          const failed = await this.failIn(
            tx,
            replay,
            'ATTEMPT_EXPIRED',
            'Coupang review collection expired.',
          );
          return this.controlView(tx, failed);
        }
        return this.controlView(tx, replay);
      }

      const running = await tx.sourceImportRun.findMany({
        where: {
          organizationId: input.organizationId,
          sourceType: COUPANG_REVIEW_COLLECTION_SOURCE_TYPE,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const active = running.find((row) => !expired(row));
      if (active) {
        throw new ConflictException({
          code: 'ATTEMPT_IN_PROGRESS',
          attemptId: active.id,
        });
      }
      for (const old of running) {
        await this.failIn(tx, old, 'ATTEMPT_EXPIRED', 'Coupang review collection expired.');
      }

      const row = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: COUPANG_REVIEW_COLLECTION_SOURCE_TYPE,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          attemptToken: randomUUID(),
          plan: json(plan),
          parserVersion: COUPANG_REVIEW_COLLECTION_PARSER_VERSION,
          expiresAt: new Date(Date.now() + ATTEMPT_EXPIRES_IN_MS),
          ...(input.userId ? { createdBy: input.userId } : {}),
        },
      });
      return this.controlView(tx, row);
    });
  }

  async readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<ReviewCollectionAttempt | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await this.findRunOrNull(tx, input.organizationId, input.attemptId);
        return row ? this.attemptView(tx, row) : null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<ReviewCollectionAttemptControl | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await this.findRunOrNull(tx, input.organizationId, input.attemptId);
        return row ? this.controlView(tx, row) : null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async appendChunk(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    receipt: ReviewCollectionWindowReceipt;
  }): Promise<ReviewCollectionAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      this.assertToken(row, input.attemptToken);
      this.assertRunning(row);
      const plan = readPlan(row.plan);
      const window = windowAt(plan, input.receipt.windowIndex);
      if (!Number.isSafeInteger(input.receipt.sequence) || input.receipt.sequence < 0) {
        throw new BadRequestException('INVALID_REVIEW_COLLECTION_SEQUENCE');
      }
      const items = parseItems(input.receipt.items);
      if (items.length === 0 || items.length > 200) {
        throw new BadRequestException('INVALID_REVIEW_COLLECTION_CHUNK');
      }
      const progress = readProgress(row.qualityReport);
      if (progress.completedWindows.includes(window.index)) {
        throw new ConflictException('REVIEW_COLLECTION_WINDOW_TERMINAL');
      }
      const checksum = canonicalOwnerInputHash(items);
      const existing = await tx.reviewCollectionChunk.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          windowIndex: window.index,
          sequence: input.receipt.sequence,
        },
      });
      if (existing) {
        if (existing.checksum !== checksum || existing.itemCount !== items.length) {
          throw new ConflictException('REVIEW_COLLECTION_CHUNK_REPLAY_CONFLICT');
        }
        return this.attemptView(tx, row);
      }
      const staged = await this.reviewIngest.stageInTransaction(
        tx,
        input.organizationId,
        row.id,
        { platform: 'coupang', items },
      );
      await tx.reviewCollectionChunk.create({
        data: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          windowIndex: window.index,
          sequence: input.receipt.sequence,
          checksum,
          itemCount: items.length,
          payload: json(items),
        },
      });
      const priorWindow = progress.windows[String(window.index)];
      const nextProgress: Progress = {
        ...progress,
        windows: {
          ...progress.windows,
          [String(window.index)]: {
            itemCount: (priorWindow?.itemCount ?? 0) + items.length,
            chunkCount: (priorWindow?.chunkCount ?? 0) + 1,
            pageCount: priorWindow?.pageCount ?? 0,
            pageLimitReached: priorWindow?.pageLimitReached ?? false,
            received: (priorWindow?.received ?? 0) + staged.received,
            created: (priorWindow?.created ?? 0) + staged.created,
            updated: (priorWindow?.updated ?? 0) + staged.updated,
            linked: (priorWindow?.linked ?? 0) + staged.linked,
            unlinked: (priorWindow?.unlinked ?? 0) + staged.unlinked,
          },
        },
      };
      const updated = await tx.sourceImportRun.update({
        where: { id: row.id, organizationId: input.organizationId },
        data: { qualityReport: json(nextProgress) },
      });
      return this.attemptView(tx, updated);
    });
  }

  async completeWindow(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    completion: ReviewCollectionWindowCompletion;
  }): Promise<ReviewCollectionAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      this.assertToken(row, input.attemptToken);
      this.assertRunning(row);
      const plan = readPlan(row.plan);
      const window = windowAt(plan, input.completion.windowIndex);
      validateWindowCompletion(plan, input.completion);

      const progress = readProgress(row.qualityReport);
      const prior = progress.windows[String(window.index)];
      if (progress.completedWindows.includes(window.index)) {
        if (!prior || !sameWindowCompletion(prior, input.completion)) {
          throw new ConflictException('REVIEW_COLLECTION_WINDOW_REPLAY_CONFLICT');
        }
        return this.attemptView(tx, row);
      }

      const chunks = await tx.reviewCollectionChunk.findMany({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          windowIndex: window.index,
        },
        orderBy: { sequence: 'asc' },
        select: { sequence: true, itemCount: true },
      });
      assertContiguousChunks(chunks);
      const itemCount = chunks.reduce((sum, chunk) => sum + chunk.itemCount, 0);
      if (itemCount !== input.completion.itemCount) {
        throw new ConflictException('REVIEW_COLLECTION_WINDOW_ITEM_COUNT_MISMATCH');
      }

      const next: Progress = {
        ...progress,
        completedWindows: [...progress.completedWindows, window.index].sort((a, b) => a - b),
        windows: {
          ...progress.windows,
          [String(window.index)]: {
            itemCount,
            chunkCount: chunks.length,
            pageCount: input.completion.pageCount,
            pageLimitReached: input.completion.pageLimitReached,
            coverageStartDate: input.completion.coverageStartDate,
            coverageEndDate: input.completion.coverageEndDate,
            received: prior?.received ?? itemCount,
            created: prior?.created ?? 0,
            updated: prior?.updated ?? 0,
            linked: prior?.linked ?? 0,
            unlinked: prior?.unlinked ?? 0,
          },
        },
      };
      const updated = await tx.sourceImportRun.update({
        where: { id: row.id, organizationId: input.organizationId },
        data: { qualityReport: json(next) },
      });
      return this.attemptView(tx, updated);
    });
  }

  async completeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
  }): Promise<ReviewCollectionAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      this.assertToken(row, input.attemptToken);
      if (row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS) return this.attemptView(tx, row);
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      if (expired(row)) throw new ConflictException('ATTEMPT_EXPIRED');

      const plan = readPlan(row.plan);
      const progress = readProgress(row.qualityReport);
      if (progress.completedWindows.length !== plan.windows.length) {
        throw new ConflictException('REVIEW_COLLECTION_WINDOWS_INCOMPLETE');
      }
      for (const window of plan.windows) {
        const receipt = progress.windows[String(window.index)];
        if (
          !receipt ||
          receipt.pageLimitReached ||
          receipt.coverageStartDate !== window.start ||
          receipt.coverageEndDate !== window.end
        ) {
          throw new ConflictException('REVIEW_COLLECTION_WINDOWS_INCOMPLETE');
        }
      }

      const windowReceipts = plan.windows.map((window) => {
        const receipt = progress.windows[String(window.index)]!;
        return {
          windowIndex: window.index,
          itemCount: receipt.itemCount,
          pageCount: receipt.pageCount,
          pageLimitReached: receipt.pageLimitReached,
          coverageStartDate: receipt.coverageStartDate!,
          coverageEndDate: receipt.coverageEndDate!,
        };
      });

      const chunks = await tx.reviewCollectionChunk.findMany({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
        },
        orderBy: [{ windowIndex: 'asc' }, { sequence: 'asc' }],
        select: { windowIndex: true, sequence: true, checksum: true, itemCount: true, payload: true },
      });
      for (const chunk of chunks) {
        const items = parseItems(chunk.payload);
        if (items.length !== chunk.itemCount || canonicalOwnerInputHash(items) !== chunk.checksum) {
          throw new ConflictException('REVIEW_COLLECTION_CHUNK_CHECKSUM_MISMATCH');
        }
      }
      const collected = chunks.reduce((sum, chunk) => sum + chunk.itemCount, 0);
      const publication = progressPublication(progress, collected);
      const publicationSequence = await allocatePublicationSequence(
        tx,
        input.organizationId,
        COUPANG_REVIEW_COLLECTION_SOURCE_TYPE,
      );
      const coverageStartDate = windowReceipts.reduce(
        (earliest, receipt) => receipt.coverageStartDate < earliest ? receipt.coverageStartDate : earliest,
        windowReceipts[0]!.coverageStartDate,
      );
      const coverageEndDate = windowReceipts.reduce(
        (latest, receipt) => receipt.coverageEndDate > latest ? receipt.coverageEndDate : latest,
        windowReceipts[0]!.coverageEndDate,
      );
      const completedAt = new Date();
      const contentChecksum = canonicalOwnerInputHash({
        plan,
        windowReceipts,
        chunks: chunks.map((chunk) => ({
          windowIndex: chunk.windowIndex,
          sequence: chunk.sequence,
          checksum: chunk.checksum,
        })),
      });
      const nextProgress: Progress = {
        ...progress,
        publication: { ...publication, collected },
      };
      const updated = await tx.sourceImportRun.update({
        where: { id: row.id, organizationId: input.organizationId },
        data: {
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          rowCount: collected,
          importedAt: completedAt,
          lastVerifiedAt: completedAt,
          verificationCount: { increment: 1 },
          contentChecksum,
          publicationSequence,
          coverageStartDate: dateOnly(coverageStartDate),
          coverageEndDate: dateOnly(coverageEndDate),
          qualityReport: json(nextProgress),
          errorCode: null,
          errorMessage: null,
        },
      });
      await tx.reviewCollectionChunk.deleteMany({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
        },
      });
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: alertDedupeKey(),
        attemptId: row.id,
      });
      return this.attemptView(tx, updated);
    });
  }

  async failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<ReviewCollectionAttempt> {
    return this.finishAsFailed(input, input.errorCode, input.errorMessage);
  }

  async cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
  }): Promise<ReviewCollectionAttempt> {
    return this.finishAsFailed(input, 'USER_CANCELLED', '사용자가 쿠팡 상품평 수집을 중단했습니다.');
  }

  private async finishAsFailed(
    input: {
      organizationId: string;
      attemptId: string;
      attemptToken: string;
    },
    errorCode: string,
    errorMessage: string,
  ): Promise<ReviewCollectionAttempt> {
    const message = redact(errorMessage).slice(0, 500);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      this.assertToken(row, input.attemptToken);
      if (row.status === SOURCE_IMPORT_RUN_FAILED_STATUS) {
        if (row.errorCode === errorCode) return this.attemptView(tx, row);
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS) throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      if (expired(row)) throw new ConflictException('ATTEMPT_EXPIRED');
      const failed = await this.failIn(tx, row, errorCode, message);
      return this.attemptView(tx, failed);
    });
  }

  private async failIn(
    tx: Tx,
    row: SourceRun,
    errorCode: string,
    errorMessage: string,
  ): Promise<SourceRun> {
    const failed = await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: { status: SOURCE_IMPORT_RUN_FAILED_STATUS, errorCode, errorMessage },
    });
    await this.alerts.recordTerminalOutcome(tx, {
      code: errorCode,
      organizationId: row.organizationId,
      sourceType: COUPANG_REVIEW_COLLECTION_SOURCE_TYPE,
      attemptId: row.id,
      dedupeKey: alertDedupeKey(),
      title: SOURCE_ALERT_TITLE,
      message: errorMessage,
      href: SOURCE_ALERT_HREF,
    });
    return failed;
  }

  private async findRun(tx: Tx, organizationId: string, attemptId: string): Promise<SourceRun> {
    const row = await this.findRunOrNull(tx, organizationId, attemptId);
    if (!row) throw new NotFoundException('REVIEW_COLLECTION_ATTEMPT_NOT_FOUND');
    return row;
  }

  private findRunOrNull(tx: Tx, organizationId: string, attemptId: string) {
    return tx.sourceImportRun.findFirst({
      where: {
        id: attemptId,
        organizationId,
        sourceType: COUPANG_REVIEW_COLLECTION_SOURCE_TYPE,
      },
    });
  }

  private async attemptView(tx: Tx, row: SourceRun): Promise<ReviewCollectionAttempt> {
    const plan = readPlan(row.plan);
    const progress = readProgress(row.qualityReport);
    const isExpired = expired(row);
    const publication = progress.publication;
    return {
      attemptId: row.id,
      sourceImportRunId: row.id,
      state: row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS ? 'COMPLETE' : row.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && !isExpired ? 'RUNNING' : 'FAILED',
      plan,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      completedWindows: progress.completedWindows,
      windowReceipts: progress.completedWindows.flatMap((windowIndex) => {
        const receipt = progress.windows[String(windowIndex)];
        if (!receipt?.coverageStartDate || !receipt.coverageEndDate) return [];
        return [{
          windowIndex,
          itemCount: receipt.itemCount,
          pageCount: receipt.pageCount,
          pageLimitReached: receipt.pageLimitReached,
          coverageStartDate: receipt.coverageStartDate,
          coverageEndDate: receipt.coverageEndDate,
        }];
      }),
      coverageStartDate: row.coverageStartDate ? businessDateKey(row.coverageStartDate) : null,
      coverageEndDate: row.coverageEndDate ? businessDateKey(row.coverageEndDate) : null,
      collected: publication?.collected ?? completedItemCount(progress),
      created: publication?.created ?? 0,
      updated: publication?.updated ?? 0,
      linked: publication?.linked ?? 0,
      unlinked: publication?.unlinked ?? 0,
      errorCode: isExpired ? 'ATTEMPT_EXPIRED' : row.errorCode,
      errorMessage: isExpired ? 'Coupang review collection expired.' : row.errorMessage,
    };
  }

  private async controlView(tx: Tx, row: SourceRun): Promise<ReviewCollectionAttemptControl> {
    return { ...(await this.attemptView(tx, row)), attemptToken: row.attemptToken };
  }

  private assertToken(row: SourceRun, token: string): void {
    if (row.attemptToken !== token) throw new ConflictException('ATTEMPT_FENCE_LOST');
  }

  private assertRunning(row: SourceRun): void {
    if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
    if (expired(row)) throw new ConflictException('ATTEMPT_EXPIRED');
  }

  private async lock(tx: Tx, organizationId: string): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${COUPANG_REVIEW_COLLECTION_SOURCE_TYPE}`}, 0))::text AS lock
      FROM (SELECT ${organizationId}::uuid AS organization_id) AS tenant WHERE organization_id = ${organizationId}::uuid`;
  }
}

function normalizeMonths(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > COUPANG_REVIEW_COLLECTION_MAX_MONTHS) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_MONTHS');
  }
  return value;
}

function createPlan(months: number): ReviewCollectionPlan {
  return {
    sourceType: COUPANG_REVIEW_COLLECTION_SOURCE_TYPE,
    parserVersion: COUPANG_REVIEW_COLLECTION_PARSER_VERSION,
    months,
    windows: monthWindows(months),
    pageSize: COUPANG_REVIEW_COLLECTION_PAGE_SIZE,
    maxPagesPerWindow: COUPANG_REVIEW_COLLECTION_MAX_PAGES,
  };
}

function monthWindows(months: number, now = new Date()): ReviewCollectionWindow[] {
  const today = todayInSeoul(now);
  return Array.from({ length: months }, (_, index) => {
    const cursor = new Date(Date.UTC(today.year, today.month - 1 - index, 1));
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endDay = year === today.year && month === today.month ? today.day : lastDay;
    const label = `${year}-${pad2(month)}`;
    return {
      index,
      label,
      start: `${label}-01`,
      end: `${label}-${pad2(endDay)}`,
    };
  });
}

function todayInSeoul(now: Date): { year: number; month: number; day: number } {
  const [year, month, day] = businessDateKey(kstBusinessDate(now)).split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function readPlan(value: Prisma.JsonValue | null): ReviewCollectionPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('REVIEW_COLLECTION_PLAN_MISSING');
  }
  const plan = value as Record<string, unknown>;
  if (
    plan.sourceType !== COUPANG_REVIEW_COLLECTION_SOURCE_TYPE ||
    plan.parserVersion !== COUPANG_REVIEW_COLLECTION_PARSER_VERSION ||
    !Number.isSafeInteger(plan.months) ||
    !Array.isArray(plan.windows) ||
    plan.pageSize !== COUPANG_REVIEW_COLLECTION_PAGE_SIZE ||
    plan.maxPagesPerWindow !== COUPANG_REVIEW_COLLECTION_MAX_PAGES
  ) {
    throw new Error('REVIEW_COLLECTION_PLAN_INVALID');
  }
  return plan as unknown as ReviewCollectionPlan;
}

function windowAt(plan: ReviewCollectionPlan, index: number): ReviewCollectionWindow {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_WINDOW');
  }
  const window = plan.windows[index];
  if (!window || window.index !== index) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_WINDOW');
  }
  return window;
}

function parseItems(value: unknown): ReviewIngestItem[] {
  const result = ReviewIngestItemSchema.array().max(200).safeParse(value);
  if (!result.success) throw new BadRequestException('INVALID_REVIEW_COLLECTION_ITEMS');
  return result.data;
}

function validateWindowCompletion(
  plan: ReviewCollectionPlan,
  completion: ReviewCollectionWindowCompletion,
): void {
  if (
    !Number.isSafeInteger(completion.itemCount) ||
    completion.itemCount < 0 ||
    !Number.isSafeInteger(completion.pageCount) ||
    completion.pageCount < 0 ||
    completion.pageCount > plan.maxPagesPerWindow ||
    completion.pageLimitReached
  ) {
    throw new ConflictException('REVIEW_COLLECTION_PAGE_LIMIT_REACHED');
  }
  const window = windowAt(plan, completion.windowIndex);
  if (
    completion.coverageStartDate !== window.start ||
    completion.coverageEndDate !== window.end
  ) {
    throw new ConflictException('REVIEW_COLLECTION_WINDOW_COVERAGE_MISMATCH');
  }
}

function assertContiguousChunks(chunks: ReadonlyArray<{ sequence: number; itemCount: number }>): void {
  for (const [index, chunk] of chunks.entries()) {
    if (chunk.sequence !== index) throw new ConflictException('REVIEW_COLLECTION_CHUNKS_INCOMPLETE');
  }
}

function sameWindowCompletion(
  prior: Progress['windows'][string],
  completion: ReviewCollectionWindowCompletion,
): boolean {
  return (
    prior.itemCount === completion.itemCount &&
    prior.pageCount === completion.pageCount &&
    prior.pageLimitReached === completion.pageLimitReached &&
    prior.coverageStartDate === completion.coverageStartDate &&
    prior.coverageEndDate === completion.coverageEndDate
  );
}

function readProgress(value: Prisma.JsonValue | null): Progress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { completedWindows: [], windows: {} };
  }
  const root = value as Record<string, unknown>;
  // This owner writes its progress as the focused quality-report object. Read
  // the namespaced shape too so a future shared report can wrap it without
  // making an in-flight attempt look empty.
  const source = root.reviewCollection ?? root;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { completedWindows: [], windows: {} };
  }
  const record = source as Record<string, unknown>;
  const completedWindows = Array.isArray(record.completedWindows)
    ? record.completedWindows.filter(isSafeInteger)
    : [];
  const windows: Progress['windows'] = {};
  if (record.windows && typeof record.windows === 'object' && !Array.isArray(record.windows)) {
    for (const [key, raw] of Object.entries(record.windows as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const value = raw as Record<string, unknown>;
      const itemCount = value.itemCount;
      const chunkCount = value.chunkCount;
      const pageCount = value.pageCount;
      const pageLimitReached = value.pageLimitReached;
      const coverageStartDate = isoDateValue(value.coverageStartDate);
      const coverageEndDate = isoDateValue(value.coverageEndDate);
      const received = value.received;
      const created = value.created;
      const updated = value.updated;
      const linked = value.linked;
      const unlinked = value.unlinked;
      if (
        isSafeInteger(itemCount) &&
        isSafeInteger(chunkCount) &&
        isSafeInteger(pageCount) &&
        typeof pageLimitReached === 'boolean' &&
        isSafeInteger(received) &&
        isSafeInteger(created) &&
        isSafeInteger(updated) &&
        isSafeInteger(linked) &&
        isSafeInteger(unlinked)
      ) {
        windows[key] = {
          itemCount,
          chunkCount,
          pageCount,
          pageLimitReached,
          ...(coverageStartDate && coverageEndDate
            ? { coverageStartDate, coverageEndDate }
            : {}),
          received,
          created,
          updated,
          linked,
          unlinked,
        };
      }
    }
  }
  const publication = record.publication;
  const normalizedPublication =
    publication && typeof publication === 'object' && !Array.isArray(publication)
      ? parsePublication(publication as Record<string, unknown>)
      : undefined;
  return {
    completedWindows: [...new Set(completedWindows)].sort((a, b) => a - b),
    windows,
    ...(normalizedPublication ? { publication: normalizedPublication } : {}),
  };
}

function parsePublication(value: Record<string, unknown>): Progress['publication'] | undefined {
  const keys = ['collected', 'received', 'created', 'updated', 'linked', 'unlinked'];
  const values = keys.map((key) => value[key]);
  if (!values.every(isNonNegativeSafeInteger)) return undefined;
  const [collected, received, created, updated, linked, unlinked] = values;
  return {
    collected,
    received,
    created,
    updated,
    linked,
    unlinked,
  };
}

function completedItemCount(progress: Progress): number {
  return Object.values(progress.windows).reduce((sum, window) => sum + window.itemCount, 0);
}

function progressPublication(
  progress: Progress,
  collected: number,
): ReviewIngestResponse & { collected: number } {
  const totals = Object.values(progress.windows).reduce(
    (sum, window) => ({
      received: sum.received + window.received,
      created: sum.created + window.created,
      updated: sum.updated + window.updated,
      linked: sum.linked + window.linked,
      unlinked: sum.unlinked + window.unlinked,
    }),
    { received: 0, created: 0, updated: 0, linked: 0, unlinked: 0 },
  );
  return { collected, ...totals };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDateValue(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = dateOnly(value);
  return Number.isNaN(parsed.getTime()) || businessDateKey(parsed) !== value ? null : value;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

function expired(row: Pick<SourceRun, 'status' | 'expiresAt'>): boolean {
  return row.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && (!row.expiresAt || row.expiresAt.getTime() <= Date.now());
}

function alertDedupeKey(): string {
  return `source:${COUPANG_REVIEW_COLLECTION_SOURCE_TYPE}`;
}
