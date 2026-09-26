import { apiClient } from '@/lib/api-client';
import type {
  CoupangDirectPoSnapshotEntry,
  CoupangDirectPoSnapshotResponse,
} from '@kiditem/shared/coupang-direct-order';
import type { CoupangDirectPo } from './coupang-directship-api';

const PATH = '/api/orders/collection/coupang-directship/snapshot';

/** 저장한 스냅샷을 달력이 쓰는 CoupangDirectPo 형태로 되돌린다. */
export function snapshotEntriesToPo(
  entries: readonly CoupangDirectPoSnapshotEntry[],
): CoupangDirectPo[] {
  return entries.map((entry) => ({
    seq: entry.purchaseOrderSeq,
    status: 'PA',
    center: entry.centerName,
    transport: entry.transport,
    edd: entry.deliveryDate ?? '',
    reg: entry.orderedDate ?? '',
    urgent: entry.isUrgent,
    items: entry.items.map((it) => ({
      skuId: it.barcode || it.name,
      barcode: it.barcode,
      name: it.name,
      qty: it.qty,
      amount: it.amount,
    })),
  })) as CoupangDirectPo[];
}

export async function readCoupangDirectSnapshot(
  channelAccountId: string,
): Promise<CoupangDirectPo[]> {
  const res = await apiClient.get<CoupangDirectPoSnapshotResponse>(
    `${PATH}?channelAccountId=${encodeURIComponent(channelAccountId)}`,
  );
  return snapshotEntriesToPo(res.entries ?? []);
}
