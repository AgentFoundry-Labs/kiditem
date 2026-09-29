import { Inject, Injectable } from '@nestjs/common';
import { SELLPIA_INVOICE_TARGET_TTL_MS } from '@kiditem/shared/orders-action-operations';
import type { OwnerTransaction } from '../../../common/owner-transaction';
import {
  SELLPIA_ACTION_OUTCOMES_PORT,
  type SellpiaActionOutcomesPort,
} from '../port/out/persistence/sellpia-action-outcomes.port';
import { sellpiaInvoiceIssued, sellpiaTransferAccepted } from '../../domain/sellpia-auto-invoice-operation';
import { sellpiaInvoiceTargets } from '../../domain/sellpia-invoice-targets';

/**
 * 셀피아 자동송장 대상(KID-355 wave8b): 최근 24시간 성공 전송의 받아들여진 번호 − 그 전송 뒤에 끝난 성공 송장 실행이 실제 발급한 번호.
 * 자동송장 plan(새 읽기)과 후처리 finalize(finish 트랜잭션)가 같은 규칙을 쓴다. 송장이 전송보다 늦게 끝나므로 송장 result도
 * 같은 24시간 창에서 읽으면 충분하다.
 */
@Injectable()
export class SellpiaInvoiceTargetsService {
  constructor(@Inject(SELLPIA_ACTION_OUTCOMES_PORT) private readonly outcomes: SellpiaActionOutcomesPort) {}

  async targets(transaction: OwnerTransaction | null, input: { organizationId: string; now: Date }): Promise<string[]> {
    const since = new Date(input.now.getTime() - SELLPIA_INVOICE_TARGET_TTL_MS);
    const read = await this.outcomes.readSince(transaction, { organizationId: input.organizationId, since });
    return sellpiaInvoiceTargets({
      now: input.now,
      transfers: read.transfers.flatMap((row) => sellpiaTransferAccepted(row.result, row.finishedAt) ?? []),
      invoices: read.invoices.flatMap((row) => sellpiaInvoiceIssued(row.result, row.finishedAt) ?? []),
    });
  }
}
