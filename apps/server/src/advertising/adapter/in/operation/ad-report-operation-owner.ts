import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { businessDateKey, evidenceCutoffDate } from '@kiditem/shared/common';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  AD_REPORT_KIND,
  AD_SETTLEMENT_DOMAINS,
  AdReportPlanSchema,
  AdReportResultSchema,
  AdReportScopeSchema,
  adCenterLockKey,
  type AdReportResult,
} from '@kiditem/shared/advertising-operations';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { adReportPlanWindow, completeAdReport } from '../../../domain/ad-report-operation';
import {
  AD_REPORT_OPERATION_REPOSITORY_PORT,
  type AdReportOperationRepositoryPort,
} from '../../../application/port/out/repository/ad-report-operation.repository.port';
import { parseOperationScope } from './operation-scope';

/**
 * 광고 보고서(ADR-0025 kind `advertising.ad_report`, KID-371). 확장이 광고센터에서 캠페인·광고 목록, 상품·키워드
 * 보고서, 정산(SELLER·RETAIL)을 받아 청크 6종으로 올린다. finish 트랜잭션에서 전날 보류로 창 끝을 정하고 광고 원장
 * 5표를 쓴 뒤 확정 창을 돌려준다(실행 창이 그것으로 좁혀진다). 광고센터 쓰기는 보고서 생성뿐이다.
 * 잠금: `resource:ad-center:<id>` — 광고센터는 Wing과 다른 로그인·탭이라 `account:<id>`를 잡지 않는다.
 * 최종 실패는 실행 행에만 남고 알림 reader가 읽는다(KID-355 정책 B).
 */
@OperationOwner()
@Injectable()
export class AdReportOperationOwner implements OperationOwnerPort {
  readonly kind = AD_REPORT_KIND;

  constructor(
    @Inject(AD_REPORT_OPERATION_REPOSITORY_PORT)
    private readonly repository: AdReportOperationRepositoryPort,
  ) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const parsed = parseOperationScope(AdReportScopeSchema, scope);
    const channelAccountId = parsed.channelAccountId.toLowerCase();
    const account = await this.repository.readAccount(context.organizationId, channelAccountId);
    if (!account) {
      throw new KiditemNotFoundError('ADVERTISING_ACCOUNT_NOT_FOUND', {
        details: { channelAccountId },
        message: '광고센터 수집에 쓸 쿠팡 계정을 찾을 수 없습니다. 쇼핑몰 계정 설정을 확인해 주세요.',
      });
    }
    const startedAt = new Date();
    const { startDate, endDate } = adReportPlanWindow(parsed, businessDateKey(evidenceCutoffDate(startedAt)));
    return {
      lockKeys: [adCenterLockKey(channelAccountId)],
      plan: AdReportPlanSchema.parse({
        channelAccountId,
        vendorId: account.vendorId,
        startDate,
        endDate,
        settlementDomains: [...AD_SETTLEMENT_DOMAINS],
        startedAt: startedAt.toISOString(),
      }),
      window: { start: startDate, end: endDate },
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: AdReportResult; window: OperationWindow }> {
    const plan = AdReportPlanSchema.parse(context.plan);
    // 전날 보류의 기준일은 실행을 시작한 날의 마감일(KST 어제)이다. 그보다 앞에서 끝나는 창(과거 달 채우기)은 보류하지 않는다.
    const closedDay = businessDateKey(evidenceCutoffDate(new Date(plan.startedAt)));
    const complete = completeAdReport(chunks, plan, closedDay);
    // 수집 중 계정이 꺼졌거나 업체코드가 바뀌었으면 그 보고서를 이 계정에 쓰지 않는다.
    const account = await this.repository.readAccount(context.organizationId, plan.channelAccountId, context.tx);
    if (!account || account.vendorId !== plan.vendorId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'account_changed', channelAccountId: plan.channelAccountId } });
    }
    await this.repository.publish(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      channelAccountId: plan.channelAccountId,
      startDate: plan.startDate,
      endDate: complete.confirmedEnd,
      observedAt: new Date(complete.period.capturedAt),
      products: complete.products,
      keywords: complete.keywords,
      billings: complete.billings,
      campaigns: complete.campaigns,
      deletedCampaigns: complete.deletedCampaigns,
      ads: complete.ads,
    });
    return {
      result: AdReportResultSchema.parse({
        startDate: plan.startDate,
        endDate: plan.endDate,
        confirmedEndDate: complete.confirmedEnd,
        productRowCount: complete.products.length,
        keywordRowCount: complete.keywords.length,
        campaignCount: complete.campaigns.length + complete.deletedCampaigns.length,
        adCount: complete.ads.length,
        settlementRowCount: complete.settlementRowCount,
        spendTotal: complete.products.reduce((sum, fact) => sum + fact.spend, 0),
        billedTotal: complete.billings.reduce((sum, billing) => sum + billing.billedSpend, 0),
        unsettledCampaignDays: complete.unsettledCampaignDays,
        accountAdjustmentRows: complete.accountAdjustmentRows,
        warnings: complete.warnings,
      }),
      window: { start: plan.startDate, end: complete.confirmedEnd },
    };
  }
}
