import type {
  RocketFinalOrderReconciliationPort,
} from '../../in/procurement/rocket-final-order-reconciliation.port';

export interface RocketFinalOrderReconciliationTransactionPort
extends RocketFinalOrderReconciliationPort {}

export const ROCKET_FINAL_ORDER_RECONCILIATION_TRANSACTION_PORT = Symbol(
  'ROCKET_FINAL_ORDER_RECONCILIATION_TRANSACTION_PORT',
);
