import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type SourceImportRun } from "@prisma/client";
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from "@kiditem/shared/source-import";
import { PrismaService } from "../../../../prisma/prisma.service";
import { SourceFailureAlerts } from "../../../../alerts/alerts.service";
import {
  OPERATOR_CANCEL_CODE,
  OPERATOR_CANCEL_MESSAGE,
} from "../../../../common/operator-cancel";
import type { CoupangShipmentDateSummaryRepositoryPort } from "../../../application/port/out/repository/coupang-shipment-date-summary.repository.port";
import type {
  ShipmentSummaryPlan,
  ShipmentSummarySubmission,
} from "../../../application/port/in/fulfillment";
import {
  COUPANG_SHIPMENT_SUMMARY_PARSER_VERSION,
  COUPANG_SHIPMENT_SUMMARY_SOURCE_TYPE,
  readCoupangShipmentSummaryAttempt,
  readCoupangShipmentSummarySource,
  publicShipmentSummaryAttempt,
  shipmentSummaryAttempt,
} from "../../../read/coupang-shipment-date-summary.reader";

const SOURCE = COUPANG_SHIPMENT_SUMMARY_SOURCE_TYPE;
const ALERT = "inventory:coupang_shipment_summary";
const PARSER = COUPANG_SHIPMENT_SUMMARY_PARSER_VERSION;
// Existing 10s preparation + 90s injection and terminal transport; never extended.
const LEASE_MS = 180_000;
type Tx = Prisma.TransactionClient;

@Injectable()
export class CoupangShipmentDateSummaryRepositoryAdapter implements CoupangShipmentDateSummaryRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async listDateSummary(organizationId: string) {
    return (await this.readSummarySource(organizationId)).items;
  }

  async beginSummary(
    organizationId: string,
    idempotencyKey: string,
    maxPages?: number,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 128)
      throw new BadRequestException("IDEMPOTENCY_KEY_REQUIRED");
    const plan = makePlan(maxPages);
    const fingerprint = checksum(plan);
    return this.prisma.$transaction(async (tx) => {
      await lock(tx, organizationId);
      const prior = await tx.sourceImportRun.findFirst({
        where: {
          organizationId,
          sourceType: SOURCE,
          parserVersion: PARSER,
          idempotencyKey,
        },
      });
      if (prior && prior.requestFingerprint !== fingerprint)
        throw new ConflictException("SOURCE_IDEMPOTENCY_KEY_REUSED");
      const running = await tx.sourceImportRun.findFirst({
        where: {
          organizationId,
          sourceType: SOURCE,
          parserVersion: PARSER,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        },
      });
      if (running && expired(running))
        await this.fail(
          tx,
          running,
          "ATTEMPT_EXPIRED",
          "쉽먼트 조회 시간이 만료되었습니다. 다시 조회해주세요.",
        );
      if (prior) return control(await find(tx, organizationId, prior.id));
      if (running && !expired(running))
        throw new ConflictException({
          code: "ATTEMPT_IN_PROGRESS",
          attemptId: running.id,
        });
      const last = await tx.sourceImportRun.aggregate({
        where: { organizationId, sourceType: SOURCE, parserVersion: PARSER },
        _max: { freshnessGeneration: true },
      });
      const run = await tx.sourceImportRun.create({
        data: {
          organizationId,
          sourceType: SOURCE,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          idempotencyKey,
          requestFingerprint: fingerprint,
          plan,
          parserVersion: PARSER,
          freshnessGeneration: (last._max.freshnessGeneration ?? 0n) + 1n,
          expiresAt: new Date(Date.now() + LEASE_MS),
        },
      });
      return control(run);
    });
  }

  async readSummarySource(organizationId: string, maxPages?: number) {
    return this.prisma.$transaction(
      (tx) =>
        readCoupangShipmentSummarySource(tx, {
          organizationId,
          requestFingerprint: checksum(makePlan(maxPages)),
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readSummaryAttempt(organizationId: string, attemptId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const attempt = await readCoupangShipmentSummaryAttempt(tx, {
          organizationId,
          attemptId,
        });
        if (!attempt)
          throw new NotFoundException("SHIPMENT_SUMMARY_ATTEMPT_NOT_FOUND");
        return attempt;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async completeSummary(
    organizationId: string,
    attemptId: string,
    token: string,
    input: ShipmentSummarySubmission,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lock(tx, organizationId);
      const run = await find(tx, organizationId, attemptId);
      fence(run, token);
      const plan = run.plan as unknown as ShipmentSummaryPlan;
      const items = validateSubmission(plan, input);
      const proof = {
        maxPages: input.proof.maxPages,
        validatedTable: input.proof.validatedTable,
        stopReason: input.proof.stopReason,
        lastPageRowCount: input.proof.lastPageRowCount,
        pageRowCounts: input.proof.pageRowCounts,
      };
      const hash = checksum({
        plan,
        items,
        scannedPages: input.scannedPages,
        totalRows: input.totalRows,
        proof,
      });
      if (
        run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS &&
        run.contentChecksum === hash
      )
        return control(run);
      writable(run);
      const now = new Date();
      if (items.length)
        await tx.coupangShipmentDateSummary.createMany({
          data: items.map((item) => ({
            organizationId,
            sourceImportRunId: run.id,
            shipmentDate: item.date,
            count: item.count,
            boxes: item.boxes,
            capturedAt: now,
          })),
        });
      const complete = await tx.sourceImportRun.update({
        where: { id: run.id, organizationId },
        data: {
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          rowCount: items.length,
          importedAt: now,
          contentChecksum: hash,
          providerBackedEmptyProof: items.length === 0,
          qualityReport: {
            scannedPages: input.scannedPages,
            totalRows: input.totalRows,
            proof,
            actualCutoffAt: now.toISOString(),
          },
        },
      });
      await this.alerts.resolveSourceFailure(tx, {
        organizationId,
        dedupeKey: ALERT,
        attemptId: run.id,
      });
      return control(complete);
    });
  }

  async failSummary(
    organizationId: string,
    attemptId: string,
    token: string,
    code: string,
    message: string,
  ) {
    if (!code || code.length > 100 || !message || message.length > 300)
      throw new BadRequestException("INVALID_SOURCE_FAILURE");
    return this.prisma.$transaction(async (tx) => {
      await lock(tx, organizationId);
      const run = await find(tx, organizationId, attemptId);
      fence(run, token);
      if (
        run.status === SOURCE_IMPORT_RUN_FAILED_STATUS &&
        run.errorCode === code &&
        run.errorMessage === message
      )
        return control(run);
      writable(run);
      return control(await this.fail(tx, run, code, message));
    });
  }

  /**
   * Operator stop without the attempt token. It fails through the same terminal
   * path as an extension-reported failure, so the alert suppression for
   * `*_CANCELLED` applies; a terminal attempt is returned as is.
   */
  async cancelSummary(organizationId: string, attemptId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lock(tx, organizationId);
      const run = await find(tx, organizationId, attemptId);
      if (run.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        return publicShipmentSummaryAttempt(run);
      }
      return publicShipmentSummaryAttempt(
        expired(run)
          ? await this.fail(
              tx,
              run,
              "ATTEMPT_EXPIRED",
              "쿠팡 쉽먼트 조회가 만료되었습니다.",
            )
          : await this.fail(tx, run, OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE),
      );
    });
  }

  private async fail(
    tx: Tx,
    run: SourceImportRun,
    code: string,
    message: string,
  ) {
    const failed = await tx.sourceImportRun.update({
      where: { id: run.id, organizationId: run.organizationId },
      data: { status: SOURCE_IMPORT_RUN_FAILED_STATUS, errorCode: code, errorMessage: message },
    });
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: run.organizationId,
      dedupeKey: ALERT,
      attemptId: run.id,
      sourceType: SOURCE,
      title: "쿠팡 쉽먼트 조회 실패",
      message,
      href: "/coupang-shipments",
    });
    return failed;
  }
}

function makePlan(maxPages?: number): ShipmentSummaryPlan {
  return {
    sourceType: SOURCE,
    parserVersion: PARSER,
    maxPages: Math.min(Math.max(Number(maxPages) || 40, 1), 60),
  };
}
function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function lock(tx: Tx, organizationId: string) {
  await tx.$executeRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(${`inventory:${SOURCE}:${organizationId}`}, 0))
  `;
}
async function find(tx: Tx, organizationId: string, id: string) {
  const run = await tx.sourceImportRun.findFirst({
    where: { id, organizationId, sourceType: SOURCE, parserVersion: PARSER },
  });
  if (!run) throw new NotFoundException("SHIPMENT_SUMMARY_ATTEMPT_NOT_FOUND");
  return run;
}
function expired(run: SourceImportRun) {
  return !run.expiresAt || run.expiresAt.getTime() <= Date.now();
}
function fence(run: SourceImportRun, token: string) {
  if (!token || run.attemptToken !== token)
    throw new ConflictException("ATTEMPT_FENCE_LOST");
}
function writable(run: SourceImportRun) {
  if (run.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS)
    throw new ConflictException("ATTEMPT_TERMINAL_CONFLICT");
  if (expired(run)) throw new ConflictException("ATTEMPT_EXPIRED");
}
function control(run: SourceImportRun) {
  return shipmentSummaryAttempt(run);
}
function validateSubmission(
  plan: ShipmentSummaryPlan,
  input: ShipmentSummarySubmission,
) {
  const invalid = () => {
    throw new BadRequestException("SHIPMENT_SUMMARY_EVIDENCE_INVALID");
  };
  const proof = input?.proof;
  if (
    !Array.isArray(input?.items) ||
    input.items.length > 1000 ||
    !proof ||
    proof.maxPages !== plan.maxPages ||
    proof.validatedTable !== true ||
    !Number.isInteger(input.scannedPages) ||
    input.scannedPages < 1 ||
    input.scannedPages > Math.floor(plan.maxPages) ||
    !Number.isInteger(input.totalRows) ||
    input.totalRows < 0 ||
    !Number.isInteger(proof.lastPageRowCount) ||
    proof.lastPageRowCount < 0
  )
    invalid();
  if (
    !Array.isArray(proof.pageRowCounts) ||
    proof.pageRowCounts.length !== input.scannedPages ||
    proof.pageRowCounts.some(
      (count, index) =>
        !Number.isInteger(count) ||
        count < 0 ||
        (index < input.scannedPages - 1 && count < 10),
    ) ||
    proof.pageRowCounts.at(-1) !== proof.lastPageRowCount ||
    proof.pageRowCounts.reduce((sum, count) => sum + count, 0) < input.totalRows
  )
    invalid();
  if (!(
    (proof.stopReason === "empty_page" && proof.lastPageRowCount === 0) ||
    (proof.stopReason === "short_page" &&
      proof.lastPageRowCount > 0 &&
      proof.lastPageRowCount < 10) ||
    (proof.stopReason === "max_pages" &&
      input.scannedPages === Math.floor(plan.maxPages) &&
      proof.lastPageRowCount >= 10)
  ))
    invalid();
  const byDate = new Map<string, ShipmentSummarySubmission["items"][number]>();
  for (const item of input.items) {
    if (
      !item ||
      typeof item.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      !Number.isInteger(item.count) ||
      item.count < 1 ||
      item.count > 1_000_000 ||
      !Number.isInteger(item.boxes) ||
      item.boxes < 0 ||
      item.boxes > 1_000_000
    )
      invalid();
    byDate.set(item.date, {
      date: item.date,
      count: item.count,
      boxes: item.boxes,
    });
  }
  const items = [...byDate.values()].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  if (
    items.reduce((sum, item) => sum + item.count, 0) !== input.totalRows ||
    (items.length === 0 &&
      (input.scannedPages !== 1 || proof.stopReason !== "empty_page"))
  )
    invalid();
  return items;
}
