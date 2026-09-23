import { z } from 'zod';
import {
  TargetExecutionResultSchema,
  type PrepareTargetExecutionInput,
  type ReportTargetExecutionInput,
  type TargetExecutionResult,
} from '@kiditem/shared/sales-product';
import { apiClient } from '@/lib/api-client';

/**
 * 등록 실행 울타리 호출.
 *
 * 채널 계정에 상품을 보내는 길은 하나다 — 수집상품 화면의 WING 자동 제출도,
 * 몰 마법사도 이 파일을 지난다([ADR-0014](../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 * 제출 없이 폼만 채운 것은 울타리를 여는 등록 실행이 아니다.
 *
 * 화면별로 다른 등록 호출을 두면 "같은 상품을 한 계정에 두 번 보내지 않는다"가
 * 화면마다 달라진다. 서버 울타리가 그걸 막지만, 막힌 이유를 사람이 읽을 수 있는
 * 자리는 여기 하나뿐이어야 한다.
 */

const base = (salesProductId: string) =>
  `/api/products/sales-products/${encodeURIComponent(salesProductId)}/registration/executions`;

const targetBase = (targetId: string) =>
  `/api/channels/registration-targets/${encodeURIComponent(targetId)}/executions`;

const executionBase = (executionId: string) =>
  `/api/channels/registration-executions/${encodeURIComponent(executionId)}`;

export const registrationExecutionKeys = {
  targetHistory: (targetId: string) => ['registration-target-executions', 'history', targetId] as const,
};

const TargetExecutionResultListSchema = z.array(TargetExecutionResultSchema);

/** 셀피아 재고 SKU 한 줄. 울타리가 동결하는 vendorItemCode 의 출처다. */
export interface SellpiaInventoryRef {
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number;
}

export type SellpiaMatchSelection = SellpiaInventoryRef & { quantity: number };

export interface SyncedChannelListing {
  externalListingId: string;
  displayName: string;
  status: string | null;
}

export interface PreparedRegistrationExecution {
  executionId: string;
  preparationId: string;
  requestHash: string;
  status: 'prepared';
  expectedVendorId: string;
  sellpiaMatch: SellpiaMatchSelection;
  existingListing: SyncedChannelListing | null;
}

export interface WingSellpiaMatchPreview {
  status: 'matched' | 'selection_required';
  reason: string;
  sellpiaMatch: SellpiaMatchSelection | null;
  proposals: Array<SellpiaInventoryRef & { recommendedQuantity: number | null }>;
}

export interface PrepareRegistrationExecutionBody {
  channelAccountId: string;
  displayName: string;
  registrationInput: Record<string, unknown>;
  idempotencyKey: string;
  masterProductId?: string;
  sellpiaQuantity?: number;
}

/**
 * Public target execution client.  A target execution is a separate contract from
 * the legacy candidate/WING fence above: the server freezes the complete product
 * payload before the provider adapter is allowed to do any I/O.
 */
export const targetRegistrationExecutionApi = {
  prepare: (targetId: string, input: PrepareTargetExecutionInput): Promise<TargetExecutionResult> =>
    apiClient.post<unknown>(targetBase(targetId), input)
      .then((response) => TargetExecutionResultSchema.parse(response)),

  start: (executionId: string): Promise<TargetExecutionResult> =>
    apiClient.post<unknown>(`${executionBase(executionId)}/start`, {})
      .then((response) => TargetExecutionResultSchema.parse(response)),

  get: (executionId: string): Promise<TargetExecutionResult> =>
    apiClient.getParsed(executionBase(executionId), TargetExecutionResultSchema),

  list: (targetId: string): Promise<TargetExecutionResult[]> =>
    apiClient.getParsed(targetBase(targetId), TargetExecutionResultListSchema),

  report: (executionId: string, input: ReportTargetExecutionInput): Promise<TargetExecutionResult> =>
    apiClient.post<unknown>(`${executionBase(executionId)}/result`, input)
      .then((response) => TargetExecutionResultSchema.parse(response)),
};

export const registrationExecutionApi = {
  /** Prepare an immutable registration-target snapshot. */
  prepareTarget: targetRegistrationExecutionApi.prepare,
  prepareTargetExecution: targetRegistrationExecutionApi.prepare,
  /** Claim the provider-I/O lease for a target execution. */
  startTarget: targetRegistrationExecutionApi.start,
  startTargetExecution: targetRegistrationExecutionApi.start,
  /** Read an execution when the provider needs reconciliation. */
  getTarget: targetRegistrationExecutionApi.get,
  getTargetExecution: targetRegistrationExecutionApi.get,
  /** Read the recent attempts for a saved target, newest first. */
  listTargetExecutions: targetRegistrationExecutionApi.list,
  listTargetExecutionHistory: targetRegistrationExecutionApi.list,
  /** Report the provider result using the frozen payload hash and lease. */
  reportTarget: targetRegistrationExecutionApi.report,
  reportTargetExecution: targetRegistrationExecutionApi.report,

  /** 제출본을 동결하고 실행 장부를 연다. 아직 마켓에 아무것도 보내지 않는다. */
  prepare: (salesProductId: string, body: PrepareRegistrationExecutionBody) =>
    apiClient.post<PreparedRegistrationExecution>(`${base(salesProductId)}/prepare`, body),

  previewSellpiaMatch: (
    salesProductId: string,
    body: { listingName: string; itemName?: string },
  ) => apiClient.post<WingSellpiaMatchPreview>(`${base(salesProductId)}/match-preview`, body),

  /**
   * 이미 마켓에 등록된 상품을 등록상품으로 확정한다.
   *
   * 쿠팡 WING 등록은 확장이 화면을 조작해 수행하므로 서버의 provider create 경로를
   * 탈 수 없다. 이 호출은 **이미 발급된 등록상품ID** 를 근거로 `ChannelListing` 만
   * 만들어 등록상품 목록에 올린다. 서버는 새 상품을 생성하지 않고 선택된 계정의
   * vendorId 와 확장이 확인한 WING 계정을 대조한다. 이미 동기화된 리스팅은 준비 시
   * frozen 한 내부 결과로 확정한다.
   */
  confirm: (
    salesProductId: string,
    body: {
      executionId: string;
      externalListingId: string;
      evidence?: Record<string, unknown>;
    },
  ) => apiClient.post<{ preparationId: string; status: string; listingId?: string }>(
    `${base(salesProductId)}/confirm`,
    body,
  ),

  /** 리스를 잡는다. 여기서부터 중복 제출이 막힌다. */
  start: (salesProductId: string, executionId: string) =>
    apiClient.post<{ executionId: string; status: 'executing'; providerOutcome: 'uncertain' }>(
      `${base(salesProductId)}/${encodeURIComponent(executionId)}/start`, {},
    ),

  /** 제출 여부를 모르는 실패. 중복 등록을 막으려고 열어 둔다. */
  markUnresolved: (
    salesProductId: string, executionId: string, evidence: Record<string, unknown>,
  ) => apiClient.post(
    `${base(salesProductId)}/${encodeURIComponent(executionId)}/unresolved`,
    { evidence },
  ),

  /**
   * 확장이 폼을 채우다 실패해 제출 자체가 없었던 실행을 확정 실패로 닫는다.
   * `unresolved` 로 두면 실행이 `reconciling` 에 갇혀 재시도도 취소도 막힌다.
   */
  markNotSubmitted: (
    salesProductId: string, executionId: string, evidence: Record<string, unknown>,
  ) => apiClient.post(
    `${base(salesProductId)}/${encodeURIComponent(executionId)}/not-submitted`,
    { evidence },
  ),
};

/** Target execution history is the only resumable registration-attempt read path. */
export const listRegistrationTargetExecutions = targetRegistrationExecutionApi.list;
