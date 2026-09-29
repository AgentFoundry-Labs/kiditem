import type { OrderCollectionTodayMall, OrderCollectionTodayOrders } from '@kiditem/shared/order-collection-source';
import {
  COUPANG_DIRECTSHIP_KIND,
  CoupangDirectshipResultSchema,
  MALL_ORDERS_KIND,
  MallOrdersResultSchema,
} from '@kiditem/shared/orders-operations';
import type { SellpiaTransferTransport } from '@kiditem/shared/orders-action-operations';

/** directship은 계획에 몰 키가 없다 — 그 kind 자체가 한 몰 칸이다. */
export const DIRECTSHIP_MALL_KEY = 'coupang-direct';

/** 오늘 성공한 수집 실행 하나(reader가 최근 시작한 것부터 준다). */
export interface TodayCollectionOperation {
  id: string;
  kind: string;
  plan: Record<string, unknown> | null;
  result: unknown;
}

/** 오늘 원천 실행 하나를 가리키는 성공한 셀피아 전송. */
export interface TodaySucceededTransfer {
  sourceOperationId: string;
  transport: SellpiaTransferTransport | null;
  acceptedOrderNumbers: readonly string[];
}

interface MallTally {
  orderNumbers: Set<string>;
  sourceIds: Set<string>;
  /** `orderNumbers`가 없는 옛 result(배포 전 실행)의 가장 최근 하나 — 옛 규칙(그 실행의 rowCount)으로 센다. */
  legacy: { id: string; rowCount: number } | null;
  /** directship: 계정마다 마지막 실행의 발주서 수·아직 안 보낸 운송유형의 발주서 수. */
  directship: { orderCount: number; newCount: number };
}

/**
 * 오늘 주문·신규(KID-234, 사장님 2026-09-29 Q3).
 *
 * - 몰 주문(`orders.mall_orders`, 브라우저 수집·수동 업로드): 몰마다 오늘 성공 수집들이 result에 적은 변환 파일 주문번호의
 *   합집합이 `orderCount`, 그중 그 몰의 오늘 원천 실행을 가리키는 성공 전송의 `acceptedOrderNumbers`에 없는 수가 `newCount`.
 *   같은 몰을 두 번 걷어도 불지 않고, 재전송은 두 번 빼지 않는다. 한계: 키드키즈 변환기는 주문번호를 `주문일+파일 안 순번`으로
 *   새로 매겨서 증분 수집의 두 번째 실행 번호가 첫 실행과 겹치면 오늘·신규가 모자란다(근본 수정은 변환기 쪽).
 * - directship(`orders.coupang_directship`): 변환 파일의 판매처 주문번호는 파일마다 `날짜_0001`부터라 합집합이 성립하지 않고
 *   finalize에는 운영자의 발주 선택도 없다 — 로켓 계정마다 오늘 마지막 성공 실행의 발주서 수(`rowCount`)가 `orderCount`,
 *   그 실행의 운송유형(`result.transports`) 중 성공 전송(원천 id + 운송유형)이 없는 운송유형의 발주서 수가 `newCount`.
 * - 몰 없는 kind(로켓 PO)는 세지 않는다. 오늘 수집이 없으면 `total`·`newTotal`은 null(0은 "걷었는데 없었다").
 */
export function countTodayOrders(
  operations: readonly TodayCollectionOperation[],
  transfers: readonly TodaySucceededTransfer[],
): OrderCollectionTodayOrders {
  const tallies = new Map<string, MallTally>();
  const tallyOf = (mallKey: string): MallTally => {
    let tally = tallies.get(mallKey);
    if (!tally) {
      tally = { orderNumbers: new Set(), sourceIds: new Set(), legacy: null, directship: { orderCount: 0, newCount: 0 } };
      tallies.set(mallKey, tally);
    }
    return tally;
  };
  const sentTransports = new Map<string, Set<SellpiaTransferTransport | null>>();
  for (const transfer of transfers) {
    const sent = sentTransports.get(transfer.sourceOperationId) ?? new Set();
    sent.add(transfer.transport);
    sentTransports.set(transfer.sourceOperationId, sent);
  }

  const countedAccounts = new Set<string>();
  for (const operation of operations) {
    if (operation.kind === MALL_ORDERS_KIND) {
      const result = MallOrdersResultSchema.safeParse(operation.result);
      const mallKey = operation.plan?.mallKey;
      if (!result.success || typeof mallKey !== 'string' || !mallKey) continue;
      const tally = tallyOf(mallKey);
      tally.sourceIds.add(operation.id);
      if (result.data.orderNumbers) {
        for (const orderNumber of result.data.orderNumbers) tally.orderNumbers.add(orderNumber);
      } else if (!tally.legacy) {
        tally.legacy = { id: operation.id, rowCount: result.data.rowCount };
      }
      continue;
    }
    if (operation.kind === COUPANG_DIRECTSHIP_KIND) {
      const result = CoupangDirectshipResultSchema.safeParse(operation.result);
      const account = String(operation.plan?.channelAccountId ?? '');
      if (!result.success || countedAccounts.has(account)) continue;
      countedAccounts.add(account);
      const sent = sentTransports.get(operation.id);
      const unsent = (['SHIPMENT', 'MILKRUN'] as const)
        .filter((transport) => !sent?.has(transport))
        .reduce((sum, transport) => sum + result.data.transports[transport], 0);
      const tally = tallyOf(DIRECTSHIP_MALL_KEY).directship;
      tally.orderCount += result.data.rowCount;
      tally.newCount += unsent;
    }
  }

  const byMall: Record<string, OrderCollectionTodayMall> = {};
  for (const [mallKey, tally] of tallies) {
    if (mallKey === DIRECTSHIP_MALL_KEY) {
      byMall[mallKey] = { ...tally.directship };
      continue;
    }
    const accepted = new Set<string>();
    for (const transfer of transfers) {
      if (!tally.sourceIds.has(transfer.sourceOperationId)) continue;
      for (const orderNumber of transfer.acceptedOrderNumbers) accepted.add(orderNumber);
    }
    const pending = [...tally.orderNumbers].filter((orderNumber) => !accepted.has(orderNumber)).length;
    const legacyCount = tally.legacy?.rowCount ?? 0;
    const legacyNew = tally.legacy && !sentTransports.has(tally.legacy.id) ? legacyCount : 0;
    byMall[mallKey] = { orderCount: tally.orderNumbers.size + legacyCount, newCount: pending + legacyNew };
  }
  const malls = Object.values(byMall);
  if (malls.length === 0) return { total: null, newTotal: null, byMall };
  return {
    total: malls.reduce((sum, mall) => sum + mall.orderCount, 0),
    newTotal: malls.reduce((sum, mall) => sum + mall.newCount, 0),
    byMall,
  };
}
