import type {
  RocketPoCatalogPublication,
  RocketPurchasePreviewReason,
  RocketPurchasePreviewRequest,
  RocketSavedPoCollection,
  RocketSavedPoSummary,
} from '@kiditem/shared/rocket-purchase-preview';

export type RocketPoCatalogIdentity = {
  poLineId: string;
  channelSkuId: string;
};

export type RocketPoCatalogResolution = {
  blockingReason: Extract<
    RocketPurchasePreviewReason,
    'collection_incomplete' | 'vendor_mismatch'
  > | null;
  catalog: RocketPoCatalogPublication | null;
  identities: RocketPoCatalogIdentity[];
};

/**
 * 저장된 로켓 발주 수집본의 상품을 셀피아 재고에 **바코드**로 매칭한 결과 행.
 * (recipe/등록과 무관한 read-only 매칭 — 셀피아 주문수집이 쓰는 바코드 키와 동일.)
 * 같은 바코드가 셀피아 SKU 여러 개(쿠팡용/일반 중복)에 걸리면 재고는 합산한다.
 */
export type RocketStockMatchRow = {
  poLineId: string;
  poNumber: string;
  productName: string;
  barcode: string;
  orderQuantity: number;
  plannedDeliveryDate: string;
  matched: boolean;
  /** 매칭 방식: barcode(정확) · name(이름일치) · name-fuzzy(유사, 확인필요) · null(미매칭). */
  matchType: 'barcode' | 'name' | 'name-fuzzy' | null;
  sellpiaName: string | null;
  /** 셀피아 낱개 현재고(매칭된 SKU 기준). 미매칭이면 null. */
  currentStock: number | null;
  /** 매칭된 SKU 의 활성 약정 합계. 미매칭이면 null. */
  activeCommitmentQuantity: number | null;
  /** = max(currentStock - activeCommitmentQuantity, 0). 자동수량·상한의 기준. 미매칭이면 null. */
  availableStock: number | null;
  /** 상품명에서 파싱한 팩 크기(쿠팡 1발주 = packSize 낱개). 최소 1. */
  packSize: number;
  /**
   * 서버가 계산한 확정수량(발주 단위). 같은 SKU 를 여러 행이 공유하면 availableStock 을
   * poLineId 순서로 공동 할당해 모든 행의 합이 실제 가용재고를 넘지 않게 한다.
   */
  confirmQuantity: number;
};

export interface RocketPoCatalogPort {
  publishAndResolve(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchasePreviewRequest;
  }): Promise<RocketPoCatalogResolution>;

  listSavedPos(input: {
    organizationId: string;
    channelAccountId: string;
    from: string;
    to: string;
    status?: string;
  }): Promise<RocketSavedPoSummary[]>;

  loadSavedCollection(input: {
    organizationId: string;
    channelAccountId: string;
    sourceImportRunId: string;
  }): Promise<RocketSavedPoCollection | null>;

  /**
   * 저장 수집본의 상품을 셀피아 재고에 매칭(read-only, 바코드→이름→퍼지).
   * fromDate/toDate(YYYY-MM-DD) 를 주면 그 입고예정일 범위의 행만 매칭한다(전송량·비용 절감).
   */
  matchSavedStock(input: {
    organizationId: string;
    channelAccountId: string;
    sourceImportRunId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<RocketStockMatchRow[]>;
}

export const ROCKET_PO_CATALOG_PORT = Symbol('ROCKET_PO_CATALOG_PORT');
