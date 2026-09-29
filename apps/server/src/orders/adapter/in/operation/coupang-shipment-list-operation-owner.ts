import { Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  COUPANG_SHIPMENT_LIST_KIND,
  COUPANG_SUPPLIER_LOGIN_LOCK_KEY,
  type CoupangShipmentListResult,
} from '@kiditem/shared/orders-action-operations';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  coupangShipmentListPlan,
  coupangShipmentListResult,
  readCoupangShipmentListPlan,
} from '../../../domain/coupang-shipment-list-operation';

/**
 * 쿠팡 배송 목록(kind `orders.coupang_shipment_list`, KID-355 wave8b — 옛 워커 `collectCoupangShipmentList`, 읽기). 공급사
 * 택배 목록에서 발송일 하나의 쉽먼트 행을 result로 남긴다(웹이 seq·center로 PDF 묶음을 받는다). 잠금은 공급사 로그인 —
 * 로그인 자격은 쿠팡 쉽먼트 발송일 조회와 같이 begin의 lease로만 온다. 원장 사실은 쓰지 않는다.
 */
@OperationOwner()
@Injectable()
export class CoupangShipmentListOperationOwner implements OperationOwnerPort {
  readonly kind = COUPANG_SHIPMENT_LIST_KIND;

  async plan(scope: JsonObject): Promise<OperationPlanResult> {
    const plan = coupangShipmentListPlan(scope);
    return { lockKeys: [COUPANG_SUPPLIER_LOGIN_LOCK_KEY], plan: { ...plan } };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: CoupangShipmentListResult }> {
    return { result: coupangShipmentListResult(chunks, readCoupangShipmentListPlan(context.plan), context.result ?? null) };
  }
}
