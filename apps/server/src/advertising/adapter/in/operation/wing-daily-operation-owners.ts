import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { businessDateKey } from '@kiditem/shared/common';
import { accountLockKey, type OperationPlanResult, type OperationStagedChunk } from '@kiditem/shared/operation';
import {
  WING_ITEMWINNER_KIND,
  WingItemwinnerResultSchema,
  WingItemwinnerScopeSchema,
  wingDailyLockKey,
  type WingItemwinnerResult,
} from '@kiditem/shared/advertising-operations';
import { z } from 'zod';
import type {
  JsonObject,
  OperationFailedContext,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { currentBusinessDate } from '../../../domain/business-date';
import { completeWingItemwinner, wingItemwinnerKpis } from '../../../domain/wing-itemwinner-operation';
import {
  WING_ITEMWINNER_OPERATION_REPOSITORY_PORT,
  type WingItemwinnerOperationRepositoryPort,
} from '../../../application/port/out/repository/wing-itemwinner-operation.repository.port';

const WingItemwinnerPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  businessDate: z.string().date(),
}).strict();

/**
 * Wing 아이템위너(ADR-0025 kind `advertising.wing_itemwinner`, KID-362). 확장이 서비스워커에서 Wing
 * `getProductList`를 한 번 읽어 `itemwinner_rows` 청크와 `itemwinner_page` 표식을 올린다. finish 트랜잭션에서
 * 완결을 확인하고 그날 listing·option 일별 행의 위너 열을 실행 id와 함께 upsert한다. `onFailed` 없음.
 * 잠금: 계정 로그인(`account:`) + Wing 일별 사실(`resource:wing-daily:`, 트래픽 kind와 같은 키).
 */
@OperationOwner()
@Injectable()
export class WingItemwinnerOperationOwner implements OperationOwnerPort {
  readonly kind = WING_ITEMWINNER_KIND;

  constructor(
    @Inject(WING_ITEMWINNER_OPERATION_REPOSITORY_PORT)
    private readonly repository: WingItemwinnerOperationRepositoryPort,
  ) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = parse(WingItemwinnerScopeSchema, scope, 'invalid_scope');
    const channelAccountId = parsed.channelAccountId.toLowerCase();
    if (!(await this.repository.isActiveCoupangAccount(context.organizationId, channelAccountId))) {
      throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND');
    }
    const businessDate = businessDateKey(currentBusinessDate());
    return {
      lockKeys: [accountLockKey(channelAccountId), wingDailyLockKey(channelAccountId)],
      plan: { channelAccountId, businessDate },
      window: { start: businessDate, end: businessDate },
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: unknown,
    context: OperationFinalizeContext,
  ): Promise<{ result: WingItemwinnerResult }> {
    const plan = WingItemwinnerPlanSchema.parse(context.plan);
    const { rows, observedAt } = completeWingItemwinner(chunks, plan.businessDate);
    if (!(await this.repository.isActiveCoupangAccount(context.organizationId, plan.channelAccountId, context.tx))) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'account_changed', channelAccountId: plan.channelAccountId } });
    }
    const published = await this.repository.publish(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      channelAccountId: plan.channelAccountId,
      businessDate: plan.businessDate,
      observedAt: new Date(observedAt),
      rows,
    });
    await this.repository.resolveFailure(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      channelAccountId: plan.channelAccountId,
    });
    return {
      result: WingItemwinnerResultSchema.parse({
        channelAccountId: plan.channelAccountId,
        businessDate: plan.businessDate,
        observedAt,
        rowCount: rows.length,
        matchedCount: published.matchedCount,
        unmatchedCount: rows.length - published.matchedCount,
        kpis: wingItemwinnerKpis(rows),
        listingObservations: published.listingObservations,
      }),
    };
  }

  /** 최종 실패는 계정의 원천 실패 알림으로 남는다(옛 attempt와 같다; 취소는 계약이 부르지 않는다). */
  async onFailed(context: OperationFailedContext): Promise<void> {
    const plan = WingItemwinnerPlanSchema.parse(context.plan);
    await this.repository.recordFailure(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      channelAccountId: plan.channelAccountId,
      errorCode: context.errorCode,
      errorMessage: context.errorMessage,
    });
  }
}

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown, reason: string): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new KiditemInvalidValueError('VALIDATION_FAILED', {
    details: { reason, errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })) },
  });
}
