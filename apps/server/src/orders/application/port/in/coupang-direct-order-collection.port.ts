import type {
  CoupangDirectOrderCollectionRequest,
} from '@kiditem/shared/coupang-direct-order';

export interface CoupangDirectOrderCollectionPort {
  collect(input: {
    organizationId: string;
    userId: string;
    request: CoupangDirectOrderCollectionRequest;
  }): Promise<{
    importRunId: string;
    reconciledRows: number;
    duplicate: boolean;
  }>;
}

export const COUPANG_DIRECT_ORDER_COLLECTION_PORT = Symbol(
  'COUPANG_DIRECT_ORDER_COLLECTION_PORT',
);
