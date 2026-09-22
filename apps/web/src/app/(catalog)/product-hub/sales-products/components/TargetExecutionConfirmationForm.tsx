'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { isApiError } from '@/lib/api-error';
import {
  registrationExecutionKeys,
  targetRegistrationExecutionApi,
} from '@/app/(channels)/_shared/registration-execution-api';
import type { ReportTargetExecutionInput, TargetExecutionResult } from '@kiditem/shared/sales-product';

interface OptionEvidenceDraft {
  externalOptionId: string;
  sellerSku: string;
}

interface ConfirmationDraft {
  externalListingId: string;
  observedUrl: string;
  observedStatus: string;
  providerAccountId: string;
  options: Record<string, OptionEvidenceDraft>;
}

function optionDraftsFor(execution: TargetExecutionResult): Record<string, OptionEvidenceDraft> {
  const optionIds = new Set(
    execution.payload.kind === 'composition_change' && !execution.payload.applyCompositionTemplate
      ? (execution.payload.optionTransitions ?? []).map((transition) => transition.salesProductOptionId)
      : execution.payload.product.options.map((option) => option.id),
  );
  if (execution.payload.kind === 'composition_change') {
    for (const transition of execution.payload.optionTransitions ?? []) optionIds.add(transition.salesProductOptionId);
  }
  return Object.fromEntries([...optionIds].map((optionId) => [optionId, { externalOptionId: '', sellerSku: '' }]));
}

function initialDraft(execution: TargetExecutionResult): ConfirmationDraft {
  return {
    externalListingId: '',
    observedUrl: '',
    observedStatus: '',
    providerAccountId: '',
    options: optionDraftsFor(execution),
  };
}

function optionLabel(execution: TargetExecutionResult, salesProductOptionId: string): string {
  const option = execution.payload.product.options.find((candidate) => candidate.id === salesProductOptionId);
  if (!option) return salesProductOptionId;
  const values = option.values?.join(' / ') || '단품';
  return `${option.optionCode} · ${values}`;
}

function transitionLabel(execution: TargetExecutionResult, salesProductOptionId: string): string | null {
  const transition = execution.payload.optionTransitions?.find(
    (candidate) => candidate.salesProductOptionId === salesProductOptionId,
  );
  return transition ? `기존 몰 옵션 ${transition.channelListingOptionId}` : null;
}

function apiErrorMessage(error: unknown): string {
  return isApiError(error)
    ? error.detail
    : error instanceof Error ? error.message : '몰 확인 결과를 기록하지 못했습니다.';
}

function validateDraft(
  execution: TargetExecutionResult,
  draft: ConfirmationDraft,
): string | null {
  if (!execution.leaseToken) return '이 실행의 lease가 없어 확인 결과를 기록할 수 없습니다. 실행 이력을 새로고침하세요.';
  if (!draft.externalListingId.trim()) return '몰에서 확인한 상품번호를 입력하세요.';
  if (!draft.observedUrl.trim()) return '몰 관리자에서 확인한 상품 URL을 입력하세요.';
  try {
    const url = new URL(draft.observedUrl.trim());
    if (url.protocol !== 'https:') return '상품 URL은 https 주소여야 합니다.';
  } catch {
    return '상품 URL은 올바른 https 주소여야 합니다.';
  }

  const expectedProviderAccountId = execution.expectedProviderAccountId?.trim() || null;
  const observedProviderAccountId = draft.providerAccountId.trim();
  if (expectedProviderAccountId && !observedProviderAccountId) {
    return '동결된 채널 계정을 확인하려면 실제 몰 계정 식별자를 입력하세요.';
  }
  if (expectedProviderAccountId && observedProviderAccountId !== expectedProviderAccountId) {
    return '실제 몰 계정 식별자가 동결된 채널 계정과 일치하지 않습니다.';
  }

  const transitions = execution.payload.optionTransitions ?? [];
  if (execution.payload.kind === 'composition_change' && transitions.length === 0) {
    return '동결된 구성 전환이 없어 확인 결과를 기록할 수 없습니다.';
  }

  const entries = Object.entries(draft.options);
  const missingTransition = execution.payload.kind === 'composition_change'
    && transitions.some((transition) => !draft.options[transition.salesProductOptionId]?.externalOptionId.trim());
  if (missingTransition) return '구성 전환된 모든 공통 옵션의 실제 몰 옵션번호를 입력하세요.';
  const missingTemplateOption = execution.payload.applyCompositionTemplate
    && execution.payload.product.options.some((option) => !draft.options[option.id]?.externalOptionId.trim());
  if (missingTemplateOption) return '템플릿 적용 실행은 동결된 모든 선택 옵션의 실제 몰 옵션번호를 입력하세요.';
  if (entries.some(([, option]) => option.sellerSku.trim() && !option.externalOptionId.trim())) {
    return '판매자 SKU를 입력하려면 실제 몰 옵션번호도 입력하세요.';
  }
  const externalIds = entries
    .map(([, option]) => option.externalOptionId.trim())
    .filter(Boolean);
  if (new Set(externalIds).size !== externalIds.length) return '실제 몰 옵션번호를 중복 입력할 수 없습니다.';
  return null;
}

function reportInput(
  execution: TargetExecutionResult,
  draft: ConfirmationDraft,
): ReportTargetExecutionInput {
  const options = Object.entries(draft.options)
    .flatMap(([salesProductOptionId, option]) => {
      const externalOptionId = option.externalOptionId.trim();
      if (!externalOptionId) return [];
      return [{
        salesProductOptionId,
        externalOptionId,
        ...(option.sellerSku.trim() ? { sellerSku: option.sellerSku.trim() } : {}),
      }];
    });
  return {
    leaseToken: execution.leaseToken!,
    payloadHash: execution.payloadHash,
    outcome: 'confirmed',
    evidence: {
      channelAccountId: execution.channelAccountId,
      externalListingId: draft.externalListingId.trim(),
      observedUrl: draft.observedUrl.trim(),
      ...(draft.observedStatus.trim() ? { observedStatus: draft.observedStatus.trim() } : {}),
      ...(draft.providerAccountId.trim() ? { providerAccountId: draft.providerAccountId.trim() } : {}),
      ...(options.length > 0 ? { options } : {}),
    },
  };
}

/**
 * Record an operator's direct observation of an active target execution.
 *
 * This form never calls a mall adapter. It only reports the frozen execution
 * hash/lease together with evidence the operator read from the mall admin.
 */
export function TargetExecutionConfirmationForm({
  execution,
  onReported,
}: {
  execution: TargetExecutionResult;
  onReported?: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ConfirmationDraft>(() => initialDraft(execution));
  const [validationError, setValidationError] = useState<string | null>(null);
  const report = useMutation({
    mutationFn: () => targetRegistrationExecutionApi.report(
      execution.executionId,
      reportInput(execution, draft),
    ),
    onSuccess: () => {
      setValidationError(null);
      void queryClient.invalidateQueries({ queryKey: registrationExecutionKeys.targetHistory(execution.targetId) });
      onReported?.();
    },
    onError: (error) => setValidationError(apiErrorMessage(error)),
  });

  const optionIds = useMemo(
    () => Object.keys(draft.options),
    [draft.options],
  );
  const expectedProviderAccountId = execution.expectedProviderAccountId?.trim() || null;
  const updateDraft = (patch: Partial<ConfirmationDraft>) => {
    setValidationError(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const submit = () => {
    const error = validateDraft(execution, draft);
    if (error) {
      setValidationError(error);
      return;
    }
    report.mutate();
  };

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-start gap-2">
        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
        <div>
          <p className="text-xs font-semibold text-amber-900">몰에서 실제 등록 결과를 확인한 뒤 기록</p>
          <p className="mt-0.5 text-[11px] leading-5 text-amber-800">
            몰 관리자에서 상품번호와 상품 화면을 직접 확인한 뒤 입력하세요. 이 작업은 확인 결과만 기록하며 외부 송신을 다시 하지 않습니다.
          </p>
        </div>
      </div>
      {!execution.leaseToken && (
        <p className="mt-2 text-xs text-red-700">실행 lease가 없어 확인할 수 없습니다. 최신 실행 상태를 다시 불러오세요.</p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-slate-600">실제 몰 상품번호</span>
          <input
            value={draft.externalListingId}
            onChange={(event) => updateDraft({ externalListingId: event.target.value })}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            placeholder="몰 화면의 상품번호"
            aria-label="실제 몰 상품번호"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-slate-600">실제 몰 상품 URL</span>
          <input
            type="url"
            value={draft.observedUrl}
            onChange={(event) => updateDraft({ observedUrl: event.target.value })}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            placeholder="https://…"
            aria-label="실제 몰 상품 URL"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-slate-600">몰 판매 상태 (선택)</span>
          <input
            value={draft.observedStatus}
            onChange={(event) => updateDraft({ observedStatus: event.target.value })}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            placeholder="판매중 / 승인대기 등"
            aria-label="몰 판매 상태"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-slate-600">
            몰 계정 식별자 {expectedProviderAccountId ? '· 필수' : '(선택)'}
          </span>
          {expectedProviderAccountId && (
            <span className="mb-1 block text-[10px] leading-4 text-slate-500">
              실제 몰 관리자에서 확인한 계정을 입력하세요. 동결된 채널 계정과 일치하는지 대조합니다.
            </span>
          )}
          <input
            value={draft.providerAccountId}
            onChange={(event) => updateDraft({ providerAccountId: event.target.value })}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            placeholder="확인한 판매자 계정 ID"
            aria-label="몰 계정 식별자"
            required={Boolean(expectedProviderAccountId)}
          />
        </label>
      </div>
      {optionIds.length > 0 && (
        <div className="mt-3 rounded border border-slate-200 bg-white p-2.5">
          <p className="text-[11px] font-semibold text-slate-600">
            실제 몰 옵션 연결 ({execution.payload.kind === 'composition_change' || execution.payload.applyCompositionTemplate ? '필수' : '선택'})
            {execution.payload.kind === 'composition_change' ? ' · 구성 전환 옵션은 모두 입력해야 합니다.' : ''}
            {execution.payload.applyCompositionTemplate ? ' · 템플릿 적용은 모든 동결 옵션이 필요합니다.' : ''}
          </p>
          <div className="mt-2 space-y-2">
            {optionIds.map((salesProductOptionId) => {
              const transition = transitionLabel(execution, salesProductOptionId);
              const option = draft.options[salesProductOptionId]!;
              return (
                <div key={salesProductOptionId} className="grid grid-cols-1 gap-1.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-end">
                  <div className="text-[11px] text-slate-600">
                    <span className="font-mono">{optionLabel(execution, salesProductOptionId)}</span>
                    {transition && <span className="mt-0.5 block text-[10px] text-slate-400">{transition}</span>}
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-slate-500">실제 몰 옵션번호{execution.payload.kind === 'composition_change' || execution.payload.applyCompositionTemplate ? ' · 필수' : ''}</span>
                    <input
                      value={option.externalOptionId}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        options: {
                          ...current.options,
                          [salesProductOptionId]: { ...option, externalOptionId: event.target.value },
                        },
                      }))}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      aria-label={`${optionLabel(execution, salesProductOptionId)} 실제 몰 옵션번호`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-slate-500">판매자 SKU (선택)</span>
                    <input
                      value={option.sellerSku}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        options: {
                          ...current.options,
                          [salesProductOptionId]: { ...option, sellerSku: event.target.value },
                        },
                      }))}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      aria-label={`${optionLabel(execution, salesProductOptionId)} 판매자 SKU`}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {validationError && <p role="alert" className="mt-2 text-xs text-red-700">{validationError}</p>}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="btn-primary btn-sm inline-flex items-center gap-1 disabled:opacity-40"
          disabled={!execution.leaseToken || report.isPending}
          onClick={submit}
        >
          <CheckCircle2 size={14} aria-hidden />
          {report.isPending ? '기록하는 중…' : '몰 확인 결과 기록'}
        </button>
      </div>
    </div>
  );
}
