import { Injectable } from '@nestjs/common';
import { SELLPIA_AUTO_INVOICE_KIND, SELLPIA_ORDER_TRANSFER_KIND } from '@kiditem/shared/orders-action-operations';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { readSucceededOperationResults } from '../../../../common/operation/transaction/succeeded-operation-results';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SellpiaActionOutcome,
  SellpiaActionOutcomesPort,
} from '../../../application/port/out/persistence/sellpia-action-outcomes.port';

/** 실행 표는 계약 모듈의 리더(`readSucceededOperationResults`)로만 읽는다(ADR-0025, `check:operation-owner-boundary`). */
@Injectable()
export class SellpiaActionOutcomesPersistenceAdapter implements SellpiaActionOutcomesPort {
  constructor(private readonly prisma: PrismaService) {}

  async readSince(transaction: OwnerTransaction | null, input: { organizationId: string; since: Date }) {
    const client = transaction ? ownerTransactionClient(transaction) : this.prisma;
    const rows = await readSucceededOperationResults(client, {
      organizationId: input.organizationId,
      kinds: [SELLPIA_ORDER_TRANSFER_KIND, SELLPIA_AUTO_INVOICE_KIND],
      since: input.since,
    });
    const pick = (kind: string): SellpiaActionOutcome[] =>
      rows.filter((row) => row.kind === kind).map((row) => ({ result: row.result, finishedAt: row.finishedAt }));
    return { transfers: pick(SELLPIA_ORDER_TRANSFER_KIND), invoices: pick(SELLPIA_AUTO_INVOICE_KIND) };
  }
}
