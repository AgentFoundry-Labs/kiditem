import { Injectable } from '@nestjs/common';
import {
  COMPETITOR_CATALOG_KIND,
  CompetitorCatalogPlanSchema,
  CompetitorCatalogScopeSchema,
  type CompetitorCatalogResult,
} from '@kiditem/shared/advertising-operations';
import { type OperationPlanResult, type OperationStagedChunk, type OperationWindow } from '@kiditem/shared/operation';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { COMPETITOR_ENRICHMENT_LOCK_KEY } from '@kiditem/shared/advertising-operations';
import { CompetitorTrackingService } from '../../../application/service/competitor-tracking.service';
import { parseOperationScope } from './operation-scope';

/**
 * 경쟁사 카탈로그(ADR-0025 kind `advertising.competitor_catalog`, KID-362). 확장이 계획한 경쟁 판매자샵
 * (shop.coupang.com)을 최신순으로 스크롤해 읽고 `seller_catalog` 청크로 올린다. finish 트랜잭션에서 카탈로그를 그
 * 키워드의 최신 SERP 스냅샷(실행이 발행한 행)에 붙인다. 잠금은 `resource:competitor:serp-enrichment`(조직 범위 —
 * 판매자 확인과 같은 SERP 행을 고친다; 조직 잠금 `org`을 쓰는 다른 kind와는 겹치지 않는다).
 * 경쟁사 화면에서 따로(전체·판매자 하나) 시작하거나, 판매자 확인 실행이 끝나면 보강으로 이어서 시작된다.
 */
@OperationOwner()
@Injectable()
export class CompetitorCatalogOperationOwner implements OperationOwnerPort {
  readonly kind = COMPETITOR_CATALOG_KIND;

  constructor(
    private readonly competitors: CompetitorTrackingService,
  ) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = parseOperationScope(CompetitorCatalogScopeSchema, scope);
    const plan = await this.competitors.planCatalogOperation(context.organizationId, parsed);
    return { plan, lockKeys: [COMPETITOR_ENRICHMENT_LOCK_KEY] };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: CompetitorCatalogResult }> {
    const result = await this.competitors.publishCatalogOperation(context.tx, {
      organizationId: context.organizationId,
      plan: CompetitorCatalogPlanSchema.parse(context.plan),
      chunks,
    });
    return { result };
  }
}
