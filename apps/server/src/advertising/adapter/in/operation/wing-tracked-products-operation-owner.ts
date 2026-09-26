import { Inject, Injectable } from '@nestjs/common';
import {
  WING_TRACKED_PRODUCTS_KIND,
  WingTrackedProductsPlanSchema,
  WingTrackedProductsScopeSchema,
  type WingTrackedProductsResult,
} from '@kiditem/shared/advertising-operations';
import { accountLockKey, type OperationPlanResult, type OperationStagedChunk, type OperationWindow } from '@kiditem/shared/operation';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { WingTrackedProductService } from '../../../application/service/wing-tracked-product.service';
import { assertActiveCoupangAccount, parseOperationScope } from './operation-scope';

/**
 * 추적 상품 Wing 지표(ADR-0025 kind `advertising.wing_tracked_products`, KID-362). 확장이 그 계정의 Wing 상품등록 검색을
 * 키워드마다 끝까지 읽어 찾은 추적 상품의 28일 지표를 `wing_tracked_search` 청크(키워드마다 한 장)로 올린다. finish
 * 트랜잭션에서 계획한 추적 대상이 그대로인지 보고 그 업무일 스냅샷을 실행 ID와 함께 바꿔 쓰고 열린 실패 알림을 닫는다.
 * 최종 실패는 알림을 남긴다(옛 attempt와 같은 dedupeKey). 잠금은 계정(Wing 로그인 하나).
 */
@OperationOwner()
@Injectable()
export class WingTrackedProductsOperationOwner implements OperationOwnerPort {
  readonly kind = WING_TRACKED_PRODUCTS_KIND;

  constructor(
    private readonly trackedProducts: WingTrackedProductService,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly accounts: ChannelAccountPort,
  ) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = parseOperationScope(WingTrackedProductsScopeSchema, scope);
    await assertActiveCoupangAccount(this.accounts, context.organizationId, parsed.channelAccountId);
    const plan = await this.trackedProducts.planOperation({ organizationId: context.organizationId, ...parsed });
    return { plan, lockKeys: [accountLockKey(parsed.channelAccountId)] };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: WingTrackedProductsResult }> {
    const result = await this.trackedProducts.publishOperation(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      plan: WingTrackedProductsPlanSchema.parse(context.plan),
      chunks,
    });
    return { result };
  }
}
