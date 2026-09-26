import { Inject, Injectable } from '@nestjs/common';
import { SABANGNET_MALL_LISTINGS_KIND } from '@kiditem/shared/channels-operations';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  SABANGNET_MALL_LISTINGS_PORT,
  type SabangnetMallListingsPort,
} from '../../../application/port/in/sabangnet-mall-listings.port';

/**
 * 사방넷 몰 목록 kind의 owner 포트(ADR-0025, KID-363). producer는 확장 수집기
 * `collectors/channels.sabangnet_mall_listings`다. `onFailed`가 없다 — 실패는 원장에 아무것도 쓰지 않는다.
 */
@OperationOwner()
@Injectable()
export class SabangnetMallListingsOperationOwner implements OperationOwnerPort {
  readonly kind = SABANGNET_MALL_LISTINGS_KIND;
  constructor(@Inject(SABANGNET_MALL_LISTINGS_PORT) private readonly listings: SabangnetMallListingsPort) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.listings.plan(scope, context);
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    return { result: await this.listings.finalize(chunks, context) };
  }
}
