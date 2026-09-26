import { apiClient } from '@/lib/api-client';
import type {
  CoupangDirectPoSnapshotEntry,
  CoupangDirectPoSnapshotResponse,
} from '@kiditem/shared/coupang-direct-order';
import type { CoupangDirectPo } from './coupang-directship-api';

const PATH = '/api/orders/collection/coupang-directship/snapshot';

/** 달력 칸을 달력이 쓰는 CoupangDirectPo 형태로 되돌린다. */
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

/** 입고예정일 달력의 근거: 그 계정의 가장 최근 성공한 직배송 수집(없으면 `operationId: null`, KID-370). */
export type CoupangDirectCalendarSnapshot = {
  operationId: string | null;
  collectedAt: string | null;
  pos: CoupangDirectPo[];
};

/** 서버가 마지막 성공 캡처에서 읽어 준 달력. 읽기만 하고 수집을 시작하지 않는다. */
export async function readCoupangDirectSnapshot(
  channelAccountId: string,
): Promise<CoupangDirectCalendarSnapshot> {
  const res = await apiClient.get<CoupangDirectPoSnapshotResponse>(
    `${PATH}?channelAccountId=${encodeURIComponent(channelAccountId)}`,
  );
  return {
    operationId: res.operationId ?? null,
    collectedAt: res.collectedAt ?? null,
    pos: snapshotEntriesToPo(res.entries ?? []),
  };
}
