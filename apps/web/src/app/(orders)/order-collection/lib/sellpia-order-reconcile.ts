import { issueBrowserCollectionRunId } from '@/lib/browser-collection-session';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { resolveMallKeyFromSellpiaProvider } from './icecream-tracking-api';
import { resolveOrderCollectionMallKey } from './order-collection-malls';
import type { StoredOrderCollectionFile } from './order-generated-file-store';

/** 셀피아에 올라와 있는 주문 한 건. 판매처는 수취인 괄호 안 이름과 같은 값이다. */
export interface SellpiaOrderSnapshotRow {
  orderNo: string;
  receiver: string;
  provider: string;
}

interface SellpiaOrderSnapshotResponse {
  success?: boolean;
  orderCount?: number;
  rows?: SellpiaOrderSnapshotRow[];
  partial?: boolean;
  error?: string;
}

/** 몰 하나의 대조 결과. */
export interface MallReconcileResult {
  mallKey: string;
  /** 수집했지만 아직 셀피아에서 확인되지 않은 주문번호. */
  missingOrderNumbers: string[];
  /** 셀피아에서 확인된 주문번호 수. */
  presentCount: number;
}

export interface SellpiaReconcileResult {
  /** 몰 key -> 아직 안 올라간 주문 수. 몰 카드 "신규"가 이 값을 쓴다. */
  missingCountByMallKey: Map<string, number>;
  byMall: MallReconcileResult[];
  /** 셀피아에서 읽은 전체 주문 수. */
  sellpiaOrderCount: number;
  /** 일부 화면만 읽혔으면 true (대조 결과가 불완전할 수 있음). */
  partial: boolean;
  checkedAt: number;
}

/**
 * 확장이 셀피아(대기목록 + 재고매칭)에서 현재 올라와 있는 주문을 읽어온다.
 * 조회만 하는 비파괴 동작이다.
 */
export async function collectSellpiaOrderSnapshot(): Promise<{
  rows: SellpiaOrderSnapshotRow[];
  partial: boolean;
}> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. 확장을 로드하고 kiditem.sellpia.com 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const response = await sendToExtension<SellpiaOrderSnapshotResponse>(
    extensionId,
    { action: 'collectSellpiaOrderSnapshot', runId: await issueBrowserCollectionRunId() },
    180000, // 셀피아 화면 2개를 조회한다
  );
  if (!response?.success || !Array.isArray(response.rows)) {
    throw new Error(response?.error ?? '셀피아 주문 목록을 읽지 못했습니다.');
  }
  return { rows: response.rows, partial: response.partial === true };
}

/**
 * 셀피아 주문번호는 "66_2026073013413794209"처럼 앞에 판매처 코드가 붙는다.
 * 수집한 주문번호와 맞추기 위해 접두어를 떼고 비교한다.
 */
function orderNumberKeys(orderNo: string): string[] {
  const value = String(orderNo || '').trim();
  if (!value) return [];
  const keys = [value];
  const separatorIndex = value.lastIndexOf('_');
  if (separatorIndex > 0 && separatorIndex < value.length - 1) {
    keys.push(value.slice(separatorIndex + 1));
  }
  return keys;
}

/**
 * 수집한 주문(로컬 기록)과 셀피아 실제 주문을 몰별로 대조해, 아직 안 올라간 주문을 추린다.
 * 판매처(수취인 괄호 이름)로 몰을 가르고 주문번호로 맞춘다.
 */
export function reconcileCollectedOrdersWithSellpia({
  history,
  sellpiaRows,
  collectionDate,
  partial = false,
  checkedAt,
}: {
  history: StoredOrderCollectionFile[];
  sellpiaRows: SellpiaOrderSnapshotRow[];
  /** 이 날짜에 수집한 주문만 대조한다(몰 카드 "신규"와 같은 기준). */
  collectionDate: string;
  partial?: boolean;
  checkedAt: number;
}): SellpiaReconcileResult {
  // 셀피아에 있는 주문번호를 몰별로 모은다. 판매처를 몰로 못 맞추면 몰 무관 집합에도 넣어
  // 판매처명이 바뀌었을 때 "안 올라감"으로 잘못 뜨는 것을 막는다.
  const sellpiaByMall = new Map<string, Set<string>>();
  const sellpiaAll = new Set<string>();
  for (const row of sellpiaRows) {
    const keys = orderNumberKeys(row.orderNo);
    if (keys.length === 0) continue;
    for (const key of keys) sellpiaAll.add(key);
    const mallKey = resolveMallKeyFromSellpiaProvider(row.provider);
    if (!mallKey) continue;
    let set = sellpiaByMall.get(mallKey);
    if (!set) {
      set = new Set<string>();
      sellpiaByMall.set(mallKey, set);
    }
    for (const key of keys) set.add(key);
  }

  const collectedByMall = new Map<string, Set<string>>();
  for (const item of history) {
    if ((item.collectionDate ?? '') !== collectionDate) continue;
    const mallKey = resolveOrderCollectionMallKey(item);
    if (!mallKey) continue;
    const orderNumbers = (item.orderNumbers ?? [])
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (orderNumbers.length === 0) continue;
    let set = collectedByMall.get(mallKey);
    if (!set) {
      set = new Set<string>();
      collectedByMall.set(mallKey, set);
    }
    for (const orderNumber of orderNumbers) set.add(orderNumber);
  }

  const byMall: MallReconcileResult[] = [];
  const missingCountByMallKey = new Map<string, number>();
  for (const [mallKey, collected] of collectedByMall) {
    const mallSet = sellpiaByMall.get(mallKey);
    const missingOrderNumbers: string[] = [];
    let presentCount = 0;
    for (const orderNumber of collected) {
      const present = mallSet?.has(orderNumber) || sellpiaAll.has(orderNumber);
      if (present) presentCount += 1;
      else missingOrderNumbers.push(orderNumber);
    }
    byMall.push({ mallKey, missingOrderNumbers, presentCount });
    missingCountByMallKey.set(mallKey, missingOrderNumbers.length);
  }

  return {
    missingCountByMallKey,
    byMall,
    sellpiaOrderCount: sellpiaAll.size,
    partial,
    checkedAt,
  };
}
