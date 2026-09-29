import type { OwnerTransaction } from '../../../../../common/owner-transaction';

/**
 * Orders가 다른 owner(analytics·finance·products·channels·common 이익 계산)에 내주는 주문 사실 incoming port(ADR-0021, KID-392).
 * 주문 원장을 읽는 리더는 Orders `adapter/out/persistence/` 안에 있고, 소비자는 이 포트만 주입한다(`check:hexagonal`·`check:ledger-readers`).
 * 모든 메서드는 호출자의 트랜잭션(`OwnerTransaction`)에서 돈다 — Orders의 persistence 어댑터만 그 핸들을 푼다.
 * 반환은 사실(합·건수·날짜·스칼라 id·라인 금액)이지 원장 행이 아니다. 창·완결·coverage 판정은 Orders 쪽에서 한다.
 */
export const ORDER_FACTS_PORT = Symbol('ORDER_FACTS_PORT');

export const ORDER_FACT_EXCLUDED_STATUSES = ['cancelled', 'returned', 'refunded'] as const;

export interface OrderWindowInput {
  organizationId: string;
  from: Date;
  to: Date;
  excludedStatuses?: readonly string[];
}

export interface OrderWindowFacts {
  revenue: number | null;
  orderCount: number | null;
  quantity: number | null;
  observedAt: Date | null;
  observedTotals: {
    revenue: number;
    orderCount: number;
    quantity: number;
  } | null;
  requestedDates: string[];
  includedDates: string[];
  missingDates: string[];
  sourceCoverage: OrderSourceCoverageFacts[];
}

export interface OrderSourceCoverageFacts {
  sourceType: string;
  channelAccountId: string | null;
  mallKey: string | null;
  includedDates: string[];
  missingDates: string[];
  observedAt: Date | null;
}

export interface DailyOrderFacts {
  day: string;
  revenue: number;
  orderCount: number;
  quantity: number;
}

export interface ListingOptionOrderFacts {
  orderId: string;
  channelAccountId: string;
  listingOptionId: string;
  revenue: number;
  quantity: number;
}

export interface OrderLineFact {
  orderId: string;
  channelAccountId: string;
  orderedAt: Date;
  businessDate: string;
  shippingPrice: number;
  lineItemId: string;
  listingOptionId: string | null;
  sku: string | null;
  productName: string;
  revenue: number;
  quantity: number;
}

export interface OrderLineWindowFacts {
  window: OrderWindowFacts;
  orders: readonly Readonly<{
    orderId: string;
    channelAccountId: string;
    orderedAt: Date;
    businessDate: string;
    shippingPrice: number;
    lines: readonly OrderLineFact[];
  }>[];
}

export interface RepurchaseOrderFact {
  orderId: string;
  receiverName: string | null;
  orderedAt: Date;
  revenue: number;
}

export interface PublishedOrderLineFact {
  orderId: string;
  lineItemId: string;
  listingOptionId: string | null;
  revenue: number;
  quantity: number;
}

export type ChannelAccountOrderCount = Readonly<{ channelAccountId: string; orderCount: number }>;

export type PublishedOrderLinesInput = Readonly<{ organizationId: string; excludedStatuses?: readonly string[] }>;

export interface OrderFactsPort {
  /** 창 합(매출·건수·수량)과 몰 적용 범위·빠진 날. 채널 계정 상태는 Orders가 Channels 포트로 확인한다. */
  readOrderWindowFacts(transaction: OwnerTransaction, input: OrderWindowInput): Promise<OrderWindowFacts>;
  /** 창 합 + 주문·라인 사실(라인 금액·수량·옵션 id). */
  readOrderLineWindowFacts(transaction: OwnerTransaction, input: OrderWindowInput): Promise<OrderLineWindowFacts>;
  readDailyOrderFacts(transaction: OwnerTransaction, input: OrderWindowInput): Promise<DailyOrderFacts[]>;
  readListingOptionOrderFacts(transaction: OwnerTransaction, input: OrderWindowInput): Promise<ListingOptionOrderFacts[]>;
  readRepurchaseOrderFacts(transaction: OwnerTransaction, input: OrderWindowInput): Promise<RepurchaseOrderFact[]>;
  readPublishedOrderLines(transaction: OwnerTransaction, input: PublishedOrderLinesInput): Promise<PublishedOrderLineFact[]>;
  /** 조직이 관측한 주문의 첫·끝 시각. 주문이 없으면 null. */
  readObservedOrderBounds(transaction: OwnerTransaction, input: Readonly<{ organizationId: string }>): Promise<{ from: Date; to: Date } | null>;
  readObservedOrderCount(transaction: OwnerTransaction, input: Readonly<{ organizationId: string }>): Promise<number>;
  readOrderStatusCount(transaction: OwnerTransaction, input: Readonly<{ organizationId: string; status: string }>): Promise<number>;
  readOrderCountsByChannelAccount(transaction: OwnerTransaction, input: Readonly<{ organizationId: string }>): Promise<ChannelAccountOrderCount[]>;
}
