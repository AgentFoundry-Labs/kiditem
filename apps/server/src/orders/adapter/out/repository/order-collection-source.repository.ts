import { createHash, randomUUID } from 'node:crypto';
import { redact } from '../../../../common/redact';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import {
  ORDER_COLLECTION_MALLS,
  type OrderCollectionMallKey,
} from '../../../services/order-collection-mall-account.service';
import type {
  OrderCollectionArtifact,
  OrderCollectionAttempt,
  OrderCollectionAttemptControl,
  OrderCollectionConfirmedCoverage,
  OrderCollectionMode,
  OrderCollectionPlan,
  OrderCollectionSourcePort,
  OrderCollectionSourceDownload,
  OrderCollectionSourceSubmission,
} from '../../../application/port/in/order-collection-source.port';

const SOURCE_TYPE = 'order_collection_mall' as const;
const PARSER_VERSION = 'order-collection-v1';
const SOURCE_ALERT_TITLE = '몰 주문 수집 실패';
const ATTEMPT_EXPIRES_IN_MS = 30 * 60_000;
const COVERAGE_CAPABLE_MALLS = new Set(['haebub-mall', 'domeggook']);
const ARTIFACT_SELECT = {
  id: true,
  organizationId: true,
  sourceImportRunId: true,
  sourceFileName: true,
  sourceContentType: true,
  sourceBytes: true,
  createdAt: true,
} as const;

type Tx = Prisma.TransactionClient;
type SourceRun = Prisma.SourceImportRunGetPayload<{}>;
type ArtifactRow = Prisma.OrderCollectionArtifactGetPayload<{ select: typeof ARTIFACT_SELECT }>;

@Injectable()
export class OrderCollectionSourceRepository implements OrderCollectionSourcePort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(input: {
    organizationId: string;
    userId?: string;
    idempotencyKey: string;
    mallKey: string;
    collectionDate: string | null;
    collectionMode: OrderCollectionMode;
    selectionMode?: 'manual' | 'automatic';
    seenRowKeys?: string[];
  }): Promise<OrderCollectionAttempt & { attemptToken: string }> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const account = await tx.channelAccount.findFirst({
        where: {
          organizationId: input.organizationId,
          channel: 'order_collection',
          externalAccountId: input.mallKey,
        },
        select: { id: true, externalAccountId: true },
      });
      if (!account || !account.externalAccountId) {
        throw new NotFoundException('ORDER_COLLECTION_MALL_NOT_FOUND');
      }
      const mall = mallByKey(account.externalAccountId);
      const plan: OrderCollectionPlan = {
        sourceType: SOURCE_TYPE,
        parserVersion: PARSER_VERSION,
        mallKey: mall.key,
        mallName: mall.name,
        channelAccountId: account.id,
        collectionDate: input.collectionDate,
        collectionMode: input.collectionMode,
        ...(input.selectionMode ? { selectionMode: input.selectionMode } : {}),
        ...(input.seenRowKeys ? { seenRowKeys: [...input.seenRowKeys] } : {}),
      };
      const requestFingerprint = canonicalOwnerInputHash({
        mallKey: mall.key,
        channelAccountId: account.id,
        collectionDate: input.collectionDate,
        collectionMode: input.collectionMode,
        selectionMode: input.selectionMode ?? null,
        seenRowKeys: input.seenRowKeys ?? null,
      });

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
              'Order collection expired.',
            )
          : replay;
        return this.controlView(tx, row);
      }

      const running = await tx.sourceImportRun.findMany({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: account.id,
          status: 'running',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const active = running.find((row) => !expired(row));
      if (active) {
        // Without a message the error response carries only "Conflict Exception".
        throw new ConflictException({
          code: 'ATTEMPT_IN_PROGRESS',
          attemptId: active.id,
          message: 'ATTEMPT_IN_PROGRESS',
        });
      }
      for (const expiredRun of running) {
        await this.failIn(
          tx,
          expiredRun,
          'ATTEMPT_EXPIRED',
          'Order collection expired.',
        );
      }

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
  }): Promise<OrderCollectionAttempt | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.sourceImportRun.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
        },
      });
      return row ? this.attemptView(tx, row) : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<OrderCollectionAttemptControl | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.sourceImportRun.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
        },
      });
      return row ? this.controlView(tx, row) : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async validateCompletion(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    mallKey: string;
    source: OrderCollectionSourceSubmission;
    confirmedCoverage: OrderCollectionConfirmedCoverage | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      const plan = readPlan(row.plan);
      if (plan.mallKey !== input.mallKey) {
        throw new ConflictException('ORDER_COLLECTION_MALL_MISMATCH');
      }
      assertConfirmedCoverage(plan, input.confirmedCoverage);
      const checksum = submissionHash(input.source.bytes);
      if (row.status === 'completed') {
        if (
          row.contentChecksum !== checksum ||
          !sameConfirmedCoverage(row, input.confirmedCoverage) ||
          !(await this.findArtifact(tx, input.organizationId, row.id))
        ) {
          throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
        }
        return;
      }
      if (row.status !== 'running') {
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) throw new ConflictException('ATTEMPT_EXPIRED');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async completeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    mallKey: string;
    source: OrderCollectionSourceSubmission;
    confirmedCoverage: OrderCollectionConfirmedCoverage | null;
  }): Promise<OrderCollectionArtifact> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) throw new ConflictException('ATTEMPT_FENCE_LOST');
      const plan = readPlan(row.plan);
      if (plan.mallKey !== input.mallKey) {
        throw new ConflictException('ORDER_COLLECTION_MALL_MISMATCH');
      }
      assertConfirmedCoverage(plan, input.confirmedCoverage);
      const submissionChecksum = submissionHash(input.source.bytes);
      if (row.status !== 'running') {
        if (
          row.status === 'completed' &&
          row.contentChecksum === submissionChecksum &&
          sameConfirmedCoverage(row, input.confirmedCoverage)
        ) {
          const replay = await this.findArtifact(tx, input.organizationId, row.id);
          if (replay) return toArtifact(replay);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) {
        throw new ConflictException('ATTEMPT_EXPIRED');
      }

      const artifact = await tx.orderCollectionArtifact.create({
        data: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          sourceFileName: input.source.fileName,
          sourceContentType: input.source.contentType,
          sourceBytes: new Uint8Array(input.source.bytes),
        },
      });
      const completedAt = new Date();
      await tx.sourceImportRun.update({
        where: { id: row.id, organizationId: input.organizationId },
        data: {
          status: 'completed',
          importedAt: completedAt,
          lastVerifiedAt: completedAt,
          verificationCount: { increment: 1 },
          contentChecksum: submissionChecksum,
          coverageStartDate: input.confirmedCoverage
            ? dateOnly(input.confirmedCoverage.startDate)
            : null,
          coverageEndDate: input.confirmedCoverage
            ? dateOnly(input.confirmedCoverage.endDate)
            : null,
          errorCode: null,
          errorMessage: null,
        },
      });
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: alertDedupeKey(row),
        attemptId: row.id,
      });
      return toArtifact(artifact);
    });
  }

  async failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
    source?: OrderCollectionSourceSubmission;
  }): Promise<OrderCollectionAttempt> {
    const message = redact(input.message).slice(0, 300);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) throw new ConflictException('ATTEMPT_FENCE_LOST');
      const source = input.source;
      const checksum = source ? submissionHash(source.bytes) : null;
      if (row.status !== 'running') {
        if (row.status === 'failed' && row.errorCode === input.code && row.contentChecksum === checksum) {
          return this.attemptView(tx, row);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) {
        throw new ConflictException('ATTEMPT_EXPIRED');
      }

      if (source) {
        await tx.orderCollectionArtifact.create({
          data: {
            organizationId: input.organizationId,
            sourceImportRunId: row.id,
            sourceFileName: source.fileName,
            sourceContentType: source.contentType,
            sourceBytes: new Uint8Array(source.bytes),
          },
        });
      }
      const failed = await this.failIn(tx, row, input.code, message, checksum ?? undefined);
      return this.attemptView(tx, failed);
    });
  }

  async readSourceDownload(input: {
    organizationId: string;
    artifactId: string;
  }): Promise<OrderCollectionSourceDownload> {
    const row = await this.prisma.orderCollectionArtifact.findFirst({
      where: {
        id: input.artifactId,
        organizationId: input.organizationId,
        sourceImportRun: { organizationId: input.organizationId, sourceType: SOURCE_TYPE },
      },
      select: {
        sourceBytes: true,
        sourceFileName: true,
        sourceContentType: true,
      },
    });
    if (!row) throw new NotFoundException('ORDER_COLLECTION_ARTIFACT_NOT_FOUND');
    return {
      bytes: Buffer.from(row.sourceBytes),
      fileName: row.sourceFileName,
      contentType: row.sourceContentType,
    };
  }

  private async findRun(tx: Tx, organizationId: string, attemptId: string): Promise<SourceRun> {
    const row = await tx.sourceImportRun.findFirst({
      where: { id: attemptId, organizationId, sourceType: SOURCE_TYPE },
    });
    if (!row) throw new NotFoundException('ORDER_COLLECTION_ATTEMPT_NOT_FOUND');
    return row;
  }

  private async attemptView(tx: Tx, row: SourceRun): Promise<OrderCollectionAttempt> {
    const artifact = await this.findArtifact(tx, row.organizationId, row.id);
    const plan = readPlan(row.plan);
    const isExpired = expired(row);
    return {
      attemptId: row.id,
      sourceImportRunId: row.id,
      state: row.status === 'completed' ? 'COMPLETE' : row.status === 'running' && !isExpired ? 'RUNNING' : 'FAILED',
      plan,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      artifactId: artifact?.id ?? null,
      coverageStartDate: row.coverageStartDate ? isoDate(row.coverageStartDate) : null,
      coverageEndDate: row.coverageEndDate ? isoDate(row.coverageEndDate) : null,
      errorCode: isExpired ? 'ATTEMPT_EXPIRED' : row.errorCode,
      errorMessage: isExpired ? 'Order collection expired.' : row.errorMessage,
    };
  }

  private async controlView(tx: Tx, row: SourceRun): Promise<OrderCollectionAttempt & { attemptToken: string }> {
    return { ...(await this.attemptView(tx, row)), attemptToken: row.attemptToken };
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
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: row.organizationId,
      sourceType: SOURCE_TYPE,
      attemptId: row.id,
      dedupeKey: alertDedupeKey(row),
      title: SOURCE_ALERT_TITLE,
      message: message,
      href: '/order-collection',
    });
    return failed;
  }

  private async findArtifact(tx: Tx, organizationId: string, sourceImportRunId: string): Promise<ArtifactRow | null> {
    return tx.orderCollectionArtifact.findFirst({
      where: { organizationId, sourceImportRunId },
      select: {
        ...ARTIFACT_SELECT,
      },
    });
  }

  private async lock(tx: Tx, organizationId: string): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${SOURCE_TYPE}`}, 0))::text AS lock
      FROM (SELECT ${organizationId}::uuid AS organization_id) AS tenant WHERE organization_id = ${organizationId}::uuid`;
  }
}

function mallByKey(key: string): { key: OrderCollectionMallKey; name: string } {
  const mall = ORDER_COLLECTION_MALLS.find((item) => item.key === key);
  if (!mall) throw new BadRequestException('ORDER_COLLECTION_MALL_UNSUPPORTED');
  return mall;
}

function readPlan(value: Prisma.JsonValue | null): OrderCollectionPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ORDER_COLLECTION_PLAN_MISSING');
  }
  const plan = value as Record<string, unknown>;
  if (
    plan.sourceType !== SOURCE_TYPE ||
    typeof plan.parserVersion !== 'string' ||
    typeof plan.mallKey !== 'string' ||
    typeof plan.mallName !== 'string' ||
    typeof plan.channelAccountId !== 'string' ||
    (plan.collectionDate !== null && typeof plan.collectionDate !== 'string') ||
    (plan.collectionMode !== 'browser' && plan.collectionMode !== 'manual-upload') ||
    (plan.selectionMode !== undefined &&
      plan.selectionMode !== 'manual' && plan.selectionMode !== 'automatic') ||
    (plan.seenRowKeys !== undefined &&
      (!Array.isArray(plan.seenRowKeys) ||
        plan.seenRowKeys.length > 8_000 ||
        plan.seenRowKeys.some((key) => typeof key !== 'string' || key.length > 2_000)))
  ) {
    throw new Error('ORDER_COLLECTION_PLAN_INVALID');
  }
  return plan as OrderCollectionPlan;
}

function assertConfirmedCoverage(
  plan: OrderCollectionPlan,
  coverage: OrderCollectionConfirmedCoverage | null,
): void {
  if (!coverage) return;
  if (!isDateOnly(coverage.startDate) || !isDateOnly(coverage.endDate)) {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_CONFIRMED_COVERAGE');
  }
  if (
    !COVERAGE_CAPABLE_MALLS.has(plan.mallKey) ||
    !plan.collectionDate ||
    coverage.startDate !== plan.collectionDate ||
    coverage.endDate !== plan.collectionDate
  ) {
    throw new ConflictException('ORDER_COLLECTION_COVERAGE_MISMATCH');
  }
}

function sameConfirmedCoverage(
  row: SourceRun,
  coverage: OrderCollectionConfirmedCoverage | null,
): boolean {
  return (
    (row.coverageStartDate ? isoDate(row.coverageStartDate) : null) ===
      (coverage?.startDate ?? null) &&
    (row.coverageEndDate ? isoDate(row.coverageEndDate) : null) ===
      (coverage?.endDate ?? null)
  );
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = dateOnly(value);
  return !Number.isNaN(parsed.getTime()) && isoDate(parsed) === value;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function expired(row: Pick<SourceRun, 'status' | 'expiresAt'>): boolean {
  return row.status === 'running' && (!row.expiresAt || row.expiresAt.getTime() <= Date.now());
}

function alertDedupeKey(row: SourceRun): string {
  const plan = readPlan(row.plan);
  return `source:${SOURCE_TYPE}:${plan.mallKey}`;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toArtifact(row: ArtifactRow): OrderCollectionArtifact {
  return {
    artifactId: row.id,
    sourceImportRunId: row.sourceImportRunId,
    sourceFileName: row.sourceFileName,
    sourceContentType: row.sourceContentType,
    createdAt: row.createdAt.toISOString(),
    sourceDownloadAvailable: Boolean(row.sourceBytes),
  };
}

function submissionHash(source: Buffer): string {
  const hash = createHash('sha256');
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(source.length));
  hash.update(length).update(source);
  return hash.digest('hex');
}
