import { Inject, Injectable } from '@nestjs/common';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import { SOURCING_OPERATION_KINDS, type SourcingExtensionKind } from '@kiditem/shared/sourcing-operation';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  SOURCING_EXTENSION_OPERATION_PORT,
  type SourcingExtensionOperationPort,
} from '../../../application/port/in/sourcing-extension-operation.port';

/**
 * 확장 구동 소싱 kind 6종의 owner 포트(ADR-0025, KID-360). 일은 모두 `SourcingExtensionOperationPort`에 있고
 * 여기는 kind마다 계약에 거는 자리다. 최종 실패는 실행 행에만 남는다(알림 reader가 읽는다, KID-355 정책 B).
 */
abstract class SourcingExtensionOperationOwner implements OperationOwnerPort {
  abstract readonly kind: SourcingExtensionKind;
  constructor(@Inject(SOURCING_EXTENSION_OPERATION_PORT) private readonly sourcing: SourcingExtensionOperationPort) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.sourcing.plan(this.kind, scope, context);
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    return { result: { ...(await this.sourcing.finalize(this.kind, chunks, context)) } };
  }
}

@OperationOwner()
@Injectable()
export class SourcingWingCatalogOperationOwner extends SourcingExtensionOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.wingCatalog;
}

@OperationOwner()
@Injectable()
export class SourcingCoupangKeywordSuggestionOperationOwner extends SourcingExtensionOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.coupangKeywordSuggestion;
}

@OperationOwner()
@Injectable()
export class SourcingTrend1688OperationOwner extends SourcingExtensionOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.trend1688;
}

@OperationOwner()
@Injectable()
export class SourcingLiveCommerceOperationOwner extends SourcingExtensionOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.liveCommerce;
}

@OperationOwner()
@Injectable()
export class SourcingTiktokCreativeOperationOwner extends SourcingExtensionOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.tiktokCreative;
}

@OperationOwner()
@Injectable()
export class SourcingProductExtensionOperationOwner extends SourcingExtensionOperationOwner {
  readonly kind = SOURCING_OPERATION_KINDS.productExtension;
}

export const SOURCING_EXTENSION_OPERATION_OWNERS = [
  SourcingWingCatalogOperationOwner,
  SourcingCoupangKeywordSuggestionOperationOwner,
  SourcingTrend1688OperationOwner,
  SourcingLiveCommerceOperationOwner,
  SourcingTiktokCreativeOperationOwner,
  SourcingProductExtensionOperationOwner,
] as const;
