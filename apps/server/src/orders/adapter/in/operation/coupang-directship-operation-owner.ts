import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { accountLockKey, type OperationPlanResult, type OperationStagedChunk, type OperationWindow } from '@kiditem/shared/operation';
import {
  COUPANG_DIRECTSHIP_KIND,
  CoupangDirectshipPlanSchema,
  CoupangDirectshipScopeSchema,
  type CoupangDirectshipResult,
} from '@kiditem/shared/orders-operations';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT, type CoupangDirectOrderCollectionPort } from '../../../application/port/in/coupang-direct-order-collection.port';
import { assembleDirectshipCapture, parseCapture } from '../../../domain/coupang-directship-operation';

/**
 * 쿠팡 직배송 발주 캡처(ADR-0025 kind `orders.coupang_directship`, KID-359). 확장이 그 로켓 계정의 supplier 발주 화면에서
 * 발주확정 목록·센터 주소·발주별 품목을 읽어 `orders_capture` 청크(발주서 하나 또는 센터표 하나)로 올린다. finish
 * 트랜잭션에서 캡처를 `OrderCollectionArtifact`(operationId)에 보관하고 `result.rowCount`를 적을 뿐 — 원장 발행은
 * 없다(수집 완료는 하위 계산을 발행하지 않는다). 주문·워크북 대조는 성공한 실행을 운송유형별로 변환할 때다.
 * 잠금은 계정(`account:<id>`). `onFailed` 없음.
 */
@OperationOwner()
@Injectable()
export class CoupangDirectshipOperationOwner implements OperationOwnerPort {
  readonly kind = COUPANG_DIRECTSHIP_KIND;

  constructor(@Inject(COUPANG_DIRECT_ORDER_COLLECTION_PORT) private readonly directship: CoupangDirectOrderCollectionPort) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = CoupangDirectshipScopeSchema.safeParse(scope);
    if (!parsed.success) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: {
          reason: 'invalid_scope',
          errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
        },
      });
    }
    const plan = await this.directship.planOperation({ organizationId: context.organizationId, channelAccountId: parsed.data.channelAccountId });
    return { lockKeys: [accountLockKey(plan.channelAccountId)], plan };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: CoupangDirectshipResult }> {
    const plan = CoupangDirectshipPlanSchema.parse(context.plan);
    const capture = parseCapture(assembleDirectshipCapture(chunks, plan.channelAccountId));
    const result = await this.directship.publishCapture(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      capture,
    });
    return { result };
  }
}
