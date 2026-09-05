import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type SourceImportRun } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { SourceFailureAlerts } from "../../../../alerts/alerts.service";
import type { CoupangShipmentDateSummaryRepositoryPort } from "../../../application/port/out/repository/coupang-shipment-date-summary.repository.port";
import type {
  CoupangShipmentDateSummaryEntry,
  ShipmentSummaryAttempt,
  ShipmentSummaryPlan,
  ShipmentSummarySource,
  ShipmentSummarySubmission,
} from "../../../application/port/in/fulfillment";

const SOURCE = "coupang_shipment_summary";
const ALERT = "inventory:coupang_shipment_summary";
const PARSER = "shipment-summary-v1";
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
        where: { organizationId, sourceType: SOURCE, idempotencyKey },
      });
      if (prior && prior.requestFingerprint !== fingerprint)
        throw new ConflictException("SOURCE_IDEMPOTENCY_KEY_REUSED");
      const running = await tx.sourceImportRun.findFirst({
        where: { organizationId, sourceType: SOURCE, status: "running" },
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
        where: { organizationId, sourceType: SOURCE },
        _max: { freshnessGeneration: true },
      });
      const run = await tx.sourceImportRun.create({
        data: {
          organizationId,
          sourceType: SOURCE,
          status: "running",
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

  async readSummarySource(
    organizationId: string,
    maxPages?: number,
  ): Promise<ShipmentSummarySource> {
    return this.prisma.$transaction(
      async (tx) => {
        const latest = await tx.sourceImportRun.findFirst({
          where: { organizationId, sourceType: SOURCE },
          orderBy: { freshnessGeneration: "desc" },
        });
        const complete = await latestComplete(tx, organizationId);
        const latestView = latest ? publicControl(latest) : null;
        return {
          status: !complete
            ? "MISSING"
            : latestView?.state === "FAILED" ||
                checksum(makePlan(maxPages)) !== complete.requestFingerprint
              ? "STALE"
              : "READY",
          refreshing: latestView?.state === "RUNNING",
          latestAttempt: latestView,
          latestComplete: complete ? publicControl(complete) : null,
          capturedItems: complete
            ? await captured(tx, organizationId, complete.id)
            : [],
          items: await calendar(
            tx,
            organizationId,
            complete?.freshnessGeneration ?? null,
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readSummaryAttempt(organizationId: string, attemptId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const run = await find(tx, organizationId, attemptId);
        const complete = await latestComplete(
          tx,
          organizationId,
          run.freshnessGeneration,
        );
        return {
          ...control(run),
          capturedItems:
            run.status === "complete"
              ? await captured(tx, organizationId, run.id)
              : [],
          items: await calendar(
            tx,
            organizationId,
            complete?.freshnessGeneration ?? null,
          ),
        };
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
      if (run.status === "complete" && run.contentChecksum === hash)
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
          status: "complete",
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
        run.status === "failed" &&
        run.errorCode === code &&
        run.errorMessage === message
      )
        return control(run);
      writable(run);
      return control(await this.fail(tx, run, code, message));
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
      data: { status: "failed", errorCode: code, errorMessage: message },
    });
    await this.alerts.upsertSourceFailure(tx, {
      organizationId: run.organizationId,
      dedupeKey: ALERT,
      attemptId: run.id,
      sourceType: SOURCE,
      severity: "error",
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
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory:${SOURCE}:${organizationId}`}, 0))`;
}
async function find(tx: Tx, organizationId: string, id: string) {
  const run = await tx.sourceImportRun.findFirst({
    where: { id, organizationId, sourceType: SOURCE },
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
  if (run.status !== "running")
    throw new ConflictException("ATTEMPT_TERMINAL_CONFLICT");
  if (expired(run)) throw new ConflictException("ATTEMPT_EXPIRED");
}
function control(run: SourceImportRun): ShipmentSummaryAttempt {
  const isExpired = run.status === "running" && expired(run);
  return {
    attemptId: run.id,
    attemptToken: run.attemptToken,
    generation: String(run.freshnessGeneration),
    state:
      isExpired || run.status === "failed"
        ? "FAILED"
        : run.status === "complete"
          ? "COMPLETE"
          : "RUNNING",
    plan: run.plan as unknown as ShipmentSummaryPlan,
    expiresAt: run.expiresAt!.toISOString(),
    actualCutoffAt: run.importedAt?.toISOString() ?? null,
    errorCode: isExpired ? "ATTEMPT_EXPIRED" : run.errorCode,
    errorMessage: isExpired
      ? "쉽먼트 조회 시간이 만료되었습니다. 다시 조회해주세요."
      : run.errorMessage,
  };
}
function publicControl(run: SourceImportRun) {
  const { attemptToken: _token, ...view } = control(run);
  return view;
}
function latestComplete(
  tx: Tx,
  organizationId: string,
  through?: bigint | null,
) {
  return tx.sourceImportRun.findFirst({
    where: {
      organizationId,
      sourceType: SOURCE,
      status: "complete",
      ...(through != null ? { freshnessGeneration: { lte: through } } : {}),
    },
    orderBy: { freshnessGeneration: "desc" },
  });
}
async function captured(
  tx: Tx,
  organizationId: string,
  sourceImportRunId: string,
): Promise<CoupangShipmentDateSummaryEntry[]> {
  const rows = await tx.coupangShipmentDateSummary.findMany({
    where: {
      organizationId,
      sourceImportRunId,
      sourceImportRun: {
        organizationId,
        sourceType: SOURCE,
        status: "complete",
      },
    },
    orderBy: { shipmentDate: "desc" },
  });
  return rows.map((row) => ({
    date: row.shipmentDate,
    count: row.count,
    boxes: row.boxes,
    capturedAt: row.capturedAt.toISOString(),
    verified: true,
  }));
}
async function calendar(
  tx: Tx,
  organizationId: string,
  through: bigint | null,
): Promise<CoupangShipmentDateSummaryEntry[]> {
  const rows = await tx.$queryRaw<
    Array<{
      shipment_date: string;
      count: number;
      boxes: number;
      captured_at: Date;
      source_import_run_id: string | null;
    }>
  >`
    SELECT DISTINCT ON (d.shipment_date) d.shipment_date, d.count, d.boxes, d.captured_at, d.source_import_run_id
    FROM coupang_shipment_date_summaries d
    LEFT JOIN source_import_runs r ON r.id = d.source_import_run_id AND r.organization_id = d.organization_id
    WHERE d.organization_id = ${organizationId}::uuid AND
      (d.source_import_run_id IS NULL OR
       (r.source_type = ${SOURCE} AND r.status = 'complete' AND r.freshness_generation <= ${through}::bigint))
    ORDER BY d.shipment_date DESC, r.freshness_generation DESC NULLS LAST
  `;
  return rows.map((row) => ({
    date: row.shipment_date,
    count: row.count,
    boxes: row.boxes,
    capturedAt: row.captured_at.toISOString(),
    verified: row.source_import_run_id !== null,
  }));
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
