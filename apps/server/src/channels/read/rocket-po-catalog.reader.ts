import { ConflictException } from "@nestjs/common";
import { Prisma, type SourceImportRun } from "@prisma/client";
import {
  ROCKET_CONFIRMATION_REQUEST_STATUSES,
  RocketPoCollectionEvidenceSchema,
  RocketPoSourcePlanSchema,
  type RocketPoCatalogRow,
  type RocketPoSource,
  type RocketSavedPoSnapshot,
  type RocketSavedPoSummary,
} from "@kiditem/shared/rocket-purchase-preview";
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from "@kiditem/shared/source-import";
import { deriveSourceReadiness } from "@kiditem/shared/source-readiness";
import {
  businessDateKey,
  kstBusinessDate,
  parseBusinessDate,
} from "../../common/kst";
import type { RocketPoCompleteCollection } from "../application/port/in/rocket-po-catalog.port";

export const ROCKET_PO_CATALOG_SOURCE_TYPE = "coupang_rocket_po_catalog";
export const ROCKET_PO_CATALOG_PARSER_VERSION = "rocket-po-v1";

const savedLineSelect = {
  poLineId: true,
  poNumber: true,
  vendorId: true,
  productNo: true,
  barcode: true,
  productName: true,
  orderQty: true,
  plannedDeliveryDate: true,
  poStatusCode: true,
  businessDateBasis: true,
  hasConfirmation: true,
  center: true,
  inboundType: true,
  poStatus: true,
  returnManager: true,
  returnContact: true,
  returnAddress: true,
  purchasePrice: true,
  supplyPrice: true,
  vat: true,
  totalPurchase: true,
  poRegisteredAt: true,
  xdock: true,
} satisfies Prisma.RocketPoCatalogLineSelect;

type RocketPoAttemptRow = Pick<
  SourceImportRun,
  | "id"
  | "channelAccountId"
  | "status"
  | "freshnessGeneration"
  | "plan"
  | "expiresAt"
  | "importedAt"
  | "errorCode"
  | "errorMessage"
>;

/** Channels' one transaction-aware reader for the Rocket PO source ledger. */
export async function readRocketPoSource(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelAccountId: string; now?: Date },
): Promise<RocketPoSource | null> {
  const account = await tx.channelAccount.findFirst({
    where: {
      id: input.channelAccountId,
      organizationId: input.organizationId,
      channel: "rocket",
    },
    select: { id: true },
  });
  if (!account) return null;
  const where = {
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    sourceType: ROCKET_PO_CATALOG_SOURCE_TYPE,
    parserVersion: ROCKET_PO_CATALOG_PARSER_VERSION,
  } as const;
  const [latest, complete] = await Promise.all([
    tx.sourceImportRun.findFirst({
      where,
      orderBy: { freshnessGeneration: "desc" },
    }),
    tx.sourceImportRun.findFirst({
      where: { ...where, status: SOURCE_IMPORT_RUN_COMPLETED_STATUS },
      orderBy: { freshnessGeneration: "desc" },
    }),
  ]);
  const now = input.now ?? new Date();
  const latestAttempt = latest ? publicAttempt(latest, now) : null;
  const latestComplete = complete ? publicAttempt(complete, now) : null;
  const actualCutoff = latestComplete?.actualCutoffAt?.slice(0, 10) ?? null;
  const requiredCutoff = new Date(kstBusinessDate(now).getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    ready: deriveSourceReadiness({
      latestAttempt,
      latestComplete: latestComplete ? { actualCutoff } : null,
      requiredCutoff,
    }).ready,
    latestAttempt,
    latestComplete,
  };
}

export async function readCurrentRocketPos(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    from: string;
    to: string;
    status?: string;
  },
): Promise<RocketSavedPoSummary[]> {
  const current = await tx.sourceImportRun.findFirst({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      sourceType: ROCKET_PO_CATALOG_SOURCE_TYPE,
      status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
      parserVersion: ROCKET_PO_CATALOG_PARSER_VERSION,
    },
    orderBy: { freshnessGeneration: "desc" },
    select: { id: true },
  });
  if (!current) return [];
  const isConfirmationRequest = input.status
    ? ROCKET_CONFIRMATION_REQUEST_STATUSES.some(
        (status) => status === input.status,
      )
    : false;
  const poStatusFilter = input.status
    ? isConfirmationRequest
      ? { in: [...ROCKET_CONFIRMATION_REQUEST_STATUSES] }
      : input.status
    : undefined;
  const snapshot = await tx.rocketPoCatalogSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      sourceImportRunId: current.id,
      sourceImportRun: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
        sourceType: ROCKET_PO_CATALOG_SOURCE_TYPE,
        parserVersion: ROCKET_PO_CATALOG_PARSER_VERSION,
      },
      lines: {
        some: {
          plannedDeliveryDate: { gte: day(input.from), lte: day(input.to) },
          ...(poStatusFilter ? { poStatus: poStatusFilter } : {}),
        },
      },
    },
    select: {
      sourceImportRunId: true,
      vendorId: true,
      createdAt: true,
      sourceImportRun: { select: { importedAt: true } },
      lines: {
        where: {
          plannedDeliveryDate: { gte: day(input.from), lte: day(input.to) },
          ...(poStatusFilter ? { poStatus: poStatusFilter } : {}),
        },
        orderBy: [{ poNumber: "asc" }, { poLineId: "asc" }],
        select: {
          poNumber: true,
          plannedDeliveryDate: true,
          productName: true,
          orderQty: true,
          poStatus: true,
          center: true,
          inboundType: true,
          totalPurchase: true,
          poRegisteredAt: true,
        },
      },
    },
  });
  if (!snapshot) return [];
  const byPoNumber = new Map<string, typeof snapshot.lines>();
  for (const line of snapshot.lines) {
    const lines = byPoNumber.get(line.poNumber) ?? [];
    lines.push(line);
    byPoNumber.set(line.poNumber, lines);
  }
  return [...byPoNumber]
    .map(([poNumber, lines]) => {
      const first = lines[0]!;
      return {
        sourceImportRunId: snapshot.sourceImportRunId,
        poNumber,
        orderedAt: first.poRegisteredAt ?? "",
        plannedDeliveryDate: isoDay(first.plannedDeliveryDate),
        status: first.poStatus ?? "",
        vendorId: snapshot.vendorId,
        centerName: first.center ?? "",
        inboundType: first.inboundType ?? "",
        firstProductName: first.productName,
        skuCount: lines.length,
        orderQuantity: lines.reduce((sum, line) => sum + line.orderQty, 0),
        orderAmount: lines.reduce(
          (sum, line) => sum + (line.totalPurchase ?? 0),
          0,
        ),
        collectedAt: (
          snapshot.sourceImportRun.importedAt ?? snapshot.createdAt
        ).toISOString(),
      };
    })
    .sort(
      (left, right) =>
        left.plannedDeliveryDate.localeCompare(right.plannedDeliveryDate) ||
        left.poNumber.localeCompare(right.poNumber),
    );
}

export async function readRocketPoSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    sourceImportRunId: string;
  },
): Promise<RocketSavedPoSnapshot | null> {
  const snapshot = await tx.rocketPoCatalogSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      sourceImportRunId: input.sourceImportRunId,
      sourceImportRun: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
        sourceType: ROCKET_PO_CATALOG_SOURCE_TYPE,
        parserVersion: ROCKET_PO_CATALOG_PARSER_VERSION,
      },
    },
    select: {
      sourceImportRunId: true,
      channelAccountId: true,
      collectionRunId: true,
      vendorId: true,
      listPagesRead: true,
      totalListPages: true,
      detailPoCount: true,
      sourceImportRun: { select: { qualityReport: true } },
      lines: { orderBy: { poLineId: "asc" }, select: savedLineSelect },
    },
  });
  if (!snapshot) return null;
  return {
    sourceImportRunId: snapshot.sourceImportRunId,
    channelAccountId: snapshot.channelAccountId,
    collection: collectionEvidence(snapshot),
    rows: snapshot.lines.map(toCatalogRow),
  };
}

export async function readRocketPoCompleteCollection(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    sourceImportRunId: string;
  },
): Promise<RocketPoCompleteCollection | null> {
  const run = await tx.sourceImportRun.findFirst({
    where: {
      id: input.sourceImportRunId,
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      sourceType: ROCKET_PO_CATALOG_SOURCE_TYPE,
      parserVersion: ROCKET_PO_CATALOG_PARSER_VERSION,
      status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
    },
  });
  if (!run || !run.importedAt) return null;
  const saved = await readRocketPoSnapshot(tx, input);
  if (!saved) return null;
  return {
    ...saved,
    catalog: {
      sourceImportRunId: run.id,
      channelAccountId: input.channelAccountId,
      generation: String(run.freshnessGeneration),
      actualCutoffAt: run.importedAt.toISOString(),
      rowCount: run.rowCount,
    },
    identities: await resolveIdentities(tx, { ...input, rows: saved.rows }),
  };
}

function collectionEvidence(snapshot: {
  collectionRunId: string;
  vendorId: string;
  listPagesRead: number;
  totalListPages: number;
  detailPoCount: number;
  sourceImportRun: { qualityReport: Prisma.JsonValue | null };
}) {
  const report = objectValue(snapshot.sourceImportRun.qualityReport);
  const parsed = RocketPoCollectionEvidenceSchema.safeParse(report?.collection);
  if (
    parsed.success &&
    parsed.data.collectionRunId === snapshot.collectionRunId
  ) {
    return parsed.data;
  }
  return RocketPoCollectionEvidenceSchema.parse({
    collectionRunId: snapshot.collectionRunId,
    vendorId: snapshot.vendorId,
    listPagesRead: snapshot.listPagesRead,
    totalListPages: snapshot.totalListPages,
    truncated: false,
    detailPoCount: snapshot.detailPoCount,
    failedPoNumbers: [],
  });
}

function toCatalogRow(
  line: Prisma.RocketPoCatalogLineGetPayload<{
    select: typeof savedLineSelect;
  }>,
): RocketPoCatalogRow {
  return {
    poLineId: line.poLineId,
    poNumber: line.poNumber,
    vendorId: line.vendorId,
    productNo: line.productNo,
    barcode: line.barcode,
    productName: line.productName,
    orderQty: line.orderQty,
    plannedDeliveryDate: isoDay(line.plannedDeliveryDate),
    ...(line.poStatusCode !== null && { poStatusCode: line.poStatusCode }),
    ...(line.businessDateBasis !== null && {
      businessDateBasis: line.businessDateBasis as
        "ordered_at" | "expected_inbound",
    }),
    ...(line.hasConfirmation && {
      confirmation: {
        center: requiredSavedValue(line.center, "center"),
        inboundType: requiredSavedValue(line.inboundType, "inboundType"),
        poStatus: requiredSavedValue(line.poStatus, "poStatus"),
        returnManager: requiredSavedValue(line.returnManager, "returnManager"),
        returnContact: requiredSavedValue(line.returnContact, "returnContact"),
        returnAddress: requiredSavedValue(line.returnAddress, "returnAddress"),
        purchasePrice: requiredSavedValue(line.purchasePrice, "purchasePrice"),
        supplyPrice: requiredSavedValue(line.supplyPrice, "supplyPrice"),
        vat: requiredSavedValue(line.vat, "vat"),
        totalPurchase: requiredSavedValue(line.totalPurchase, "totalPurchase"),
        poRegisteredAt: requiredSavedValue(
          line.poRegisteredAt,
          "poRegisteredAt",
        ),
        xdock: requiredSavedValue(line.xdock, "xdock"),
      },
    }),
  };
}

async function resolveIdentities(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    rows: RocketPoCatalogRow[];
  },
) {
  const productNos = [...new Set(input.rows.map(({ productNo }) => productNo))];
  if (productNos.length === 0) return [];
  const listings = await tx.channelListing.findMany({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      externalId: { in: productNos },
    },
    select: { id: true },
  });
  const options = await tx.channelListingOption.findMany({
    where: {
      organizationId: input.organizationId,
      listingId: { in: listings.map(({ id }) => id) },
      externalOptionId: { in: productNos },
    },
    select: { id: true, externalOptionId: true },
  });
  const optionByExternalId = new Map(
    options.map((option) => [option.externalOptionId, option.id]),
  );
  return input.rows.map((row) => {
    const channelSkuId = optionByExternalId.get(row.productNo);
    if (!channelSkuId) {
      throw new ConflictException(
        `Rocket identity ${row.productNo} was not persisted`,
      );
    }
    return { poLineId: row.poLineId, channelSkuId };
  });
}

function publicAttempt(run: RocketPoAttemptRow, now: Date) {
  const isExpired =
    run.status === "running" &&
    (!run.expiresAt || run.expiresAt.getTime() <= now.getTime());
  return {
    attemptId: run.id,
    channelAccountId: run.channelAccountId!,
    state:
      isExpired || run.status === "failed"
        ? ("FAILED" as const)
        : run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
          ? ("COMPLETE" as const)
          : ("RUNNING" as const),
    generation: String(run.freshnessGeneration),
    plan: RocketPoSourcePlanSchema.parse(run.plan),
    expiresAt: run.expiresAt!.toISOString(),
    actualCutoffAt: run.importedAt?.toISOString() ?? null,
    errorCode: isExpired ? "ATTEMPT_EXPIRED" : run.errorCode,
    errorMessage: isExpired
      ? "로켓 PO 수집 시간이 만료되었습니다. 다시 수집해주세요."
      : run.errorMessage,
  };
}

function requiredSavedValue<T>(value: T | null, field: string): T {
  if (value === null) {
    throw new ConflictException(
      `Saved Rocket PO confirmation is missing ${field}`,
    );
  }
  return value;
}

function objectValue(
  value: Prisma.JsonValue | null,
): Record<string, Prisma.JsonValue> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
}

function day(value: string): Date {
  const parsed = parseBusinessDate(value);
  if (!parsed) throw new Error(`Invalid business date: ${value}`);
  return parsed;
}

function isoDay(value: Date): string {
  return businessDateKey(value);
}
