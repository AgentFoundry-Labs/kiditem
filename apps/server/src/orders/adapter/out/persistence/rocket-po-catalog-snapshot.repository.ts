import { Prisma } from '@prisma/client';
import type { RocketPoCatalogRow, RocketPoCollectionEvidence } from '@kiditem/shared/rocket-purchase-preview';
import { parseBusinessDate } from '../../../../common/kst';

type PublishInput = {
  organizationId: string;
  channelAccountId: string;
  operationId: string;
  collection: RocketPoCollectionEvidence;
  rows: readonly RocketPoCatalogRow[];
};

/** 실행 하나의 로켓 PO 스냅샷과 줄(finish 트랜잭션 안에서만). */
export async function createRocketPoCatalogSnapshot(tx: Prisma.TransactionClient, input: PublishInput): Promise<void> {
  const snapshot = await tx.rocketPoCatalogSnapshot.create({
    data: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      operationId: input.operationId,
      collectionRunId: input.collection.collectionRunId,
      vendorId: input.collection.vendorId,
      listPagesRead: input.collection.listPagesRead,
      totalListPages: input.collection.totalListPages,
      detailPoCount: input.collection.detailPoCount,
    },
    select: { id: true },
  });
  if (input.rows.length === 0) return;
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

function day(value: string): Date {
  const parsed = parseBusinessDate(value);
  if (!parsed) throw new Error(`Invalid business date: ${value}`);
  return parsed;
}
