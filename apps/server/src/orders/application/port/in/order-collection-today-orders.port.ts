import type { OrderCollectionTodayOrders } from '@kiditem/shared/order-collection-source';

export const ORDER_COLLECTION_TODAY_ORDERS_PORT = Symbol('ORDER_COLLECTION_TODAY_ORDERS_PORT');

/**
 * 오늘(KST) 수집이 실어 온 주문 수 — Orders가 소유하는 한 가지 셈(KID-234·KID-359 H3). 주문수집 화면의 몰 칸과
 * 대시보드의 '오늘 주문'이 이 capability 하나를 읽는다: "여기서 따로 세면 두 화면이 또 다른 수를 말한다"
 * (사장님 2026-09-22: 63 대 82).
 */
export interface OrderCollectionTodayOrdersPort {
  readTodayOrders(input: { organizationId: string; now?: Date }): Promise<OrderCollectionTodayOrders>;
}
