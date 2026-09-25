import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { accountLockKey, type OperationPlanResult, type OperationStagedChunk, type OperationWindow } from '@kiditem/shared/operation';
import {
  COUPANG_ROCKET_PO_KIND,
  CoupangRocketPoPlanSchema,
  CoupangRocketPoResultSchema,
  CoupangRocketPoScopeSchema,
  type CoupangRocketPoResult,
} from '@kiditem/shared/orders-operations';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { ROCKET_PO_CATALOG_PORT, type RocketPoCatalogPort } from '../../../application/port/in/rocket-po-catalog.port';
import { readRocketPoChunks } from '../../../domain/rocket-po-operation';

/**
 * 쿠팡 로켓 PO 수집(ADR-0025 kind `orders.coupang_rocket_po`, KID-359). 확장이 그 계정의 supplier 화면에서 발주 목록을
 * 끝까지, 상세를 발주서마다 읽어 `po_rows`(발주서 하나 = 항목 하나)와 목록 증거 `po_scan` 하나를 올린다. finish
 * 트랜잭션에서 옛 완료 검증을 거쳐 공급자 식별 확정 → Channels 관측 식별(`lastOperationId`) → 스냅샷 순으로 발행한다.
 * 잠금은 계정(`account:<id>`) — 옛 attempt도 계정마다 하나였다. `onFailed` 없음.
 */
@OperationOwner()
@Injectable()
export class CoupangRocketPoOperationOwner implements OperationOwnerPort {
  readonly kind = COUPANG_ROCKET_PO_KIND;

  constructor(@Inject(ROCKET_PO_CATALOG_PORT) private readonly catalog: RocketPoCatalogPort) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = CoupangRocketPoScopeSchema.safeParse(scope);
    if (!parsed.success) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: {
          reason: 'invalid_scope',
          errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
        },
      });
    }
    const channelAccountId = parsed.data.channelAccountId.toLowerCase();
    const plan = await this.catalog.planOperation({ organizationId: context.organizationId, scope: { ...parsed.data, channelAccountId } });
    return {
      lockKeys: [accountLockKey(channelAccountId)],
      plan,
      window: { start: plan.from, end: plan.to },
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: CoupangRocketPoResult }> {
    const plan = CoupangRocketPoPlanSchema.parse(context.plan);
    const { rows, scan } = readRocketPoChunks(chunks);
    const published = await this.catalog.publishOperation(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      plan,
      rows,
      scan,
    });
    return { result: CoupangRocketPoResultSchema.parse(published) };
  }
}
