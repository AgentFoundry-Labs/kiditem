import { Inject, Injectable } from '@nestjs/common';
import { MALL_ADMIN_LISTINGS_KIND } from '@kiditem/shared/channels-operations';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  MALL_ADMIN_LISTINGS_OPERATION_PORT,
  type MallAdminListingsOperationPort,
} from '../../../application/port/in/mall-admin-listings-operation.port';

/**
 * 몰 관리자 목록 kind의 owner 포트(ADR-0025, KID-363, 1차 몰 넷). producer는 확장 수집기
 * `collectors/channels.mall_admin_listings`다. `onFailed`가 없다 — 실패는 원장에 아무것도 쓰지 않는다.
 */
@OperationOwner()
@Injectable()
export class MallAdminListingsOperationOwner implements OperationOwnerPort {
  readonly kind = MALL_ADMIN_LISTINGS_KIND;
  constructor(@Inject(MALL_ADMIN_LISTINGS_OPERATION_PORT) private readonly listings: MallAdminListingsOperationPort) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.listings.plan(scope, context);
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    return { result: await this.listings.finalize(chunks, context) };
  }
}
