import { Prisma, type SourceImportRun } from "@prisma/client";
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from "@kiditem/shared/source-import";

import {
  COUPANG_SHIPMENT_SUMMARY_SOURCE_TYPE,
  COUPANG_SHIPMENT_SUMMARY_PARSER_VERSION,
  CoupangShipmentDateSummaryEntry,
  ShipmentSummaryPlan,
  ShipmentSummaryAttempt,
  ShipmentSummarySource,
  ShipmentSummaryAttemptRead
} from "../domain/shipment-summary";

type Tx = Prisma.TransactionClient;

/** Orders’ transaction-aware reader for the shipment-date source ledger. */
export async function readCoupangShipmentSummarySource(
  tx: Tx,
  input: { organizationId: string; requestFingerprint: string },
): Promise<ShipmentSummarySource> {
  const latest = await tx.sourceImportRun.findFirst({
    where: sourceWhere(input.organizationId),
    orderBy: { freshnessGeneration: "desc" },
  });
  const complete = await readLatestComplete(tx, input.organizationId);
  return {
    ready:
      !!complete && input.requestFingerprint === complete.requestFingerprint,
    latestAttempt: latest ? publicShipmentSummaryAttempt(latest) : null,
    latestComplete: complete ? publicShipmentSummaryAttempt(complete) : null,
    capturedItems: complete
      ? await readCapturedShipmentDates(tx, input.organizationId, complete.id)
      : [],
    items: await readShipmentDateCalendar(
      tx,
      input.organizationId,
      complete?.freshnessGeneration ?? null,
    ),
  };
}

export async function readCoupangShipmentSummaryAttempt(
  tx: Tx,
  input: { organizationId: string; attemptId: string },
): Promise<ShipmentSummaryAttemptRead | null> {
  const run = await tx.sourceImportRun.findFirst({
    where: {
      id: input.attemptId,
      ...sourceWhere(input.organizationId),
    },
  });
  if (!run) return null;
  const complete = await readLatestComplete(
    tx,
    input.organizationId,
    run.freshnessGeneration,
  );
  return {
    ...shipmentSummaryAttempt(run),
    capturedItems:
      run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
        ? await readCapturedShipmentDates(tx, input.organizationId, run.id)
        : [],
    items: await readShipmentDateCalendar(
      tx,
      input.organizationId,
      complete?.freshnessGeneration ?? null,
    ),
  };
}

export function shipmentSummaryAttempt(
  run: SourceImportRun,
): ShipmentSummaryAttempt {
  const isExpired =
    run.status === SOURCE_IMPORT_RUN_RUNNING_STATUS &&
    (!run.expiresAt || run.expiresAt.getTime() <= Date.now());
  return {
    attemptId: run.id,
    attemptToken: run.attemptToken,
    generation: String(run.freshnessGeneration),
    state:
      isExpired || run.status === SOURCE_IMPORT_RUN_FAILED_STATUS
        ? "FAILED"
        : run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
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

/** The attempt as a page reads it: the fence token stays with the extension's control reads. */
export function publicShipmentSummaryAttempt(
  run: SourceImportRun,
): Omit<ShipmentSummaryAttempt, "attemptToken"> {
  const { attemptToken: _token, ...attempt } = shipmentSummaryAttempt(run);
  return attempt;
}

function sourceWhere(organizationId: string) {
  return {
    organizationId,
    sourceType: COUPANG_SHIPMENT_SUMMARY_SOURCE_TYPE,
    parserVersion: COUPANG_SHIPMENT_SUMMARY_PARSER_VERSION,
  } as const;
}

function readLatestComplete(
  tx: Tx,
  organizationId: string,
  through?: bigint | null,
) {
  return tx.sourceImportRun.findFirst({
    where: {
      ...sourceWhere(organizationId),
      status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
      ...(through != null ? { freshnessGeneration: { lte: through } } : {}),
    },
    orderBy: { freshnessGeneration: "desc" },
  });
}

async function readCapturedShipmentDates(
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
        sourceType: COUPANG_SHIPMENT_SUMMARY_SOURCE_TYPE,
        parserVersion: COUPANG_SHIPMENT_SUMMARY_PARSER_VERSION,
        status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
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

async function readShipmentDateCalendar(
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
       (r.source_type = ${COUPANG_SHIPMENT_SUMMARY_SOURCE_TYPE}
        AND r.parser_version = ${COUPANG_SHIPMENT_SUMMARY_PARSER_VERSION}
        AND r.status = ${SOURCE_IMPORT_RUN_COMPLETED_STATUS}
        AND r.freshness_generation <= ${through}::bigint))
    ORDER BY d.shipment_date DESC, r.freshness_generation DESC NULLS LAST
  `;
  return rows.map((row) => ({
    date: row.shipment_date,
    count: row.source_import_run_id === null ? null : row.count,
    boxes: row.source_import_run_id === null ? null : row.boxes,
    capturedAt: row.captured_at.toISOString(),
    verified: row.source_import_run_id !== null,
  }));
}
