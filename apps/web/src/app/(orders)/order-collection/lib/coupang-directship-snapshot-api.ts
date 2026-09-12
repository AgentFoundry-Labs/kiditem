import { apiClient } from '@/lib/api-client';
import type {
  CoupangDirectPoSnapshotEntry,
  CoupangDirectPoSnapshotResponse,
} from '@kiditem/shared/coupang-direct-order';
import type { CoupangDirectPo } from './coupang-directship-api';
import type { OrderCollectionExtensionRun } from './order-collection-extension';
import { coupangDirectOwnerAttemptHeaders } from './coupang-directship-source-owner';

const PATH = '/api/orders/collection/coupang-directship/snapshot';

/** 수집한 발주 목록을 달력용 스냅샷 형태로 압축한다(엑셀용 원본은 수집 시 새로 받는다). */
export function poToSnapshotEntries(
  pos: readonly CoupangDirectPo[],
): CoupangDirectPoSnapshotEntry[] {
  return pos.map((po) => {
    const items = (po.items ?? []).map((it) => ({
      barcode: String(it?.barcode ?? ''),
      name: String(it?.name ?? ''),
      qty: Number(it?.qty ?? 0),
      amount: Number(it?.amount ?? 0),
    }));
    return {
      purchaseOrderSeq: String(po.seq ?? ''),
      centerName: String(po.center ?? ''),
      transport: String(po.transport ?? '').toUpperCase() === 'MILKRUN'
        ? 'MILKRUN'
        : 'SHIPMENT',
      deliveryDate: po.edd ? String(po.edd).slice(0, 10) : null,
      orderedDate: po.reg ? String(po.reg).slice(0, 10) : null,
      isUrgent: Boolean(po.urgent),
      skuCount: items.length,
      orderQuantity: items.reduce((sum, it) => sum + it.qty, 0),
      orderAmount: items.reduce((sum, it) => sum + it.amount, 0),
      items,
    };
  });
}

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

export async function saveCoupangDirectSnapshot(
  channelAccountId: string,
  pos: readonly CoupangDirectPo[],
  run: OrderCollectionExtensionRun,
): Promise<void> {
  await apiClient.post(
    PATH,
    {
      channelAccountId,
      entries: poToSnapshotEntries(pos),
    },
    { headers: coupangDirectOwnerAttemptHeaders(run) },
  );
}
