import { Injectable } from '@nestjs/common';
import {
  COMPETITOR_SELLER_IDENTITY_KIND,
  KEYWORD_SERP_KIND,
  KeywordSerpPlanSchema,
  KeywordSerpScopeSchema,
  keywordLockKey,
  type KeywordSerpResult,
} from '@kiditem/shared/advertising-operations';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { KeywordRankIngestHandler } from '../../../application/service/keyword-rank-ingest.handler';
import { parseOperationScope } from './operation-scope';

/**
 * 쿠팡 검색 SERP 순위(ADR-0025 kind `advertising.keyword_serp`, KID-362). 확장이 www.coupang.com 검색 결과를 키워드마다
 * 최대 3쪽 DOM으로 읽어 `keyword_serp` 청크(키워드마다 한 장)로 올린다. finish 트랜잭션에서 키워드마다 트래커를 두고
 * 자사·명시 옵션의 순위 행과 SERP 전체 스냅샷을 operationId와 함께 쓴다. 잠금은 키워드마다 순위 슬롯
 * (`resource:keyword:<kw>` — 같은 키워드의 Wing 판매순위와 겹치지 않는다). 로그인이 필요 없는 공개 검색이라 계정 잠금은 없다.
 * 성공하면 `result.next`로 그 키워드의 경쟁 판매자 확인(`advertising.competitor_seller_identity`)을 잇는다.
 */
@OperationOwner()
@Injectable()
export class KeywordSerpOperationOwner implements OperationOwnerPort {
  readonly kind = KEYWORD_SERP_KIND;

  constructor(
    private readonly serp: KeywordRankIngestHandler,
  ) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = parseOperationScope(KeywordSerpScopeSchema, scope);
    const plan = await this.serp.planSerpOperation(context.organizationId, parsed.keywords);
    return { plan, lockKeys: [...new Set(plan.keywords.map((entry) => keywordLockKey(entry.keyword)))] };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: KeywordSerpResult }> {
    const result = await this.serp.publishSerpOperation(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      plan: KeywordSerpPlanSchema.parse(context.plan),
      chunks,
    });
    // 연쇄(KID-354 규칙): 방금 발행한 키워드의 경쟁 상품 판매자 확인을 같은 환경이 이어서 시작한다(옛 batch의 afterBatch 보강).
    const next = { kind: COMPETITOR_SELLER_IDENTITY_KIND, scope: { keywords: KeywordSerpPlanSchema.parse(context.plan).keywords.map((entry) => entry.keyword) } };
    return { result: { ...result, next } };
  }
}
