import { Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  SELLPIA_LOGIN_LOCK_KEY,
  SELLPIA_SALES_KIND,
  type SellpiaSalesResult,
} from '@kiditem/shared/sellpia-operations';
import type {
  JsonObject,
  OperationFailedContext,
  OperationFinalizeContext,
  OperationOwnerPort,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  sellpiaSalesPlan,
  sellpiaSalesPublication,
  storedSellpiaSalesPlan,
} from '../../../sellpia-sales/domain/sellpia-sales-operation';
import { SellpiaSalesPublicationRepository } from '../../../sellpia-sales/sellpia-sales-publication.repository';

/**
 * 셀피아 매출(ADR-0025 kind `analytics.sellpia_sales`, KID-361 J2). 확장이 판매현황(`order_search.ajax.html`,
 * 주문일자 기준)을 판매처·일 줄로 올리고, finish 트랜잭션에서 창 안의 원장 줄을 바꿔 쓴다. 창은 plan 범위(기본 오늘까지
 * 93일, 100일 이하)다. 잠금은 셀피아 로그인 하나(`resource:sellpia:login`). 최종 실패는 원천 알림 하나로 남긴다.
 */
@OperationOwner()
@Injectable()
export class SellpiaSalesOperationOwner implements OperationOwnerPort {
  readonly kind = SELLPIA_SALES_KIND;

  constructor(private readonly publication: SellpiaSalesPublicationRepository) {}

  async plan(scope: JsonObject): Promise<OperationPlanResult> {
    const plan = sellpiaSalesPlan(scope, new Date());
    return {
      lockKeys: [SELLPIA_LOGIN_LOCK_KEY],
      plan: { ...plan },
      window: { start: plan.range.from, end: plan.range.to },
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: SellpiaSalesResult }> {
    const publication = sellpiaSalesPublication(chunks, window, storedSellpiaSalesPlan(context.plan));
    const result = await this.publication.replaceWindow(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      ...publication,
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
