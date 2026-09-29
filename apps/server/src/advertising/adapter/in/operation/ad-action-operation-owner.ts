import { Inject, Injectable } from '@nestjs/common';
import { KiditemNotFoundError } from '@kiditem/shared/errors';
import type { OperationPlanResult, OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  AD_ACTION_KIND,
  AD_ACTION_LEASE_MS,
  AdActionProviderOutcomeSchema,
  AdActionPlanSchema,
  AdActionScopeSchema,
  adActionLockKey,
  type AdActionResult,
} from '@kiditem/shared/advertising-operations';
import type {
  JsonObject,
  OperationFailedContext,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { closedByExpiry } from '../../../../common/operation/domain/operation-fence';
import { assertExecutableAdAction, completeAdAction } from '../../../domain/ad-action-operation';
import {
  AD_ACTION_OPERATION_REPOSITORY_PORT,
  type AdActionOperationRepositoryPort,
} from '../../../application/port/out/repository/ad-action-operation.repository.port';
import { parseOperationScope } from './operation-scope';


/**
 * 광고 액션 실행(ADR-0025 kind `advertising.ad_action`, KID-386). 서버가 승인(또는 캠페인 등록) 뒤 `prepare`로 만들어 두고,
 * 확장이 팝업 버튼으로 `POST /api/operations/claim`해 광고센터 캠페인 등록 페이지를 채운 뒤 증거 청크와 finish로 보고한다.
 * 자동 실행 유형은 `create_campaign` 하나다(수동 유형 3종은 prepare하지 않는다).
 *
 * 잠금은 `resource:ad-action:<actionId>` 하나다(KID-386 리더 결정). `prepared`는 사람이 팝업을 누를 때까지 며칠이고 잠금을
 * 쥐므로, 광고센터 계정 키(`resource:ad-center:<id>`)를 잡으면 그동안 보고서 수집이 거절된다. 광고센터 쓰기의 직렬화는
 * 확장 팝업 루프가 한 번에 하나씩 돌리는 것으로 갈음하고, 보고서 수집과의 동시 실행은 허용한다.
 *
 * `finalize`·`onFailed`는 액션 `payload.execution`에 감사 기록만 남긴다 — 실행 상태는 operations에서 읽는다.
 */
@OperationOwner()
@Injectable()
export class AdActionOperationOwner implements OperationOwnerPort {
  readonly kind = AD_ACTION_KIND;
  readonly leaseMs = AD_ACTION_LEASE_MS;

  constructor(
    @Inject(AD_ACTION_OPERATION_REPOSITORY_PORT)
    private readonly repository: AdActionOperationRepositoryPort,
  ) {}

  async plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    const actionId = parseOperationScope(AdActionScopeSchema, scope).actionId.toLowerCase();
    const action = await this.repository.readAction(context.organizationId, actionId);
    if (!action) throw new KiditemNotFoundError('NOT_FOUND', { details: { actionId } });
    const executable = assertExecutableAdAction(action);
    const account = await this.repository.readAccount(context.organizationId, executable.channelAccountId);
    if (!account) {
      throw new KiditemNotFoundError('ADVERTISING_ACCOUNT_NOT_FOUND', {
        details: { channelAccountId: executable.channelAccountId },
        message: '캠페인을 등록할 쿠팡 계정을 찾을 수 없습니다. 쇼핑몰 계정 설정을 확인해 주세요.',
      });
    }
    return {
      lockKeys: [adActionLockKey(actionId)],
      plan: AdActionPlanSchema.parse({
        actionId,
        channelAccountId: executable.channelAccountId,
        vendorId: account.vendorId,
        actionType: executable.actionType,
        createCampaign: executable.createCampaign,
        startedAt: new Date().toISOString(),
      }),
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: AdActionResult }> {
    const plan = AdActionPlanSchema.parse(context.plan);
    const { result } = completeAdAction(chunks, plan, context.result);
    await this.repository.recordExecution(context.tx, {
      organizationId: context.organizationId,
      actionId: plan.actionId,
      execution: {
        operationId: context.operationId,
        providerOutcome: result.providerOutcome,
        campaignId: result.campaignId,
        linkedExisting: result.linkedExisting,
        errorCode: null,
        message: result.message,
        finishedAt: new Date().toISOString(),
      },
    });
    return { result };
  }

  /**
   * 실패 finish가 `result.providerOutcome`(`not_attempted`|`uncertain`)을 실어 보냈으면 그대로 적고, 없으면 폼까지 못 간 것
   * (`not_attempted`)이다. 임대 만료로 닫힌 실행은 광고센터에 썼는지 모르므로 결과를 비워 둔다.
   */
  async onFailed(context: OperationFailedContext) {
    const plan = AdActionPlanSchema.parse(context.plan);
    const expired = closedByExpiry({ status: 'failed', errorCode: context.errorCode, errorMessage: context.errorMessage });
    const reported = expired
      ? null
      : await this.repository.readRunResult(context.tx, {
        organizationId: context.organizationId,
        actionId: plan.actionId,
        operationId: context.operationId,
      });
    const outcome = AdActionProviderOutcomeSchema.safeParse(reported?.providerOutcome);
    await this.repository.recordExecution(context.tx, {
      organizationId: context.organizationId,
      actionId: plan.actionId,
      execution: {
        operationId: context.operationId,
        providerOutcome: expired ? null : outcome.success && outcome.data !== 'created' ? outcome.data : 'not_attempted',
        campaignId: null,
        linkedExisting: false,
        errorCode: context.errorCode,
        message: context.errorMessage?.slice(0, 500) ?? null,
        finishedAt: new Date().toISOString(),
      },
    });
  }
}
