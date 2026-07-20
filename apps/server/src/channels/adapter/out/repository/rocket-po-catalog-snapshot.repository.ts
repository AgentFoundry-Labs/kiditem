import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  RocketPoCatalogRow,
  RocketSavedPoCollection,
  RocketSavedPoSummary,
} from '@kiditem/shared/rocket-purchase-preview';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { RocketPoCatalogRepositoryPort } from '../../../application/port/out/repository/rocket-po-catalog.repository.port';

export const ROCKET_PO_CATALOG_SOURCE_TYPE = 'coupang_rocket_po_catalog';

type PublishInput = Parameters<RocketPoCatalogRepositoryPort['publish']>[0];

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

export async function ensureRocketPoCatalogSnapshot(
  tx: Prisma.TransactionClient,
  input: PublishInput,
  sourceImportRunId: string,
): Promise<void> {
  const existing = await tx.rocketPoCatalogSnapshot.findFirst({
    where: { sourceImportRunId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (existing) return;
  const snapshot = await tx.rocketPoCatalogSnapshot.create({
    data: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      sourceImportRunId,
      collectionRunId: input.collection.collectionRunId,
      vendorId: input.collection.vendorId,
      listPagesRead: input.collection.listPagesRead,
      totalListPages: input.collection.totalListPages,
      detailPoCount: input.collection.detailPoCount,
    },
    select: { id: true },
  });
  await tx.rocketPoCatalogLine.createMany({
    data: input.rows.map((row) => ({
      organizationId: input.organizationId,
      snapshotId: snapshot.id,
      poLineId: row.poLineId,
      poNumber: row.poNumber,
      vendorId: row.vendorId,
      productNo: row.productNo,
      barcode: row.barcode,
      productName: row.productName,
      orderQty: row.orderQty,
      plannedDeliveryDate: day(row.plannedDeliveryDate),
      poStatusCode: row.poStatusCode ?? null,
      businessDateBasis: row.businessDateBasis ?? null,
      hasConfirmation: Boolean(row.confirmation),
      center: row.confirmation?.center ?? null,
      inboundType: row.confirmation?.inboundType ?? null,
      poStatus: row.confirmation?.poStatus ?? null,
      returnManager: row.confirmation?.returnManager ?? null,
      returnContact: row.confirmation?.returnContact ?? null,
      returnAddress: row.confirmation?.returnAddress ?? null,
      purchasePrice: row.confirmation?.purchasePrice ?? null,
      supplyPrice: row.confirmation?.supplyPrice ?? null,
      vat: row.confirmation?.vat ?? null,
      totalPurchase: row.confirmation?.totalPurchase ?? null,
      poRegisteredAt: row.confirmation?.poRegisteredAt ?? null,
      xdock: row.confirmation?.xdock ?? null,
    })),
  });
}

export async function listSavedRocketPos(
  prisma: PrismaService,
  input: {
    organizationId: string;
    channelAccountId: string;
    from: string;
    to: string;
    status?: string;
  },
): Promise<RocketSavedPoSummary[]> {
  const snapshots = await prisma.rocketPoCatalogSnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      sourceImportRun: { status: 'completed', sourceType: ROCKET_PO_CATALOG_SOURCE_TYPE },
      lines: {
        some: {
          plannedDeliveryDate: { gte: day(input.from), lte: day(input.to) },
          ...(input.status ? { poStatus: input.status } : {}),
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      sourceImportRunId: true,
      vendorId: true,
      createdAt: true,
      sourceImportRun: { select: { importedAt: true } },
      lines: {
        where: {
          plannedDeliveryDate: { gte: day(input.from), lte: day(input.to) },
          ...(input.status ? { poStatus: input.status } : {}),
        },
        orderBy: [{ poNumber: 'asc' }, { poLineId: 'asc' }],
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
  const summaries: RocketSavedPoSummary[] = [];
  const seenPoNumbers = new Set<string>();
  for (const snapshot of snapshots) {
    const byPoNumber = new Map<string, typeof snapshot.lines>();
    for (const line of snapshot.lines) {
      const lines = byPoNumber.get(line.poNumber) ?? [];
      lines.push(line);
      byPoNumber.set(line.poNumber, lines);
    }
    for (const [poNumber, lines] of byPoNumber) {
      if (seenPoNumbers.has(poNumber)) continue;
      const first = lines[0]!;
      seenPoNumbers.add(poNumber);
      summaries.push({
        sourceImportRunId: snapshot.sourceImportRunId,
        poNumber,
        orderedAt: first.poRegisteredAt ?? '',
        plannedDeliveryDate: isoDay(first.plannedDeliveryDate),
        status: first.poStatus ?? '',
        vendorId: snapshot.vendorId,
        centerName: first.center ?? '',
        inboundType: first.inboundType ?? '',
        firstProductName: first.productName,
        skuCount: lines.length,
        orderQuantity: lines.reduce((sum, line) => sum + line.orderQty, 0),
        orderAmount: lines.reduce((sum, line) => sum + (line.totalPurchase ?? 0), 0),
        collectedAt: (snapshot.sourceImportRun.importedAt ?? snapshot.createdAt).toISOString(),
      });
    }
  }
  return summaries.sort((left, right) =>
    left.plannedDeliveryDate.localeCompare(right.plannedDeliveryDate)
    || left.poNumber.localeCompare(right.poNumber));
}

export async function loadSavedRocketCollection(
  prisma: PrismaService,
  input: {
    organizationId: string;
    channelAccountId: string;
    sourceImportRunId: string;
  },
): Promise<RocketSavedPoCollection | null> {
  const snapshot = await prisma.rocketPoCatalogSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      sourceImportRunId: input.sourceImportRunId,
      sourceImportRun: { status: 'completed', sourceType: ROCKET_PO_CATALOG_SOURCE_TYPE },
    },
    select: {
      sourceImportRunId: true,
      channelAccountId: true,
      collectionRunId: true,
      vendorId: true,
      listPagesRead: true,
      totalListPages: true,
      detailPoCount: true,
      lines: {
        orderBy: { poLineId: 'asc' },
        select: savedLineSelect,
      },
    },
  });
  if (!snapshot) return null;
  return {
    sourceImportRunId: snapshot.sourceImportRunId,
    channelAccountId: snapshot.channelAccountId,
    collection: {
      collectionRunId: snapshot.collectionRunId,
      vendorId: snapshot.vendorId,
      listPagesRead: snapshot.listPagesRead,
      totalListPages: snapshot.totalListPages,
      truncated: false,
      detailPoCount: snapshot.detailPoCount,
      failedPoNumbers: [],
    },
    rows: snapshot.lines.map(toCatalogRow),
  };
}

function toCatalogRow(line: Prisma.RocketPoCatalogLineGetPayload<{
  select: typeof savedLineSelect;
}>): RocketPoCatalogRow {
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
      businessDateBasis: line.businessDateBasis as 'ordered_at' | 'expected_inbound',
    }),
    ...(line.hasConfirmation && {
      confirmation: {
        center: requiredSavedValue(line.center, 'center'),
        inboundType: requiredSavedValue(line.inboundType, 'inboundType'),
        poStatus: requiredSavedValue(line.poStatus, 'poStatus'),
        returnManager: requiredSavedValue(line.returnManager, 'returnManager'),
        returnContact: requiredSavedValue(line.returnContact, 'returnContact'),
        returnAddress: requiredSavedValue(line.returnAddress, 'returnAddress'),
        purchasePrice: requiredSavedValue(line.purchasePrice, 'purchasePrice'),
        supplyPrice: requiredSavedValue(line.supplyPrice, 'supplyPrice'),
        vat: requiredSavedValue(line.vat, 'vat'),
        totalPurchase: requiredSavedValue(line.totalPurchase, 'totalPurchase'),
        poRegisteredAt: requiredSavedValue(line.poRegisteredAt, 'poRegisteredAt'),
        xdock: requiredSavedValue(line.xdock, 'xdock'),
      },
    }),
  };
}

function requiredSavedValue<T>(value: T | null, field: string): T {
  if (value === null) {
    throw new ConflictException(`Saved Rocket PO confirmation is missing ${field}`);
  }
  return value;
}

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}
