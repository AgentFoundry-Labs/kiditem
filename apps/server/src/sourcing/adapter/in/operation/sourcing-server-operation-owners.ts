import { Inject, Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import { SOURCING_OPERATION_KINDS, type SourcingServerKind } from '@kiditem/shared/sourcing-operation';
import type {
  JsonObject,
  OperationFailedContext,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  SOURCING_SERVER_OPERATION_PORT,
  type SourcingServerOperationPort,
} from '../../../application/port/in/sourcing-server-operation.port';

/** 옛 서버 구동 attempt의 만료(15분)를 그대로 임대로 둔다. */
const SOURCING_SERVER_LEASE_MS = 15 * 60_000;

/**
 * 서버 구동 소싱 kind 8개의 owner 포트(ADR-0025, KID-389). 서버가 요청 안에서 begin·청크·finish하는 kind라
 * HTTP 문은 begin·claim을 거절한다(`serverDriven`). 일은 모두 `SourcingServerOperationPort`에 있다.
 */
abstract class SourcingServerOperationOwner implements OperationOwnerPort {
  abstract readonly kind: SourcingServerKind;
  readonly serverDriven = true as const;
  readonly leaseMs = SOURCING_SERVER_LEASE_MS;
  constructor(@Inject(SOURCING_SERVER_OPERATION_PORT) private readonly sourcing: SourcingServerOperationPort) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.sourcing.plan(this.kind, scope, context);
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    return { result: { ...(await this.sourcing.finalize(this.kind, chunks, context)) } };
  }

  onFailed(context: OperationFailedContext): Promise<void> {
    return this.sourcing.onFailed(this.kind, context);
  }
}

@OperationOwner()
@Injectable()
export class SourcingNaverTrendOperationOwner extends SourcingServerOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.naverTrend;
}

@OperationOwner()
@Injectable()
export class SourcingShortstrendTrendOperationOwner extends SourcingServerOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.shortstrendTrend;
}

@OperationOwner()
@Injectable()
export class SourcingTaobaoLiveOperationOwner extends SourcingServerOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.taobaoLive;
}

@OperationOwner()
@Injectable()
export class SourcingMarketShadowOperationOwner extends SourcingServerOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.marketShadow;
}

@OperationOwner()
@Injectable()
export class SourcingNaverKeywordAnalysisOperationOwner extends SourcingServerOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.naverKeywordAnalysis;
}

@OperationOwner()
@Injectable()
export class SourcingKeywordSearch1688OperationOwner extends SourcingServerOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.keywordSearch1688;
}

@OperationOwner()
@Injectable()
export class SourcingImageSearch1688OperationOwner extends SourcingServerOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.imageSearch1688;
}

@OperationOwner()
@Injectable()
export class SourcingScrapeUrlOperationOwner extends SourcingServerOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.scrapeUrl;
}

export const SOURCING_SERVER_OPERATION_OWNERS = [
  SourcingNaverTrendOperationOwner,
  SourcingShortstrendTrendOperationOwner,
  SourcingTaobaoLiveOperationOwner,
  SourcingMarketShadowOperationOwner,
  SourcingNaverKeywordAnalysisOperationOwner,
  SourcingKeywordSearch1688OperationOwner,
  SourcingImageSearch1688OperationOwner,
  SourcingScrapeUrlOperationOwner,
] as const;
