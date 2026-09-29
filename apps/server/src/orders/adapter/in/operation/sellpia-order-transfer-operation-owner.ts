import { Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import { SELLPIA_ORDER_TRANSFER_KIND, type SellpiaOrderTransferResult } from '@kiditem/shared/orders-action-operations';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { SellpiaOrderTransferService } from '../../../application/service/sellpia-order-transfer.service';
import {
  readSellpiaTransferOperatorConfirmation,
  readSellpiaTransferPlan,
  sellpiaTransferResult,
} from '../../../domain/sellpia-order-transfer-operation';

/**
 * 셀피아 주문 파일 전송(ADR-0025 kind `orders.sellpia_order_transfer`, KID-355 wave8b — 옛 워커 `sendOrderFileToSellpia`).
 * plan은 원천 실행에서 파일을 다시 만들어 대상 주문번호를 얼리고(`SellpiaOrderTransferService`), 확장은 source 라우트로 파일을
 * 받아 셀피아 주문서수집에 넣는다. 접수 확인 못 함은 `reconciling`으로 셀피아 잠금을 쥔 채 운영자 confirm/close를 기다린다
 * — 실행이 멱등 울타리다(옛 intent는 wave9 drop). 임대는 10분(한 파일 접수는 몇 분이면 끝난다).
 */
@OperationOwner()
@Injectable()
export class SellpiaOrderTransferOperationOwner implements OperationOwnerPort {
  readonly kind = SELLPIA_ORDER_TRANSFER_KIND;
  readonly leaseMs = 10 * 60 * 1000;
  readonly reconciles = true as const;

  constructor(private readonly transfers: SellpiaOrderTransferService) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.transfers.plan(context.organizationId, scope);
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: SellpiaOrderTransferResult }> {
    const plan = readSellpiaTransferPlan(context.plan);
    return { result: sellpiaTransferResult(chunks, plan, readSellpiaTransferOperatorConfirmation(context.result)) };
  }
}
