import { Inject, Injectable } from '@nestjs/common';
import { resourceLockKey, type OperationPlanResult, type OperationStagedChunk, type OperationWindow } from '@kiditem/shared/operation';
import {
  OrdersCaptureResultSchema,
  SELLPIA_SHIPMENT_TRACKING_KIND,
  type OrdersCaptureResult,
} from '@kiditem/shared/orders-operations';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  ORDER_OPERATION_CAPTURE_PORT,
  type OrderOperationCapturePort,
} from '../../../application/port/in/order-operation-capture.port';
import { sellpiaTrackingCapture, sellpiaTrackingPlan } from '../../../domain/sellpia-shipment-tracking-operation';

/** 보관 캡처의 파일 이름·형식 — 옛 attempt 완료 본문과 같다(송장 화면이 그대로 읽는다). */
const CAPTURE_FILE_NAME = 'sellpia-shipment-tracking-v1.json';

/**
 * 셀피아 송장 조회(ADR-0025 kind `orders.sellpia_shipment_tracking`, KID-359 H3). 확장이 셀피아
 * `delivery_link.action.html`로 기간 안 송장을 읽어 `tracking_rows` 청크로 올리고, finish 트랜잭션에서 그 줄들을
 * 보관 캡처(`OrderCollectionArtifact.operationId`) 하나로 남긴다. 송장 업로드 화면이 실행 id로 내려받는다.
 *
 * 잠금은 `resource:sellpia:login` — 셀피아 로그인을 거쳐 읽는 kind는 모두 이 키 하나를 나눠 쥔다(셀피아 세션은
 * 조직에 로그인 하나, KID-361 2026-09-26 결정). `org` 키는 상관없는 org kind까지 막아 쓰지 않는다.
 * 원장 사실을 쓰지 않으므로 `onFailed`·실패 알림이 없다.
 */
@OperationOwner()
@Injectable()
export class SellpiaShipmentTrackingOperationOwner implements OperationOwnerPort {
  readonly kind = SELLPIA_SHIPMENT_TRACKING_KIND;

  constructor(@Inject(ORDER_OPERATION_CAPTURE_PORT) private readonly captures: OrderOperationCapturePort) {}

  async plan(scope: JsonObject): Promise<OperationPlanResult> {
    const plan = sellpiaTrackingPlan(scope);
    return {
      lockKeys: [resourceLockKey('sellpia', 'login')],
      plan: { ...plan },
      window: { start: plan.startDate, end: plan.endDate },
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: OrdersCaptureResult }> {
    const capture = sellpiaTrackingCapture(chunks, window, sellpiaTrackingPlan(context.plan));
    await this.captures.store(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      source: {
        bytes: Buffer.from(JSON.stringify(capture), 'utf8'),
        fileName: CAPTURE_FILE_NAME,
        contentType: 'application/json',
      },
    });
    return { result: OrdersCaptureResultSchema.parse({ rowCount: capture.rows.length }) };
  }
}
