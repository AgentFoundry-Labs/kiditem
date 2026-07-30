import type {
  CoupangDirectOrderCollectionRequest,
} from '@kiditem/shared/coupang-direct-order';

/** 수집·워크북 연결 상태를 (poNumber=발주번호, productNo=SKU) 식별자로 보고한다. */
export type CoupangDirectCollectionLineRef = {
  poNumber: string;
  productNo: string;
};

export interface CoupangDirectOrderCollectionPort {
  collect(input: {
    organizationId: string;
    userId: string;
    request: CoupangDirectOrderCollectionRequest;
  }): Promise<{
    importRunId: string;
    exportId: string | null;
    transmissionIntentKey: string | null;
    matchedLineCount: number;
    reconciledRows: number;
    collectedLines: CoupangDirectCollectionLineRef[];
    matchedLines: CoupangDirectCollectionLineRef[];
    unmatchedLines: CoupangDirectCollectionLineRef[];
    duplicate: boolean;
  }>;
}

export const COUPANG_DIRECT_ORDER_COLLECTION_PORT = Symbol(
  'COUPANG_DIRECT_ORDER_COLLECTION_PORT',
);
