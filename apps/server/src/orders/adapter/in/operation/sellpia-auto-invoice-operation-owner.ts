import { Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  SELLPIA_ACTION_LOCK_KEY,
  SELLPIA_AUTO_INVOICE_KIND,
  type SellpiaAutoInvoiceResult,
} from '@kiditem/shared/orders-action-operations';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { SellpiaInvoiceTargetsService } from '../../../application/service/sellpia-invoice-targets.service';
import {
  readSellpiaAutoInvoicePlan,
  readSellpiaInvoiceOperatorConfirmation,
  sellpiaAutoInvoicePlan,
  sellpiaAutoInvoiceResult,
  sellpiaAutoInvoiceScope,
} from '../../../domain/sellpia-auto-invoice-operation';

/**
 * 셀피아 자동송장(kind `orders.sellpia_auto_invoice`, KID-355 wave8b — 옛 워커 `sellpiaAutoInvoice`, 비가역). plan이 대상
 * (최근 24시간 성공 전송 − 이미 시도한 번호)을 얼리고, 0개면 시작하지 않는다. 확장은 그 번호만 골라 [송장번호채번]을 누른다.
 * 누른 뒤 발급 행을 못 읽으면 `reconciling` — 운영자가 채번 화면에서 본 행으로 confirm 한다. begin 실행은 `maxAttempts 1`이라
 * 임대가 끝나도 다시 claim되지 않는다(이중 채번 없음).
 */
@OperationOwner()
@Injectable()
export class SellpiaAutoInvoiceOperationOwner implements OperationOwnerPort {
  readonly kind = SELLPIA_AUTO_INVOICE_KIND;
  readonly reconciles = true as const;

  constructor(private readonly invoiceTargets: SellpiaInvoiceTargetsService) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    sellpiaAutoInvoiceScope(scope);
    const targets = await this.invoiceTargets.targets(null, { organizationId: context.organizationId, now: new Date() });
    return { lockKeys: [SELLPIA_ACTION_LOCK_KEY], plan: sellpiaAutoInvoicePlan(targets) };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: SellpiaAutoInvoiceResult }> {
    const plan = readSellpiaAutoInvoicePlan(context.plan);
    return { result: sellpiaAutoInvoiceResult(chunks, plan, readSellpiaInvoiceOperatorConfirmation(context.result)) };
  }
}
