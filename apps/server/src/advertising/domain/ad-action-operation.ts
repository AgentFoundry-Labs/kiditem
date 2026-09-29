import { KiditemInvalidValueError, KiditemPreconditionError } from '@kiditem/shared/errors';
import {
  AD_ACTION_EVIDENCE_CHUNK_KIND,
  AD_ACTION_EXECUTABLE_TYPES,
  AdActionCreateCampaignSchema,
  AdActionEvidenceSchema,
  AdActionProviderOutcomeSchema,
  type AdActionCreateCampaign,
  type AdActionEvidence,
  type AdActionPlan,
  type AdActionResult,
} from '@kiditem/shared/advertising-operations';
import type { OperationStagedChunk } from '@kiditem/shared/operation';

type AdActionProviderOutcome = AdActionResult['providerOutcome'];

/**
 * 광고 액션 실행(`advertising.ad_action`, KID-386)의 순수 규칙. 액션은 결정(유형·값·승인)이고 실행은 그 결정을 한 번
 * 해 보는 것이다 — 실행 상태는 operations에만 있고, 액션 `payload.execution`에는 감사 기록만 남는다.
 */

/** plan이 읽는 액션 한 건. */
export interface AdActionForExecution {
  id: string;
  actionType: string;
  approvalStatus: string;
  targetLabel: string;
  channelAccountId: string | null;
  payload: unknown;
}

export function isExecutableAdActionType(actionType: string): actionType is AdActionPlan['actionType'] {
  return (AD_ACTION_EXECUTABLE_TYPES as readonly string[]).includes(actionType);
}

/**
 * 캠페인 등록 폼에 채울 값. 등록 경로(`registerCampaign`)가 `payload`에 둔 `campaignName`·`adGroupName`·`productIds`·
 * `dailyBudget`·`targetRoas`에서 읽는다. 상품 검색 키가 없는 옛 등록 행은 자동으로 실행할 수 없다.
 */
export function adActionCreateCampaign(action: Pick<AdActionForExecution, 'targetLabel' | 'payload'>): AdActionCreateCampaign | null {
  const payload = (action.payload && typeof action.payload === 'object' ? action.payload : {}) as Record<string, unknown>;
  const parsed = AdActionCreateCampaignSchema.safeParse({
    name: typeof payload.campaignName === 'string' && payload.campaignName.trim() ? payload.campaignName.trim() : action.targetLabel,
    ...(typeof payload.adGroupName === 'string' && payload.adGroupName.trim() ? { adGroupName: payload.adGroupName.trim() } : {}),
    productIds: payload.productIds,
    dailyBudget: payload.dailyBudget,
    targetRoas: typeof payload.targetRoas === 'number' ? payload.targetRoas : null,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * 실행해도 되는 액션인가. 승인된 자동 실행 유형(`create_campaign`)이고 계정이 정해져 있어야 한다.
 * 어긋나면 레지스트리 오류를 던진다.
 */
export function assertExecutableAdAction(action: AdActionForExecution): {
  actionType: AdActionPlan['actionType'];
  channelAccountId: string;
  createCampaign: AdActionCreateCampaign;
} {
  if (action.approvalStatus !== 'approved' || !isExecutableAdActionType(action.actionType)) {
    throw new KiditemPreconditionError('ADVERTISING_AD_ACTION_NOT_EXECUTABLE', {
      details: { actionId: action.id, actionType: action.actionType, approvalStatus: action.approvalStatus },
    });
  }
  if (!action.channelAccountId) {
    throw new KiditemPreconditionError('ADVERTISING_AD_ACTION_ACCOUNT_MISSING', { details: { actionId: action.id } });
  }
  const createCampaign = adActionCreateCampaign(action);
  if (!createCampaign) {
    throw new KiditemPreconditionError('ADVERTISING_AD_ACTION_NOT_EXECUTABLE', {
      details: { actionId: action.id, reason: 'registration_incomplete' },
      message: '캠페인 등록 내용(상품·예산)이 모자라 자동으로 실행할 수 없습니다. 캠페인 등록을 다시 요청해 주세요.',
    });
  }
  return { actionType: action.actionType, channelAccountId: action.channelAccountId, createCampaign };
}

/**
 * 성공 finish의 결과. 증거 청크(0~1개)의 캠페인 id가 있으면 `created`, 완료를 눌렀지만 id를 못 읽었으면 `uncertain`
 * (사람이 광고센터에서 확인). finish `result`가 결과를 말하면 그것을 따르되, `created`에는 캠페인 id가 있어야 하고
 * `not_attempted`는 성공 finish로 올 수 없다(실패 finish로 보낸다).
 */
export function completeAdAction(
  chunks: readonly OperationStagedChunk[],
  plan: Pick<AdActionPlan, 'actionId' | 'actionType'>,
  reported: Record<string, unknown> | null | undefined,
): { result: AdActionResult; evidence: AdActionEvidence | null } {
  const evidenceRows = chunks
    .filter((chunk) => chunk.chunkKind === AD_ACTION_EVIDENCE_CHUNK_KIND)
    .flatMap((chunk) => chunk.payload);
  if (evidenceRows.length > 1) invalid('evidence_count', '광고센터 등록 증거가 두 건 이상입니다.');
  const evidence = evidenceRows.length === 1 ? parseEvidence(evidenceRows[0]) : null;
  const reportedOutcome = reported?.providerOutcome === undefined
    ? null
    : AdActionProviderOutcomeSchema.safeParse(reported.providerOutcome);
  if (reportedOutcome && !reportedOutcome.success) invalid('provider_outcome', '실행 결과 값이 올바르지 않습니다.');
  const reportedCampaignId = typeof reported?.campaignId === 'string' && reported.campaignId ? reported.campaignId : null;
  const campaignId = evidence?.campaignId ?? reportedCampaignId;
  const providerOutcome: AdActionProviderOutcome = reportedOutcome?.data ?? (campaignId ? 'created' : 'uncertain');
  if (providerOutcome === 'not_attempted') invalid('not_attempted_succeeded', '등록하지 못한 실행은 실패로 보고해야 합니다.');
  if (providerOutcome === 'created' && !campaignId) invalid('campaign_id_missing', '등록된 캠페인 번호가 없습니다.');
  const message = typeof reported?.message === 'string' ? reported.message.slice(0, 500) : evidence?.message ?? null;
  return {
    evidence,
    result: { actionId: plan.actionId, actionType: plan.actionType, providerOutcome, campaignId, message },
  };
}

/** 액션 `payload.execution`에 남기는 감사 기록. 실행 상태 자체는 operations에서 읽는다. */
export interface AdActionExecutionRecord {
  operationId: string;
  providerOutcome: AdActionProviderOutcome | null;
  campaignId: string | null;
  errorCode: string | null;
  message: string | null;
  finishedAt: string;
}

function parseEvidence(row: unknown): AdActionEvidence {
  const parsed = AdActionEvidenceSchema.safeParse(row);
  if (!parsed.success) invalid('evidence_invalid', '광고센터 등록 증거의 모양이 올바르지 않습니다.');
  return parsed.data;
}

function invalid(reason: string, message: string): never {
  throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason }, message });
}
