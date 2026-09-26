import { Inject, Injectable } from '@nestjs/common';
import {
  COMPETITOR_SELLER_IDENTITY_KIND,
  CompetitorSellerIdentityPlanSchema,
  CompetitorSellerIdentityScopeSchema,
  type CompetitorSellerIdentityResult,
} from '@kiditem/shared/advertising-operations';
import { ORG_LOCK_KEY, type OperationPlanResult, type OperationStagedChunk, type OperationWindow } from '@kiditem/shared/operation';
import type {
  JsonObject,
  OperationFailedContext,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  ADVERTISING_SOURCE_ALERT_PORT,
  type AdvertisingSourceAlert,
  type AdvertisingSourceAlertPort,
} from '../../../application/port/out/repository/advertising-source-alert.port';
import { CompetitorTrackingService } from '../../../application/service/competitor-tracking.service';
import { failureMessage, parseOperationScope } from './operation-scope';

const ALERT: AdvertisingSourceAlert = {
  sourceType: 'coupang_competitor_seller_identity',
  dedupeKey: 'source:coupang_competitor_seller_identity',
  title: '쿠팡 판매자 확인 실패',
  href: '/rank-tracking',
};

/**
 * 경쟁 판매자 확인(ADR-0025 kind `advertising.competitor_seller_identity`, KID-362). 확장이 계획한 경쟁 상품의 상세
 * (www.coupang.com/vp/products)를 열어 판매자 상점 링크를 읽고 `seller_identity` 청크로 올린다. finish 트랜잭션에서 그
 * 키워드의 최신 SERP 스냅샷(실행이 발행한 행) 상품에 판매자를 적는다. 잠금은 조직(경쟁사 카탈로그와 같은 SERP 행을
 * 고치므로 한 번에 하나). 웹에서 따로 시작할 수도 있고, SERP 순위 실행이 끝나면 그 키워드로 이어서 시작된다.
 */
@OperationOwner()
@Injectable()
export class CompetitorSellerIdentityOperationOwner implements OperationOwnerPort {
  readonly kind = COMPETITOR_SELLER_IDENTITY_KIND;

  constructor(
    private readonly competitors: CompetitorTrackingService,
    @Inject(ADVERTISING_SOURCE_ALERT_PORT) private readonly alerts: AdvertisingSourceAlertPort,
  ) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = parseOperationScope(CompetitorSellerIdentityScopeSchema, scope);
    const plan = await this.competitors.planSellerIdentityOperation(context.organizationId, parsed.keywords);
    return { plan, lockKeys: [ORG_LOCK_KEY] };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: CompetitorSellerIdentityResult }> {
    const result = await this.competitors.publishSellerIdentityOperation(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      plan: CompetitorSellerIdentityPlanSchema.parse(context.plan),
      chunks,
    });
    await this.alerts.resolve(context.tx, { organizationId: context.organizationId, operationId: context.operationId, alert: ALERT });
    return { result };
  }

  onFailed(context: OperationFailedContext): Promise<void> {
    return this.alerts.recordFailure(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      alert: ALERT,
      code: context.errorCode,
      message: failureMessage(context, ALERT.sourceType),
    });
  }
}
