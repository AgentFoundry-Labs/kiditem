import type { Prisma } from "@prisma/client";
import {
  CoupangDirectOrderCollectionRequestSchema,
  type CoupangDirectOrderCollectionRequest,
} from "@kiditem/shared/coupang-direct-order";
import { canonicalOwnerInputHash } from "../../../apps/server/src/common/owner-idempotency-key";
import { canonicalCoupangDirectOrderHash } from "../../../apps/server/src/orders/mapper/coupang-direct-order.mapper";
import type { DataMigration, MigrationResult } from "../types";

const DIRECT_SOURCE_TYPE = "coupang_direct_order_capture";
const LEGACY_DIRECT_SOURCE_TYPE = "coupang_rocket_final_order";
const DIRECT_EFFECT_SOURCE_TYPES = [
  DIRECT_SOURCE_TYPE,
  LEGACY_DIRECT_SOURCE_TYPE,
] as const;
const TRANSPORTS = ["SHIPMENT", "MILKRUN"] as const;

type Transport = (typeof TRANSPORTS)[number];
type LineRef = { poNumber: string; productNo: string };
type StoredCapture = Omit<CoupangDirectOrderCollectionRequest, "transport">;
type LegacyReceipt = {
  transport: Transport;
  payloadChecksum: string;
  sourceImportRunId: string;
  exportId: string | null;
  transmissionIntentKey: string | null;
  matchedLineCount: number;
  reconciledRows: number;
  collectedLines: LineRef[];
  matchedLines: LineRef[];
  unmatchedLines: LineRef[];
};

export async function backfillCoupangDirectTransportReceipts(
  tx: Prisma.TransactionClient,
): Promise<MigrationResult> {
  const sourceRuns = await tx.sourceImportRun.findMany({
    where: {
      sourceType: DIRECT_SOURCE_TYPE,
      status: "completed",
    },
    select: {
      id: true,
      organizationId: true,
      channelAccountId: true,
      qualityReport: true,
      orderCollectionArtifact: { select: { sourceBytes: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let legacySourceRows = 0;
  let legacyReceiptRows = 0;
  let createdReceiptRows = 0;
  let createdConsumptionRows = 0;

  for (const sourceRun of sourceRuns) {
    const report = objectValue(sourceRun.qualityReport);
    if (!report || !hasOwn(report, "transportRefs")) continue;
    legacySourceRows += 1;
    if (!sourceRun.channelAccountId) {
      throw migrationError(sourceRun.id, "channelAccountId is missing");
    }
    const refs = requiredObject(
      report.transportRefs,
      sourceRun.id,
      "transportRefs",
    );
    const selections = requiredObject(
      report.transportSelections,
      sourceRun.id,
      "transportSelections",
    );
    assertTransportKeys(refs, selections, sourceRun.id);
    const capture = parseCaptureArtifact(
      sourceRun.orderCollectionArtifact,
      sourceRun.id,
    );
    if (capture.channelAccountId !== sourceRun.channelAccountId) {
      throw migrationError(
        sourceRun.id,
        "capture artifact channel account does not match source",
      );
    }

    for (const transport of TRANSPORTS) {
      if (!hasOwn(refs, transport)) continue;
      legacyReceiptRows += 1;
      const receipt = parseLegacyReceipt(
        refs[transport],
        sourceRun.id,
        transport,
      );
      const selectedPurchaseOrderKeys = parseSelection(
        selections[transport],
        sourceRun.id,
        transport,
      );
      const payloadChecksum = normalizedPayloadChecksum(
        capture,
        selectedPurchaseOrderKeys,
        sourceRun.id,
        transport,
      );
      const effectSource = await tx.sourceImportRun.findFirst({
        where: {
          id: receipt.sourceImportRunId,
          organizationId: sourceRun.organizationId,
          channelAccountId: sourceRun.channelAccountId,
          sourceType: { in: [...DIRECT_EFFECT_SOURCE_TYPES] },
          status: "completed",
        },
        select: { id: true },
      });
      if (!effectSource) {
        throw migrationError(
          sourceRun.id,
          `${transport} effect source is not a completed direct source for the same organization and channel account`,
        );
      }
      if (receipt.exportId) {
        const confirmation = await tx.rocketPurchaseConfirmation.findFirst({
          where: {
            id: receipt.exportId,
            organizationId: sourceRun.organizationId,
            channelAccountId: sourceRun.channelAccountId,
          },
          select: { id: true },
        });
        if (!confirmation) {
          throw migrationError(
            sourceRun.id,
            `${transport} Rocket confirmation is missing, cross-organization, or belongs to a different channel account`,
          );
        }
        const transmission =
          await tx.rocketPurchaseConfirmationTransmission.findFirst({
            where: {
              organizationId: sourceRun.organizationId,
              confirmationId: receipt.exportId,
              sourceImportRunId: receipt.sourceImportRunId,
              transport,
              intentKey: receipt.transmissionIntentKey,
            },
            select: { id: true },
          });
        if (!transmission) {
          throw migrationError(
            sourceRun.id,
            `${transport} Rocket confirmation transmission does not match receipt lineage`,
          );
        }
      }

      let canonical = await tx.coupangDirectTransportReceipt.findUnique({
        where: {
          organizationId_channelAccountId_transport_payloadChecksum: {
            organizationId: sourceRun.organizationId,
            channelAccountId: sourceRun.channelAccountId,
            transport,
            payloadChecksum,
          },
        },
      });
      const intentOwner = receipt.transmissionIntentKey
        ? await tx.coupangDirectTransportReceipt.findFirst({
            where: {
              organizationId: sourceRun.organizationId,
              transmissionIntentKey: receipt.transmissionIntentKey,
            },
            select: { id: true },
          })
        : null;
      if (intentOwner && intentOwner.id !== canonical?.id) {
        throw migrationError(
          sourceRun.id,
          `${transport} transmission intent belongs to a different receipt`,
        );
      }
      if (canonical) {
        assertCanonicalReceiptMatches(canonical, receipt, sourceRun.id);
      } else {
        canonical = await tx.coupangDirectTransportReceipt.create({
          data: {
            organizationId: sourceRun.organizationId,
            channelAccountId: sourceRun.channelAccountId,
            effectSourceImportRunId: receipt.sourceImportRunId,
            rocketPurchaseConfirmationId: receipt.exportId,
            transport,
            payloadChecksum,
            transmissionIntentKey: receipt.transmissionIntentKey,
            matchedLineCount: receipt.matchedLineCount,
            reconciledRows: receipt.reconciledRows,
            collectedLines: receipt.collectedLines,
            matchedLines: receipt.matchedLines,
            unmatchedLines: receipt.unmatchedLines,
          },
        });
        createdReceiptRows += 1;
      }

      const existingConsumption =
        await tx.coupangDirectTransportConsumption.findUnique({
          where: {
            organizationId_sourceImportRunId_transport: {
              organizationId: sourceRun.organizationId,
              sourceImportRunId: sourceRun.id,
              transport,
            },
          },
        });
      if (existingConsumption) {
        if (
          existingConsumption.receiptId !== canonical.id ||
          !sameStrings(
            existingConsumption.selectedPurchaseOrderKeys,
            selectedPurchaseOrderKeys,
          )
        ) {
          throw migrationError(
            sourceRun.id,
            `${transport} consumption conflicts with legacy receipt lineage`,
          );
        }
      } else {
        await tx.coupangDirectTransportConsumption.create({
          data: {
            organizationId: sourceRun.organizationId,
            sourceImportRunId: sourceRun.id,
            receiptId: canonical.id,
            transport,
            selectedPurchaseOrderKeys,
          },
        });
        createdConsumptionRows += 1;
      }
    }
  }

  return {
    affectedRows: createdReceiptRows + createdConsumptionRows,
    details: {
      legacySourceRows,
      legacyReceiptRows,
      createdReceiptRows,
      createdConsumptionRows,
    },
  };
}

export const backfillCoupangDirectTransportReceiptsMigration: DataMigration = {
  id: "v0.1.31:006_backfill_coupang_direct_transport_receipts",
  releaseVersion: "0.1.31",
  name: "Backfill Coupang direct transport receipts",
  phase: "post-schema",
  run: backfillCoupangDirectTransportReceipts,
};

function parseLegacyReceipt(
  value: unknown,
  sourceRunId: string,
  transport: Transport,
): LegacyReceipt {
  const receipt = requiredObject(value, sourceRunId, `${transport} receipt`);
  const exportId = nullableString(receipt.exportId);
  const transmissionIntentKey = nullableString(receipt.transmissionIntentKey);
  const matchedLineCount = nonNegativeInteger(receipt.matchedLineCount);
  const reconciledRows = nonNegativeInteger(receipt.reconciledRows);
  if (
    receipt.transport !== transport ||
    !hexChecksum(receipt.payloadChecksum) ||
    typeof receipt.sourceImportRunId !== "string" ||
    exportId === undefined ||
    transmissionIntentKey === undefined ||
    (transmissionIntentKey?.length ?? 0) > 500 ||
    matchedLineCount === undefined ||
    reconciledRows === undefined
  ) {
    throw migrationError(sourceRunId, `${transport} receipt is invalid`);
  }
  return {
    transport,
    payloadChecksum: receipt.payloadChecksum,
    sourceImportRunId: receipt.sourceImportRunId,
    exportId,
    transmissionIntentKey,
    matchedLineCount,
    reconciledRows,
    collectedLines: parseLineRefs(
      receipt.collectedLines,
      sourceRunId,
      transport,
    ),
    matchedLines: parseLineRefs(receipt.matchedLines, sourceRunId, transport),
    unmatchedLines: parseLineRefs(
      receipt.unmatchedLines,
      sourceRunId,
      transport,
    ),
  };
}

function assertTransportKeys(
  refs: Record<string, unknown>,
  selections: Record<string, unknown>,
  sourceRunId: string,
): void {
  const refKeys = Object.keys(refs).sort();
  const selectionKeys = Object.keys(selections).sort();
  if (
    refKeys.some((key) => !TRANSPORTS.includes(key as Transport)) ||
    !sameStrings(refKeys, selectionKeys)
  ) {
    throw migrationError(
      sourceRunId,
      "transport receipt and selection keys are unsupported or incomplete",
    );
  }
}

function parseSelection(
  value: unknown,
  sourceRunId: string,
  transport: Transport,
): string[] {
  if (!Array.isArray(value) || !value.every(hexChecksum)) {
    throw migrationError(sourceRunId, `${transport} selection is invalid`);
  }
  return value;
}

function parseCaptureArtifact(
  artifact: { sourceBytes: Uint8Array } | null,
  sourceRunId: string,
): StoredCapture {
  if (!artifact) {
    throw migrationError(sourceRunId, "capture artifact is missing");
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(artifact.sourceBytes).toString("utf8"));
  } catch {
    throw migrationError(sourceRunId, "capture artifact is invalid");
  }
  const object = objectValue(value);
  if (!object) {
    throw migrationError(sourceRunId, "capture artifact is invalid");
  }
  const parsed = CoupangDirectOrderCollectionRequestSchema.safeParse({
    ...object,
    transport: "SHIPMENT",
  });
  if (!parsed.success) {
    throw migrationError(sourceRunId, "capture artifact is invalid");
  }
  const { transport: _transport, ...capture } = parsed.data;
  return capture;
}

function normalizedPayloadChecksum(
  capture: StoredCapture,
  selectedPurchaseOrderKeys: string[],
  sourceRunId: string,
  transport: Transport,
): string {
  const purchaseOrdersByKey = new Map(
    capture.pos.map((purchaseOrder) => [
      canonicalOwnerInputHash(purchaseOrder),
      purchaseOrder,
    ]),
  );
  if (selectedPurchaseOrderKeys.some((key) => !purchaseOrdersByKey.has(key))) {
    throw migrationError(
      sourceRunId,
      `${transport} selection is not present in capture artifact`,
    );
  }
  const purchaseOrders = capture.pos.filter(
    (purchaseOrder) =>
      purchaseOrder.transport === transport && purchaseOrder.items.length > 0,
  );
  const expectedKeys = purchaseOrders.map(canonicalOwnerInputHash).sort();
  const selectedTransportKeys = selectedPurchaseOrderKeys
    .filter((key) => purchaseOrdersByKey.get(key)?.transport === transport)
    .sort();
  if (!sameStrings(expectedKeys, selectedTransportKeys)) {
    throw migrationError(
      sourceRunId,
      `${transport} selection does not match capture artifact`,
    );
  }
  return canonicalCoupangDirectOrderHash({
    ...capture,
    pos: purchaseOrders,
    transport,
  });
}

function parseLineRefs(
  value: unknown,
  sourceRunId: string,
  transport: Transport,
): LineRef[] {
  if (!Array.isArray(value)) {
    throw migrationError(
      sourceRunId,
      `${transport} line references are invalid`,
    );
  }
  return value.map((entry) => {
    const line = objectValue(entry);
    if (
      !line ||
      typeof line.poNumber !== "string" ||
      typeof line.productNo !== "string"
    ) {
      throw migrationError(
        sourceRunId,
        `${transport} line references are invalid`,
      );
    }
    return { poNumber: line.poNumber, productNo: line.productNo };
  });
}

function assertCanonicalReceiptMatches(
  canonical: Prisma.CoupangDirectTransportReceiptGetPayload<{}>,
  receipt: LegacyReceipt,
  sourceRunId: string,
): void {
  if (
    canonical.effectSourceImportRunId !== receipt.sourceImportRunId ||
    canonical.rocketPurchaseConfirmationId !== receipt.exportId ||
    canonical.transmissionIntentKey !== receipt.transmissionIntentKey ||
    canonical.matchedLineCount !== receipt.matchedLineCount ||
    canonical.reconciledRows !== receipt.reconciledRows ||
    JSON.stringify(canonical.collectedLines) !==
      JSON.stringify(receipt.collectedLines) ||
    JSON.stringify(canonical.matchedLines) !==
      JSON.stringify(receipt.matchedLines) ||
    JSON.stringify(canonical.unmatchedLines) !==
      JSON.stringify(receipt.unmatchedLines)
  ) {
    throw migrationError(
      sourceRunId,
      `${receipt.transport} receipt conflicts with its canonical dedupe row`,
    );
  }
}

function requiredObject(
  value: unknown,
  sourceRunId: string,
  field: string,
): Record<string, unknown> {
  const object = objectValue(value);
  if (!object) throw migrationError(sourceRunId, `${field} is invalid`);
  return object;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function hexChecksum(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function migrationError(sourceRunId: string, message: string): Error {
  return new Error(
    `Coupang direct receipt backfill blocked for source run ${sourceRunId}: ${message}.`,
  );
}
