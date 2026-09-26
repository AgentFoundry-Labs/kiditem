import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { businessDateKey, evidenceCutoffDate } from '@kiditem/shared/common';
import { accountLockKey, type OperationPlanResult, type OperationStagedChunk } from '@kiditem/shared/operation';
import {
  WING_ITEMWINNER_KIND,
  WING_TRAFFIC_KIND,
  WING_TRAFFIC_MAX_PAGES_PER_DAY,
  WingItemwinnerPlanSchema,
  WingItemwinnerResultSchema,
  WingItemwinnerScopeSchema,
  WingTrafficPlanSchema,
  WingTrafficResultSchema,
  WingTrafficScopeSchema,
  wingDailyLockKey,
  type WingItemwinnerResult,
  type WingTrafficResult,
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
import { completeWingTraffic, wingTrafficPlanRange } from '../../../domain/wing-traffic-operation';
import {
  WING_TRAFFIC_OPERATION_REPOSITORY_PORT,
  type WingTrafficOperationRepositoryPort,
} from '../../../application/port/out/repository/wing-traffic-operation.repository.port';
import {
  WING_ITEMWINNER_OPERATION_REPOSITORY_PORT,
  type WingItemwinnerOperationRepositoryPort,
} from '../../../application/port/out/repository/wing-itemwinner-operation.repository.port';

/**
 * Wing 아이템위너(ADR-0025 kind `advertising.wing_itemwinner`, KID-362). 확장이 서비스워커에서 Wing
 * `getProductList`를 한 번 읽어 `itemwinner_rows` 청크와 `itemwinner_page` 표식을 올린다. finish 트랜잭션에서
 * 완결과 Wing 판매자 식별자를 확인하고 그날 listing·option 일별 행의 위너 열을 실행 id와 함께 upsert한다. 최종 실패는
 * `onFailed`에서 계정의 원천 실패 알림으로 남긴다.
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
    const account = await this.repository.readAccount(context.organizationId, channelAccountId);
    if (!account) throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND');
    if (!account.vendorId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'vendor_identity_missing', channelAccountId } });
    }
    const businessDate = businessDateKey(currentBusinessDate());
    return {
      lockKeys: [accountLockKey(channelAccountId), wingDailyLockKey(channelAccountId)],
      plan: { channelAccountId, vendorId: account.vendorId, businessDate },
      window: { start: businessDate, end: businessDate },
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: unknown,
    context: OperationFinalizeContext,
  ): Promise<{ result: WingItemwinnerResult }> {
    const plan = WingItemwinnerPlanSchema.parse(context.plan);
    const { rows, observedAt } = completeWingItemwinner(chunks, plan.businessDate, plan.vendorId);
    const account = await this.repository.readAccount(context.organizationId, plan.channelAccountId, context.tx);
    if (!account || account.vendorId !== plan.vendorId) {
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

/**
 * Wing 일별 트래픽(ADR-0025 kind `advertising.wing_traffic`, KID-362). 확장이 서비스워커에서 Wing business-insight를
 * 날짜마다 읽어 옵션-일 `traffic_rows`와 날 표식 `traffic_days`, 확정 창의 `traffic_period`를 올린다. finish 트랜잭션에서
 * 완결을 확인하고 그 카탈로그로 listing을 맞춰 listing-day 트래픽 열을 쓴다(빠진 카탈로그 리스팅은 0). 계정 일별 요약과
 * 기간 요약은 결과에 남아 `AD_TRAFFIC_READ_PORT`가 읽는다. 잠금은 아이템위너와 같다(`resource:wing-daily:`가 옛
 * `lockListingTraffic`을 대신한다). 최종 실패는 계정의 원천 실패 알림을 남긴다.
 */
@OperationOwner()
@Injectable()
export class WingTrafficOperationOwner implements OperationOwnerPort {
  readonly kind = WING_TRAFFIC_KIND;

  constructor(
    @Inject(WING_TRAFFIC_OPERATION_REPOSITORY_PORT)
    private readonly repository: WingTrafficOperationRepositoryPort,
  ) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = parse(WingTrafficScopeSchema, scope, 'invalid_scope');
    const channelAccountId = parsed.channelAccountId.toLowerCase();
    const account = await this.repository.readAccount(context.organizationId, channelAccountId);
    if (!account) throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND');
    if (!account.vendorId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'vendor_identity_missing', channelAccountId } });
    }
    const range = wingTrafficPlanRange(parsed, businessDateKey(evidenceCutoffDate()));
    return {
      lockKeys: [accountLockKey(channelAccountId), wingDailyLockKey(channelAccountId)],
      plan: {
        channelAccountId,
        vendorId: account.vendorId,
        ...range,
        maxPagesPerDay: WING_TRAFFIC_MAX_PAGES_PER_DAY,
        startedAt: new Date().toISOString(),
      },
      window: { start: range.startDate, end: range.endDate },
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: unknown,
    context: OperationFinalizeContext,
  ): Promise<{ result: WingTrafficResult }> {
    const plan = WingTrafficPlanSchema.parse(context.plan);
    const complete = completeWingTraffic(chunks, plan.expectedDates, plan.vendorId);
    // 수집 중 계정이 비활성이 되거나 Wing 판매자 식별자가 바뀌었으면 그 행을 이 계정에 쓰지 않는다.
    const account = await this.repository.readAccount(context.organizationId, plan.channelAccountId, context.tx);
    if (!account || account.vendorId !== plan.vendorId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'account_changed', channelAccountId: plan.channelAccountId } });
    }
    const published = await this.repository.publish(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      startedAt: new Date(plan.startedAt),
      plan,
      confirmedDays: complete.days,
      rows: complete.rows,
    });
    await this.repository.resolveFailure(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      channelAccountId: plan.channelAccountId,
    });
    return {
      result: WingTrafficResultSchema.parse({
        channelAccountId: plan.channelAccountId,
        requestedStartDate: plan.startDate,
        requestedEndDate: plan.endDate,
        confirmedDates: complete.confirmedDates,
        providerBackedEmptyDates: complete.providerBackedEmptyDates,
        accountDaily: complete.days.map((day) => ({
          businessDate: day.businessDate,
          observedAt: day.capturedAt,
          operationId: context.operationId,
          ...day.accountSummary,
        })),
        periodSummary: {
          startDate: complete.period.startDate,
          endDate: complete.period.endDate,
          observedAt: complete.period.capturedAt,
          operationId: context.operationId,
          accountSummary: complete.period.accountSummary,
        },
        rowCount: complete.rows.length,
        matchedCount: published.matchedCount,
        unmatchedCount: published.unmatchedCount,
        unmatchedOptionIdsByDate: published.unmatchedOptionIdsByDate,
      }),
    };
  }

  async onFailed(context: OperationFailedContext): Promise<void> {
    const plan = WingTrafficPlanSchema.parse(context.plan);
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
