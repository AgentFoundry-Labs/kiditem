import type { Prisma } from '@prisma/client';
import type { UpsertWingSnapshotByProductIdInput } from '../../../application/port/out/repository/wing-tracked-product.repository.port';

type SnapshotClient = Pick<
  Prisma.TransactionClient,
  'coupangWingTrackedProduct' | 'coupangWingTrackedProductDailySnapshot'
>;

export async function upsertWingTrackedProductSnapshots(
  client: SnapshotClient,
  rows: readonly UpsertWingSnapshotByProductIdInput[],
  organizationId: string,
): Promise<{ captured: number; ignored: number }> {
  if (rows.length === 0) return { captured: 0, ignored: 0 };
  const productIds = [...new Set(rows.map((row) => row.productId))];
  const trackers = await client.coupangWingTrackedProduct.findMany({
    where: { organizationId, enabled: true, productId: { in: productIds } },
    select: { id: true, productId: true },
  });
  const trackerByProductId = new Map(trackers.map((tracker) => [tracker.productId, tracker.id]));
  if (trackerByProductId.size === 0) return { captured: 0, ignored: rows.length };

  const writeByTarget = new Map<string, {
    trackedProductId: string;
    row: UpsertWingSnapshotByProductIdInput;
  }>();
  for (const row of rows) {
    const trackedProductId = trackerByProductId.get(row.productId);
    if (!trackedProductId) continue;
    writeByTarget.set(snapshotTargetKey(trackedProductId, row.businessDate), { trackedProductId, row });
  }
  const writes = [...writeByTarget.values()];
  if (writes.length === 0) return { captured: 0, ignored: rows.length };

  await client.coupangWingTrackedProductDailySnapshot.deleteMany({
    where: {
      OR: writes.map(({ trackedProductId, row }) => ({
        trackedProductId,
        businessDate: row.businessDate,
      })),
    },
  });
  await client.coupangWingTrackedProductDailySnapshot.createMany({
    data: writes.map(({ trackedProductId, row }) => ({
      organizationId,
      trackedProductId,
      businessDate: row.businessDate,
      ...snapshotWriteValues(row),
      sourceKeyword: row.sourceKeyword,
      capturedAt: row.capturedAt,
      operationId: row.operationId ?? null,
    })),
  });

  const touchedTrackerIds = [...new Set(writes.map(({ trackedProductId }) => trackedProductId))];
  if (touchedTrackerIds.length > 0) {
    await client.coupangWingTrackedProduct.updateMany({
      where: { id: { in: touchedTrackerIds }, organizationId, enabled: true },
      data: { lastCapturedAt: latestCapturedAt(writes) },
    });
  }
  return { captured: writes.length, ignored: rows.length - writes.length };
}

function snapshotTargetKey(trackedProductId: string, businessDate: Date): string {
  return `${trackedProductId}\u0000${businessDate.toISOString()}`;
}

function latestCapturedAt(writes: readonly { row: UpsertWingSnapshotByProductIdInput }[]): Date {
  return writes.reduce(
    (latest, { row }) => row.capturedAt.getTime() > latest.getTime() ? row.capturedAt : latest,
    writes[0]!.row.capturedAt,
  );
}

function snapshotWriteValues(row: UpsertWingSnapshotByProductIdInput) {
  return {
    salePriceKrw: roundOrNull(row.salePriceKrw),
    ratingCount: roundOrNull(row.ratingCount),
    ratingAverage: row.ratingAverage,
    pvLast28Day: roundOrNull(row.pvLast28Day),
    salesLast28d: roundOrNull(row.salesLast28d),
    estimatedRevenue28d: roundOrNull(row.estimatedRevenue28d),
    conversionRate28d: row.conversionRate28d,
  };
}

function roundOrNull(value: number | null): number | null {
  return value == null ? null : Math.round(value);
}
