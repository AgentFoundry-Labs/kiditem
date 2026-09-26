import { Inject, Injectable } from '@nestjs/common';
import {
  WING_RANK_KIND,
  WingRankPlanSchema,
  WingRankScopeSchema,
  keywordLockKey,
  type WingRankResult,
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
import { WingSalesRankIngestHandler } from '../../../application/service/wing-sales-rank-ingest.handler';
import { assertActiveCoupangAccount, parseOperationScope } from './operation-scope';

/**
 * Wing 판매순위(ADR-0025 kind `advertising.wing_rank`, KID-362). 확장이 그 계정의 Wing 상품등록 검색을 계획한 키워드마다
 * 끝까지 읽어 28일 판매량순 결과를 `wing_rank_keyword` 청크(키워드마다 한 장)로 올린다. finish 트랜잭션에서 키워드마다
 * 그날 자사 상품 판매순위를 operationId와 함께 바꿔 쓴다. 잠금은 계정(Wing 로그인 하나) + 키워드마다 순위 슬롯
 * (`resource:keyword:<kw>` — 같은 키워드의 SERP 순위와 겹치지 않는다).
 */
@OperationOwner()
@Injectable()
export class WingRankOperationOwner implements OperationOwnerPort {
  readonly kind = WING_RANK_KIND;

  constructor(
    private readonly wingRank: WingSalesRankIngestHandler,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly accounts: ChannelAccountPort,
  ) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = parseOperationScope(WingRankScopeSchema, scope);
    await assertActiveCoupangAccount(this.accounts, context.organizationId, parsed.channelAccountId);
    const plan = await this.wingRank.planOperation({ organizationId: context.organizationId, ...parsed });
    return {
      plan,
      lockKeys: [accountLockKey(plan.channelAccountId), ...new Set(plan.keywords.map((entry) => keywordLockKey(entry.keyword)))],
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: WingRankResult }> {
    const result = await this.wingRank.publishOperation(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      plan: WingRankPlanSchema.parse(context.plan),
      chunks,
    });
    return { result };
  }
}
