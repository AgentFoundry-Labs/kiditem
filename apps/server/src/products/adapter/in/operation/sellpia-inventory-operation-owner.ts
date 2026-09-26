import { Inject, Injectable } from '@nestjs/common';
import { KiditemPreconditionError } from '@kiditem/shared/errors';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  SELLPIA_INVENTORY_KIND,
  SELLPIA_LOGIN_LOCK_KEY,
  type SellpiaInventoryResult,
} from '@kiditem/shared/sellpia-operations';
import type {
  JsonObject,
  OperationFailedContext,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  SELLPIA_INVENTORY_PUBLICATION_PORT,
  type SellpiaInventoryPublicationPort,
} from '../../../application/port/in/sellpia-inventory-publication.port';
import {
  SELLPIA_SOURCE_ACCOUNT_PORT,
  type SellpiaSourceAccountPort,
} from '../../../application/port/in/sellpia-source-account.port';
import {
  sellpiaInventoryPlan,
  sellpiaInventorySnapshot,
  storedSellpiaInventoryPlan,
} from '../../../domain/sellpia-inventory-operation';

/**
 * 셀피아 재고(ADR-0025 kind `products.sellpia_inventory`, KID-361 J1). 확장이 셀피아 상품 목록 전체를 읽어
 * `inventory_rows` 청크(머리 하나 + 상품 줄)로 올리고, finish 트랜잭션에서 MasterProduct를 통째로 발행한다.
 * 잠금은 `resource:sellpia:login` — 셀피아 로그인을 쓰는 kind는 모두 이 키 하나를 나눠 쥔다(KID-361 결정).
 * 계정 연결을 확인하지 않은 조직은 시작하지 못한다(옛 begin과 같다). 최종 실패는 원천 알림 하나로 남긴다.
 */
@OperationOwner()
@Injectable()
export class SellpiaInventoryOperationOwner implements OperationOwnerPort {
  readonly kind = SELLPIA_INVENTORY_KIND;

  constructor(
    @Inject(SELLPIA_INVENTORY_PUBLICATION_PORT) private readonly publication: SellpiaInventoryPublicationPort,
    @Inject(SELLPIA_SOURCE_ACCOUNT_PORT) private readonly account: SellpiaSourceAccountPort,
  ) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const plan = sellpiaInventoryPlan(scope);
    if (!await this.account.isSourceBindingConfirmed(context.organizationId)) {
      throw new KiditemPreconditionError('PRODUCTS_SELLPIA_BINDING_REQUIRED');
    }
    return { lockKeys: [SELLPIA_LOGIN_LOCK_KEY], plan: { ...plan } };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: SellpiaInventoryResult }> {
    const plan = storedSellpiaInventoryPlan(context.plan);
    const result = await this.publication.publish(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      trigger: plan.trigger,
      snapshot: sellpiaInventorySnapshot(chunks),
    });
    return { result };
  }

  onFailed(context: OperationFailedContext): Promise<void> {
    return this.publication.recordFailure(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      errorCode: context.errorCode,
      errorMessage: context.errorMessage,
    });
  }
}
