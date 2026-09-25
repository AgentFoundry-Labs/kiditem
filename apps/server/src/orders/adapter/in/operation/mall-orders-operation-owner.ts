import { Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import { MALL_ORDERS_KIND, type MallOrdersResult } from '@kiditem/shared/orders-operations';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { MallOrdersOperationService } from '../../../application/service/mall-orders-operation.service';

/**
 * 몰 주문 수집(ADR-0025 kind `orders.mall_orders`, KID-359 H3)의 owner 포트. 계획·보관·주문 수 규칙은
 * `MallOrdersOperationService`에 있다. 원장 사실은 쓰지 않으므로(보관 캡처와 result만) `onFailed`·실패 알림이 없다.
 */
@OperationOwner()
@Injectable()
export class MallOrdersOperationOwner implements OperationOwnerPort {
  readonly kind = MALL_ORDERS_KIND;

  constructor(private readonly mallOrders: MallOrdersOperationService) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.mallOrders.plan(context.organizationId, scope);
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: MallOrdersResult }> {
    return { result: await this.mallOrders.finalize(context.tx, context, chunks) };
  }
}
