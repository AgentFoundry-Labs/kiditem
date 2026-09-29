import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { accountLockKey, type OperationPlanResult, type OperationStagedChunk, type OperationWindow } from '@kiditem/shared/operation';
import {
  MALL_TRACKING_UPLOAD_KIND,
  MallTrackingUploadPlanSchema,
  type MallTrackingUploadResult,
} from '@kiditem/shared/orders-action-operations';
import { SELLPIA_SHIPMENT_TRACKING_KIND } from '@kiditem/shared/orders-operations';
import { z } from 'zod';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  ORDER_OPERATION_CAPTURE_PORT,
  type OrderOperationCapturePort,
} from '../../../application/port/in/order-operation-capture.port';
import {
  ORDER_MALL_ACCOUNT_PORT,
  type OrderMallAccountPort,
} from '../../../application/port/out/persistence/order-mall-account.port';
import {
  mallTrackingUploadResult,
  mallTrackingUploadRows,
  mallTrackingUploadScope,
  readMallTrackingOperatorConfirmation,
  readMallTrackingUploadPlan,
} from '../../../domain/mall-tracking-upload-operation';
import { parseActionInput } from '../../../domain/orders-action-operation-input';
import { SellpiaTrackingRowSchema } from '../../../domain/sellpia-shipment-tracking-operation';

const TrackingCaptureSchema = z.object({ rows: z.array(SellpiaTrackingRowSchema) }).passthrough();

/**
 * 몰 송장 업로드(kind `orders.mall_tracking_upload`, KID-355 wave8b — 옛 워커 `uploadOnchTracking`·`uploadKidkidsTracking`,
 * 몰 쓰기). plan이 이 조직의 성공한 셀피아 송장 조회 실행 캡처에서 그 몰 판매처 행만 골라 얼린다. 몰 차이(온채널 행별 POST,
 * 키드키즈 체크박스 + 출고확정 한 번)는 확장 site 어댑터에 있고, 제출만 확인된 키드키즈는 `reconciling` → 운영자 confirm/close.
 * 잠금은 그 몰 계정(`account:<channelAccountId>`) — 같은 몰 로그인은 한 실행만.
 */
@OperationOwner()
@Injectable()
export class MallTrackingUploadOperationOwner implements OperationOwnerPort {
  readonly kind = MALL_TRACKING_UPLOAD_KIND;
  readonly reconciles = true as const;

  constructor(
    @Inject(ORDER_OPERATION_CAPTURE_PORT) private readonly captures: OrderOperationCapturePort,
    @Inject(ORDER_MALL_ACCOUNT_PORT) private readonly accounts: OrderMallAccountPort,
  ) {}

  async plan(rawScope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const scope = mallTrackingUploadScope(rawScope);
    const account = await this.accounts.resolveMallAccount({ organizationId: context.organizationId, mallKey: scope.mallKey });
    if (!account || account.channelAccountId.toLowerCase() !== scope.channelAccountId.toLowerCase()) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: { reason: 'mall_account_mismatch', mallKey: scope.mallKey, channelAccountId: scope.channelAccountId },
      });
    }
    const { capture } = await this.captures.readSucceeded({
      organizationId: context.organizationId,
      operationId: scope.trackingOperationId,
      kind: SELLPIA_SHIPMENT_TRACKING_KIND,
    });
    const tracking = parseActionInput(TrackingCaptureSchema, JSON.parse(capture.bytes.toString('utf8')), 'invalid_tracking_capture');
    const plan = MallTrackingUploadPlanSchema.parse({
      channelAccountId: account.channelAccountId,
      mallKey: scope.mallKey,
      trackingOperationId: scope.trackingOperationId,
      rows: mallTrackingUploadRows(tracking.rows, scope.mallKey),
    });
    return { lockKeys: [accountLockKey(plan.channelAccountId)], plan };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: MallTrackingUploadResult }> {
    const plan = readMallTrackingUploadPlan(context.plan);
    return { result: mallTrackingUploadResult(chunks, plan, readMallTrackingOperatorConfirmation(context.result)) };
  }
}
