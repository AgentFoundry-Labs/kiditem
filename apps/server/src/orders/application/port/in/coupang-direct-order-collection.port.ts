import type {
  CoupangDirectCenter,
  CoupangDirectOrderCollectionRequest,
  CoupangDirectPoSnapshotResponse,
  CoupangDirectPurchaseOrder,
} from '@kiditem/shared/coupang-direct-order';
import type { CoupangDirectshipPlan, CoupangDirectshipResult } from '@kiditem/shared/orders-operations';
import type { OwnerTransaction } from '../../../../common/owner-transaction';

/** 오늘 주문 카드·대시보드가 옛 attempt run을 가려 읽는 원천 유형(N까지). 새 캡처는 실행 표에 있다. */
export const COUPANG_DIRECT_SOURCE_TYPE = 'coupang_direct_order_capture' as const;

export type CoupangDirectCapture = {
  channelAccountId: string;
  centers: Record<string, CoupangDirectCenter>;
  pos: CoupangDirectPurchaseOrder[];
};

/** 수집·워크북 연결 상태를 (poNumber=발주번호, productNo=SKU) 식별자로 보고한다. */
export type CoupangDirectCollectionLineRef = {
  poNumber: string;
  productNo: string;
};

export type CoupangDirectTransportReceipt = {
  transport: 'SHIPMENT' | 'MILKRUN';
  payloadChecksum: string;
  /** 이 영수증의 효과를 처음 만든 directship 실행. 옛 run이 만든 영수증은 null. */
  effectOperationId: string | null;
  exportId: string | null;
  transmissionIntentKey: string | null;
  matchedLineCount: number;
  reconciledRows: number;
  collectedLines: CoupangDirectCollectionLineRef[];
  matchedLines: CoupangDirectCollectionLineRef[];
  unmatchedLines: CoupangDirectCollectionLineRef[];
  duplicate: boolean;
};

export type CoupangDirectTransport = 'SHIPMENT' | 'MILKRUN';

export type CoupangDirectProjection = {
  operationId: string;
  request: CoupangDirectOrderCollectionRequest;
  receipt: CoupangDirectTransportReceipt;
};

/**
 * 쿠팡 직배송(로켓 최종주문) 원천(Orders, KID-359). 수집은 실행 kind `orders.coupang_directship`이고 finish가 캡처를
 * `OrderCollectionArtifact`(operationId)에 보관만 한다. 주문·워크북 대조는 성공한 실행을 운송유형별로 변환할 때 쓴다.
 */
export interface CoupangDirectOrderCollectionPort {
  /** begin: 활성 로켓 계정인지 확인하고 plan을 정한다. */
  planOperation(input: { organizationId: string; channelAccountId: string }): Promise<CoupangDirectshipPlan>;

  /** finish 트랜잭션: 캡처를 보관하고 result를 돌려준다(원장 발행 없음). */
  publishCapture(
    transaction: OwnerTransaction,
    input: { organizationId: string; operationId: string; capture: CoupangDirectCapture },
  ): Promise<CoupangDirectshipResult>;

  /** 성공한 directship 실행이 보관한 캡처. 그 실행이 아니거나 다른 계정이면 거절. */
  readCapture(input: {
    organizationId: string;
    operationId: string;
    channelAccountId?: string;
  }): Promise<CoupangDirectCapture>;

  /**
   * 입고예정일 달력(KID-370): 그 계정의 가장 최근 성공한 directship 실행이 보관한 캡처를 달력 칸으로 줄여 준다. 조직의
   * 최근 성공한 실행을 상한까지만 훑으므로, 성공한 실행이 없거나 그 창 밖이면 `operationId: null`과 빈 칸. 이 조직의 로켓 계정이 아니면 NOT_FOUND. 읽기만 하고 실행을 시작하지 않는다.
   */
  readLatestSnapshot(input: { organizationId: string; channelAccountId: string }): Promise<CoupangDirectPoSnapshotResponse>;

  /** 캡처에서 고른 한 운송유형을 주문·워크북 대조로 소비한다(같은 선택은 멱등). */
  consume(input: {
    organizationId: string;
    userId: string;
    operationId: string;
    capture: CoupangDirectCapture;
    transport: CoupangDirectTransport;
  }): Promise<CoupangDirectTransportReceipt>;

  readProjection(input: {
    organizationId: string;
    operationId: string;
    transport: CoupangDirectTransport;
  }): Promise<CoupangDirectProjection>;
}

export const COUPANG_DIRECT_ORDER_COLLECTION_PORT = Symbol(
  'COUPANG_DIRECT_ORDER_COLLECTION_PORT',
);
