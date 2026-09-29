import { Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  SELLPIA_ACTION_LOCK_KEY,
  SELLPIA_POST_TRANSFER_KIND,
  type SellpiaPostTransferResult,
} from '@kiditem/shared/orders-action-operations';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { SellpiaInvoiceTargetsService } from '../../../application/service/sellpia-invoice-targets.service';
import { sellpiaPostTransferResult, sellpiaPostTransferScope } from '../../../domain/sellpia-post-transfer-operation';

/**
 * 셀피아 후처리(kind `orders.sellpia_post_transfer`, KID-355 wave8b — 옛 워커 `sellpiaPostTransfer`): 등록 → 자동합포·
 * 자동재고매칭을 화면 전체에 누른다. finalize는 단계 결과와, 웹이 자동송장 확인 문장에 쓸 대상 수를 finish 트랜잭션에서
 * 같은 대상 규칙으로 센다. 셀피아 잠금 하나를 나눠 쥔다.
 */
@OperationOwner()
@Injectable()
export class SellpiaPostTransferOperationOwner implements OperationOwnerPort {
  readonly kind = SELLPIA_POST_TRANSFER_KIND;

  constructor(private readonly invoiceTargets: SellpiaInvoiceTargetsService) {}

  async plan(scope: JsonObject): Promise<OperationPlanResult> {
    sellpiaPostTransferScope(scope);
    return { lockKeys: [SELLPIA_ACTION_LOCK_KEY], plan: {} };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: SellpiaPostTransferResult }> {
    const targets = await this.invoiceTargets.targets(context.tx, { organizationId: context.organizationId, now: new Date() });
    return { result: sellpiaPostTransferResult(chunks, targets.length) };
  }
}
