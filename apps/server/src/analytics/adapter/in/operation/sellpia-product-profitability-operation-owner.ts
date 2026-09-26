import { Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  SELLPIA_LOGIN_LOCK_KEY,
  SELLPIA_PRODUCT_PROFITABILITY_KIND,
  type SellpiaProductProfitabilityResult,
} from '@kiditem/shared/sellpia-operations';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  sellpiaProfitabilityPlan,
  sellpiaProfitabilitySubmission,
  storedSellpiaProfitabilityPlan,
} from '../../../sellpia-product-sales/domain/sellpia-profitability-operation';
import { SellpiaProfitabilityPublicationRepository } from '../../../sellpia-product-sales/sellpia-profitability-publication.repository';

/**
 * 셀피아 상품 손익(ADR-0025 kind `analytics.sellpia_product_profitability`, KID-361 J3). 확장이 이익현황
 * (`stat_prd_profit`)을 어제까지 401일 판매 창 + 달마다의 구매기간으로 읽어 상품 하나씩 `profit_months` 청크로 올리고,
 * finish 트랜잭션에서 불변 월 사실 한 벌(실행 id = 세대)을 넣는다. ABC는 발행하지 않는다(명시 명령만).
 * 잠금은 셀피아 로그인 하나(`resource:sellpia:login`). 최종 실패는 실행 행에만 남는다(알림 reader가 읽는다, KID-355 정책 B).
 */
@OperationOwner()
@Injectable()
export class SellpiaProductProfitabilityOperationOwner implements OperationOwnerPort {
  readonly kind = SELLPIA_PRODUCT_PROFITABILITY_KIND;

  constructor(private readonly publication: SellpiaProfitabilityPublicationRepository) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const mappingGeneration = await this.publication.currentMappingGeneration(context.organizationId);
    const plan = sellpiaProfitabilityPlan(scope, new Date(), mappingGeneration);
    return {
      lockKeys: [SELLPIA_LOGIN_LOCK_KEY],
      plan: { ...plan },
      window: { start: plan.from, end: plan.to },
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: SellpiaProductProfitabilityResult }> {
    const plan = storedSellpiaProfitabilityPlan(context.plan);
    const submission = sellpiaProfitabilitySubmission(chunks, plan);
    const result = await this.publication.publish(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      plan,
      ...submission,
    });
    return { result };
  }
}
