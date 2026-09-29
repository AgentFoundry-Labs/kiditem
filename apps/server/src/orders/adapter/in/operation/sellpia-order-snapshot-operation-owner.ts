import { Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  SELLPIA_ACTION_LOCK_KEY,
  SELLPIA_ORDER_SNAPSHOT_KIND,
  type SellpiaOrderSnapshotResult,
} from '@kiditem/shared/orders-action-operations';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { sellpiaOrderSnapshotResult, sellpiaOrderSnapshotScope } from '../../../domain/sellpia-order-snapshot-operation';

/**
 * 셀피아 주문 스냅샷(kind `orders.sellpia_order_snapshot`, KID-355 wave8b — 옛 워커 `collectSellpiaOrderSnapshot`, 읽기).
 * 대기목록·재고매칭 두 화면의 주문을 result로 남긴다(웹이 브라우저 수집 기록과 대조). 원장 사실은 쓰지 않는다.
 */
@OperationOwner()
@Injectable()
export class SellpiaOrderSnapshotOperationOwner implements OperationOwnerPort {
  readonly kind = SELLPIA_ORDER_SNAPSHOT_KIND;

  async plan(scope: JsonObject): Promise<OperationPlanResult> {
    sellpiaOrderSnapshotScope(scope);
    return { lockKeys: [SELLPIA_ACTION_LOCK_KEY], plan: {} };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: SellpiaOrderSnapshotResult }> {
    return { result: sellpiaOrderSnapshotResult(chunks, context.result ?? null) };
  }
}
