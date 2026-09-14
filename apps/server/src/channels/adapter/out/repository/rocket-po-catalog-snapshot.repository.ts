import { Prisma } from '@prisma/client';
import type { RocketPoCatalogRow } from '@kiditem/shared/rocket-purchase-preview';
import type { RocketPoSourceSubmission } from '@kiditem/shared/rocket-purchase-preview';
import { parseBusinessDate } from '../../../../common/kst';

type PublishInput = {
  organizationId: string;
  channelAccountId: string;
  collection: RocketPoSourceSubmission['collection'];
  rows: RocketPoCatalogRow[];
};

export async function createRocketPoCatalogSnapshot(
  tx: Prisma.TransactionClient,
  input: PublishInput,
  sourceImportRunId: string,
): Promise<void> {
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
