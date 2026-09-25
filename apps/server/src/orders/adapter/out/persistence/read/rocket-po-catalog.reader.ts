import type { Prisma } from "@prisma/client";
import {
  ROCKET_CONFIRMATION_REQUEST_STATUSES,
  RocketPoCollectionEvidenceSchema,
  type RocketPoCatalogRow,
  type RocketSavedPoSnapshot,
  type RocketSavedPoSummary,
} from "@kiditem/shared/rocket-purchase-preview";
import { businessDateKey, parseBusinessDate } from "../../../../../common/kst";
import type { ChannelListingQueryPort } from '../../../../../channels/application/port/in/listing/channel-listing-query.port';
import { ownerTransaction } from '../../../../../prisma/owner-transaction';
import { FactConflictError } from "../../../../../common/errors/fact-errors";
import type { RocketPoCompleteCollection } from '../../../../application/port/in/rocket-po-catalog.port';

/**
 * Orders' transaction-aware reader for the Rocket PO ledger (KID-359). A snapshot with `operationId` exists only
 * for a succeeded `orders.coupang_rocket_po` operation (it is written inside the finish transaction), so the
 * account's current collection is its newest such snapshot. Old attempt snapshots (`sourceImportRunId`) are not
 * read (ADR-0025: old rows are not migrated).
 */
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
  const current = await tx.rocketPoCatalogSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      operationId: { not: null },
    },
    orderBy: { createdAt: "desc" },
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
      id: current.id,
      organizationId: input.organizationId,
      lines: {
        some: {
          plannedDeliveryDate: { gte: day(input.from), lte: day(input.to) },
          ...(poStatusFilter ? { poStatus: poStatusFilter } : {}),
        },
      },
    },
    select: {
      operationId: true,
      vendorId: true,
      createdAt: true,
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
        rocketPoOperationId: snapshot.operationId!,
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
        orderAmount: sumConfirmedTotals(lines),
        collectedAt: snapshot.createdAt.toISOString(),
      } satisfies RocketSavedPoSummary;
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
    rocketPoOperationId: string;
  },
): Promise<RocketSavedPoSnapshot | null> {
  const saved = await readPublishedSnapshot(tx, input);
  if (!saved) return null;
  return {
    rocketPoOperationId: input.rocketPoOperationId,
    channelAccountId: saved.channelAccountId,
    collection: collectionEvidence(saved),
    rows: saved.lines.map(toCatalogRow),
  };
}

/** 그 계정의 발행된 수집인가(호출자 트랜잭션 안, Supply 워크북 확정의 펜스). */
export async function rocketPoSnapshotExists(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelAccountId: string; rocketPoOperationId: string },
): Promise<boolean> {
  const found = await tx.rocketPoCatalogSnapshot.findFirst({
    where: { organizationId: input.organizationId, channelAccountId: input.channelAccountId, operationId: input.rocketPoOperationId },
    select: { id: true },
  });
  return found !== null;
}

export async function readRocketPoCompleteCollection(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    rocketPoOperationId: string;
  },
  listings: Pick<ChannelListingQueryPort, 'readExternalIdentities'>,
): Promise<RocketPoCompleteCollection | null> {
  const saved = await readPublishedSnapshot(tx, input);
  if (!saved) return null;
  const rows = saved.lines.map(toCatalogRow);
  return {
    rocketPoOperationId: input.rocketPoOperationId,
    channelAccountId: saved.channelAccountId,
    collection: collectionEvidence(saved),
    rows,
    catalog: {
      rocketPoOperationId: input.rocketPoOperationId,
      channelAccountId: input.channelAccountId,
      actualCutoffAt: saved.createdAt.toISOString(),
      rowCount: rows.length,
    },
    identities: await resolveIdentities(tx, { ...input, rows }, listings),
  };
}

function readPublishedSnapshot(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelAccountId: string; rocketPoOperationId: string },
) {
  return tx.rocketPoCatalogSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      operationId: input.rocketPoOperationId,
    },
    select: {
      channelAccountId: true,
      collectionRunId: true,
      vendorId: true,
      listPagesRead: true,
      totalListPages: true,
      detailPoCount: true,
      createdAt: true,
      lines: { orderBy: { poLineId: "asc" }, select: savedLineSelect },
    },
  });
}

function collectionEvidence(snapshot: {
  collectionRunId: string;
  vendorId: string;
  listPagesRead: number;
  totalListPages: number;
  detailPoCount: number;
}) {
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

type SavedLine = Prisma.RocketPoCatalogLineGetPayload<{
  select: typeof savedLineSelect;
}>;

const SAVED_CONFIRMATION_FIELDS = [
  "center",
  "inboundType",
  "poStatus",
  "returnManager",
  "returnContact",
  "returnAddress",
  "purchasePrice",
  "supplyPrice",
  "vat",
  "totalPurchase",
  "poRegisteredAt",
  "xdock",
] as const;

/**
 * A line has a provider confirmation when its confirmation columns were
 * stored. Publication stores all of them or none, so a partial set fails
 * closed in `requiredSavedValue` rather than reopening without a confirmation.
 */
function hasSavedConfirmation(line: SavedLine): boolean {
  return SAVED_CONFIRMATION_FIELDS.some((field) => line[field] !== null);
}

function toCatalogRow(line: SavedLine): RocketPoCatalogRow {
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
    ...(hasSavedConfirmation(line) && {
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
  listings: Pick<ChannelListingQueryPort, 'readExternalIdentities'>,
) {
  const productNos = [...new Set(input.rows.map(({ productNo }) => productNo))];
  if (productNos.length === 0) return [];
  const identities = await listings.readExternalIdentities(ownerTransaction(tx), {
    organizationId: input.organizationId, accountId: input.channelAccountId,
    listingExternalIds: productNos, optionExternalIds: productNos, activeOnly: false,
  });
  const optionByExternalId = new Map(identities.flatMap((identity) =>
    identity.optionId && identity.externalOptionId ? [[identity.externalOptionId, identity.optionId]] : []));
  return input.rows.map((row) => {
    const channelSkuId = optionByExternalId.get(row.productNo);
    if (!channelSkuId) {
      throw new FactConflictError(
        `Rocket identity ${row.productNo} was not persisted`,
      );
    }
    return { poLineId: row.poLineId, channelSkuId };
  });
}

function requiredSavedValue<T>(value: T | null, field: string): T {
  if (value === null) {
    throw new FactConflictError(
      `Saved Rocket PO confirmation is missing ${field}`,
    );
  }
  return value;
}

function day(value: string): Date {
  const parsed = parseBusinessDate(value);
  if (!parsed) throw new Error(`Invalid business date: ${value}`);
  return parsed;
}

function isoDay(value: Date): string {
  return businessDateKey(value);
}

/**
 * A PO amount is the sum of provider-confirmed line totals. A line collected
 * without its confirmation has no total, so the amount is unknown rather than
 * the sum of the confirmed lines.
 */
function sumConfirmedTotals(
  lines: ReadonlyArray<{ totalPurchase: number | null }>,
): number | null {
  let total = 0;
  for (const { totalPurchase } of lines) {
    if (totalPurchase === null) return null;
    total += totalPurchase;
  }
  return total;
}
