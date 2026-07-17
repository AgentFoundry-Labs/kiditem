import { Inject, Injectable } from '@nestjs/common';
import type { RocketFinalOrderReconciliationPort } from '../port/in/procurement/rocket-final-order-reconciliation.port';
import {
  ROCKET_FINAL_ORDER_RECONCILIATION_TRANSACTION_PORT,
  type RocketFinalOrderReconciliationTransactionPort,
} from '../port/out/transaction/rocket-final-order-reconciliation.transaction.port';

@Injectable()
export class RocketFinalOrderReconciliationService
implements RocketFinalOrderReconciliationPort {
  constructor(
    @Inject(ROCKET_FINAL_ORDER_RECONCILIATION_TRANSACTION_PORT)
    private readonly transactions: RocketFinalOrderReconciliationTransactionPort,
  ) {}

  reconcile(
    input: Parameters<RocketFinalOrderReconciliationPort['reconcile']>[0],
  ) {
    return this.transactions.reconcile(input);
  }
}
