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
 * 채널 계정에 상품을 보내는 길은 하나다 — 쿠팡 WING 을 포함한 모든 몰이 등록 대상 실행(준비 → 시작 →
 * 어댑터 → 결과)을 지나고, 그 호출은 이 파일을 지난다([ADR-0014](../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md),
 * KID-321). 제출 없이 폼만 채운 것은 울타리를 여는 등록 실행이 아니다.
 *
 * 화면별로 다른 등록 호출을 두면 "같은 상품을 한 계정에 두 번 보내지 않는다"가 화면마다 달라진다. 서버
 * 울타리가 그걸 막지만, 막힌 이유를 사람이 읽을 수 있는 자리는 여기 하나뿐이어야 한다.
 */

const targetBase = (targetId: string) =>
  `/api/channels/registration-targets/${encodeURIComponent(targetId)}/executions`;

const executionBase = (executionId: string) =>
  `/api/channels/registration-executions/${encodeURIComponent(executionId)}`;

export const registrationExecutionKeys = {
  targetHistory: (targetId: string) => ['registration-target-executions', 'history', targetId] as const,
  /** 실행 하나. 등록 상태 reader 가 살아 있다고 가리킨 실행만 읽는다(KID-320). */
  execution: (executionId: string) => ['registration-executions', 'detail', executionId] as const,
};

const TargetExecutionResultListSchema = z.array(TargetExecutionResultSchema);

/** 등록 대상 실행: 서버가 판매상품 전체를 얼린 뒤에만 어댑터가 몰에 닿는다. */
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

/** Target execution history is the only resumable registration-attempt read path. */
export const listRegistrationTargetExecutions = targetRegistrationExecutionApi.list;
