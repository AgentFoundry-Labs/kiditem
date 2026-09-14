import { createHash, randomUUID } from 'node:crypto';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
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
  SELLPIA_SHIPMENT_TRACKING_PARSER_VERSION,
  SELLPIA_SHIPMENT_TRACKING_SOURCE_ACCOUNT_KEY,
  SELLPIA_SHIPMENT_TRACKING_SOURCE_ORIGIN,
  SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE,
  type SellpiaShipmentTrackingAttempt,
  type SellpiaShipmentTrackingAttemptControl,
  type SellpiaShipmentTrackingPlan,
  type SellpiaShipmentTrackingSourceDownload,
  type SellpiaShipmentTrackingSourcePort,
  type SellpiaShipmentTrackingSourceSubmission,
} from '../../../application/port/in/sellpia-shipment-tracking-source.port';

const ATTEMPT_EXPIRES_IN_MS = 30 * 60_000;
const SOURCE_ALERT_TITLE = '셀피아 송장 조회 실패';
const ARTIFACT_SELECT = {
  id: true,
  sourceImportRunId: true,
  sourceFileName: true,
  sourceContentType: true,
  sourceBytes: true,
  createdAt: true,
} as const;

type Tx = Prisma.TransactionClient;
type SourceRun = Prisma.SourceImportRunGetPayload<{}>;
type ArtifactRow = Prisma.OrderCollectionArtifactGetPayload<{
  select: typeof ARTIFACT_SELECT;
}>;

@Injectable()
export class SellpiaShipmentTrackingSourceRepository
implements SellpiaShipmentTrackingSourcePort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(input: {
    organizationId: string;
    userId?: string;
    idempotencyKey: string;
    startDate: string;
    endDate: string;
  }): Promise<SellpiaShipmentTrackingAttemptControl> {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_IDEMPOTENCY_KEY');
    }
    const startDate = validDate(input.startDate);
    const endDate = validDate(input.endDate);
    if (!startDate || !endDate || !validRequestedWindow(startDate, endDate)) {
      throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_DATE_RANGE');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const fingerprint = canonicalOwnerInputHash({ startDate, endDate });
      let existing = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE,
          idempotencyKey,
        },
      });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        }
        if (expired(existing)) {
          existing = await this.failIn(
            tx,
            existing,
            'ATTEMPT_EXPIRED',
            'Sellpia shipment tracking collection expired.',
          );
        }
        return this.controlView(tx, existing);
      }

      const running = await tx.sourceImportRun.findMany({
        where: {
          organizationId: input.organizationId,
          sourceType: SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE,
          channelAccountId: null,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const active = running.find((row) => !expired(row));
      if (active) {
        throw new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: active.id });
      }
      for (const expiredRun of running) {
        await this.failIn(
          tx,
          expiredRun,
          'ATTEMPT_EXPIRED',
          'Sellpia shipment tracking collection expired.',
        );
      }

      const plan: SellpiaShipmentTrackingPlan = {
        sourceType: SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE,
        parserVersion: SELLPIA_SHIPMENT_TRACKING_PARSER_VERSION,
        sourceOrigin: SELLPIA_SHIPMENT_TRACKING_SOURCE_ORIGIN,
        sourceAccountKey: SELLPIA_SHIPMENT_TRACKING_SOURCE_ACCOUNT_KEY,
        startDate,
        endDate,
      };
      const row = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE,
          channelAccountId: null,
          idempotencyKey,
          requestFingerprint: fingerprint,
          attemptToken: randomUUID(),
          plan: plan as unknown as Prisma.InputJsonValue,
          parserVersion: SELLPIA_SHIPMENT_TRACKING_PARSER_VERSION,
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
  }): Promise<SellpiaShipmentTrackingAttempt | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.findOptionalRun(tx, input.organizationId, input.attemptId);
      return row ? this.attemptView(tx, row) : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaShipmentTrackingAttemptControl | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.findOptionalRun(tx, input.organizationId, input.attemptId);
      return row ? this.controlView(tx, row) : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async completeAttempt(input: {
    organizationId: string;
    userId?: string;
    attemptId: string;
    attemptToken: string;
    source: SellpiaShipmentTrackingSourceSubmission;
  }): Promise<SellpiaShipmentTrackingAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      const checksum = submissionHash(input.source.bytes);
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        if (row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS && row.contentChecksum === checksum) {
          return this.attemptView(tx, row);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) throw new ConflictException('ATTEMPT_EXPIRED');

      const coverage = confirmedCoverage(input.source.bytes, readPlan(row.plan));

      await tx.orderCollectionArtifact.create({
        data: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          sourceFileName: input.source.fileName,
          sourceContentType: input.source.contentType,
          sourceBytes: new Uint8Array(input.source.bytes),
        },
      });
      const completed = await tx.sourceImportRun.update({
        where: { id: row.id },
        data: {
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          importedAt: new Date(),
          lastVerifiedAt: new Date(),
          verificationCount: { increment: 1 },
          contentChecksum: checksum,
          contentByteCount: input.source.bytes.byteLength,
          fileName: input.source.fileName,
          coverageStartDate: coverage ? new Date(`${coverage.start}T00:00:00.000Z`) : null,
          coverageEndDate: coverage ? new Date(`${coverage.end}T00:00:00.000Z`) : null,
          errorCode: null,
          errorMessage: null,
        },
      });
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: alertDedupeKey(row),
        attemptId: row.id,
      });
      return this.attemptView(tx, completed);
    });
  }

  async failAttempt(input: {
    organizationId: string;
    userId?: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<SellpiaShipmentTrackingAttempt> {
    const errorCode = input.errorCode.trim().slice(0, 100);
    const errorMessage = redact(input.errorMessage).trim().slice(0, 300);
    if (!errorCode || !errorMessage) {
      throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_FAILURE');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        if (
          row.status === SOURCE_IMPORT_RUN_FAILED_STATUS
          && row.errorCode === errorCode
          && row.errorMessage === errorMessage
        ) {
          return this.attemptView(tx, row);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) throw new ConflictException('ATTEMPT_EXPIRED');
      const failed = await this.failIn(tx, row, errorCode, errorMessage);
      return this.attemptView(tx, failed);
    });
  }

  async readSourceDownload(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaShipmentTrackingSourceDownload> {
    const row = await this.prisma.orderCollectionArtifact.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceImportRunId: input.attemptId,
        sourceImportRun: {
          organizationId: input.organizationId,
          sourceType: SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE,
        },
      },
      select: ARTIFACT_SELECT,
    });
    if (!row) throw new NotFoundException('SELLPIA_SHIPMENT_TRACKING_SOURCE_NOT_FOUND');
    return {
      bytes: Buffer.from(row.sourceBytes),
      fileName: row.sourceFileName,
      contentType: row.sourceContentType,
    };
  }

  private async findRun(tx: Tx, organizationId: string, attemptId: string): Promise<SourceRun> {
    const row = await this.findOptionalRun(tx, organizationId, attemptId);
    if (!row) throw new NotFoundException('SELLPIA_SHIPMENT_TRACKING_ATTEMPT_NOT_FOUND');
    return row;
  }

  private findOptionalRun(
    tx: Tx,
    organizationId: string,
    attemptId: string,
  ): Promise<SourceRun | null> {
    return tx.sourceImportRun.findFirst({
      where: {
        id: attemptId,
        organizationId,
        sourceType: SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE,
      },
    });
  }

  private async attemptView(
    tx: Tx,
    row: SourceRun,
  ): Promise<SellpiaShipmentTrackingAttempt> {
    const artifact = await this.findArtifact(tx, row.organizationId, row.id);
    const plan = readPlan(row.plan);
    const isExpired = expired(row);
    return {
      attemptId: row.id,
      sourceImportRunId: row.id,
      state: row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
        ? 'COMPLETE'
        : row.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && !isExpired
          ? 'RUNNING'
          : 'FAILED',
      plan,
      coverageStartDate: row.coverageStartDate?.toISOString().slice(0, 10) ?? null,
      coverageEndDate: row.coverageEndDate?.toISOString().slice(0, 10) ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      artifactId: artifact?.id ?? null,
      sourceFileName: artifact?.sourceFileName ?? row.fileName,
      sourceContentType: artifact?.sourceContentType ?? null,
      contentChecksum: row.contentChecksum,
      sourceByteCount: row.contentByteCount,
      errorCode: isExpired ? 'ATTEMPT_EXPIRED' : row.errorCode,
      errorMessage: isExpired
        ? 'Sellpia shipment tracking collection expired.'
        : row.errorMessage,
    };
  }

  private async controlView(
    tx: Tx,
    row: SourceRun,
  ): Promise<SellpiaShipmentTrackingAttemptControl> {
    return { ...(await this.attemptView(tx, row)), attemptToken: row.attemptToken };
  }

  private async failIn(
    tx: Tx,
    row: SourceRun,
    code: string,
    message: string,
  ): Promise<SourceRun> {
    const failed = await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: {
        status: SOURCE_IMPORT_RUN_FAILED_STATUS,
        errorCode: code,
        errorMessage: message,
      },
    });
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: row.organizationId,
      sourceType: SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE,
      attemptId: row.id,
      dedupeKey: alertDedupeKey(row),
      title: SOURCE_ALERT_TITLE,
      message: message,
      href: '/order-collection',
    });
    return failed;
  }

  private findArtifact(
    tx: Tx,
    organizationId: string,
    sourceImportRunId: string,
  ): Promise<ArtifactRow | null> {
    return tx.orderCollectionArtifact.findFirst({
      where: { organizationId, sourceImportRunId },
      select: ARTIFACT_SELECT,
    });
  }

  private async lock(tx: Tx, organizationId: string): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE}`}, 0))::text AS lock
      FROM (SELECT ${organizationId}::uuid AS organization_id) AS tenant WHERE organization_id = ${organizationId}::uuid`;
  }
}

function validDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? value
    : null;
}

function readPlan(value: Prisma.JsonValue | null): SellpiaShipmentTrackingPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('SELLPIA_SHIPMENT_TRACKING_PLAN_MISSING');
  }
  const plan = value as Record<string, unknown>;
  if (
    plan.sourceType !== SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE
    || plan.parserVersion !== SELLPIA_SHIPMENT_TRACKING_PARSER_VERSION
    || plan.sourceOrigin !== SELLPIA_SHIPMENT_TRACKING_SOURCE_ORIGIN
    || plan.sourceAccountKey !== SELLPIA_SHIPMENT_TRACKING_SOURCE_ACCOUNT_KEY
    || !validDate(String(plan.startDate ?? ''))
    || !validDate(String(plan.endDate ?? ''))
    || !validRequestedWindow(String(plan.startDate), String(plan.endDate))
  ) {
    throw new Error('SELLPIA_SHIPMENT_TRACKING_PLAN_INVALID');
  }
  return plan as SellpiaShipmentTrackingPlan;
}

function validRequestedWindow(start: string, end: string): boolean {
  return start <= end && Date.parse(end) - Date.parse(start) <= 30 * 24 * 60 * 60 * 1_000;
}

function confirmedCoverage(
  bytes: Buffer,
  plan: SellpiaShipmentTrackingPlan,
): { start: string; end: string } | null {
  let payload: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    payload = value as Record<string, unknown>;
    if (!Array.isArray(payload.rows) || !Number.isInteger(payload.total)
      || Number(payload.total) < payload.rows.length) throw new Error();
  } catch {
    throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_EVIDENCE');
  }
  const queried = readWindow(payload.range);
  if (queried.start < plan.startDate || queried.end > plan.endDate) {
    throw new BadRequestException('SELLPIA_SHIPMENT_TRACKING_RANGE_OUTSIDE_PLAN');
  }
  // The historical range is the query, not proof that every date was confirmed.
  if (payload.confirmedRange == null) return null;
  const confirmed = readWindow(payload.confirmedRange);
  if (confirmed.start < queried.start || confirmed.end > queried.end) {
    throw new BadRequestException('SELLPIA_SHIPMENT_TRACKING_COVERAGE_OUTSIDE_QUERY');
  }
  return confirmed;
}

function readWindow(value: unknown): { start: string; end: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_COVERAGE');
  }
  const window = value as Record<string, unknown>;
  const start = typeof window.start === 'string' ? validDate(window.start) : null;
  const end = typeof window.end === 'string' ? validDate(window.end) : null;
  if (!start || !end || start > end) {
    throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_COVERAGE');
  }
  return { start, end };
}

function expired(row: Pick<SourceRun, 'status' | 'expiresAt'>): boolean {
  return row.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && (!row.expiresAt || row.expiresAt.getTime() <= Date.now());
}

function alertDedupeKey(row: SourceRun): string {
  const plan = readPlan(row.plan);
  return `source:${SELLPIA_SHIPMENT_TRACKING_SOURCE_TYPE}:${plan.startDate}`;
}

function submissionHash(bytes: Buffer): string {
  const hash = createHash('sha256');
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  hash.update(length).update(bytes);
  return hash.digest('hex');
}
