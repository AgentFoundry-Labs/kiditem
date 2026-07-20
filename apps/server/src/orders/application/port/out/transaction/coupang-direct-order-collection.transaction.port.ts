import type {
  CoupangDirectOrderCollectionPort,
} from '../../in/coupang-direct-order-collection.port';

export interface CoupangDirectOrderCollectionTransactionPort
extends CoupangDirectOrderCollectionPort {}

export const COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT = Symbol(
  'COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT',
);
