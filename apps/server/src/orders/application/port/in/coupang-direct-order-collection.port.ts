import type {
  CoupangDirectOrderCollectionRequest,
} from '@kiditem/shared/coupang-direct-order';

/** 발주확정(정산) 성공/제외 라인을 (poNumber=발주번호, productNo=SKU) 식별자로 보고한다. */
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
    confirmedLines: CoupangDirectCollectionLineRef[];
    skippedLines: CoupangDirectCollectionLineRef[];
    duplicate: boolean;
  }>;
}

export const COUPANG_DIRECT_ORDER_COLLECTION_PORT = Symbol(
  'COUPANG_DIRECT_ORDER_COLLECTION_PORT',
);
