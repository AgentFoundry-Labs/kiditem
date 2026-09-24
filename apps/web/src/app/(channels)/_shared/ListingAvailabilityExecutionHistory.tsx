'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { isApiError } from '@/lib/api-error';
import {
  listingAvailabilityExecutionApi,
  listingAvailabilityExecutionKeys,
} from './listing-availability-execution-api';
import type {
  ListingAvailabilityExecution,
  ReportListingAvailabilityInput,
} from '@kiditem/shared/sales-product';

function isActive(execution: ListingAvailabilityExecution): boolean {
  return execution.status === 'prepared'
    || execution.status === 'executing'
    || execution.status === 'reconciling';
}

function statusLabel(execution: ListingAvailabilityExecution): string {
  if (execution.status === 'prepared') return '전송 대기';
  if (execution.status === 'executing') return '전송 시도 중';
  if (execution.status === 'reconciling') return '몰 결과 확인 필요';
  if (execution.status === 'succeeded') return '확인 완료';
  if (execution.status === 'failed') return '실패';
  return '취소됨';
}

function errorMessage(error: unknown): string {
  return isApiError(error)
    ? error.message
    : error instanceof Error ? error.message : '몰 확인 결과를 기록하지 못했습니다.';
}

interface ConfirmationDraft {
  externalListingId: string;
  observedUrl: string;
  observedStatus: string;
  providerAccountId: string;
}

function validateConfirmation(
  execution: ListingAvailabilityExecution,
  draft: ConfirmationDraft,
): string | null {
  if (!execution.leaseToken) return '실행 lease가 없어 확인할 수 없습니다. 실행 이력을 새로고침하세요.';
  if (!draft.externalListingId.trim()) return '실제 몰 상품번호를 입력하세요.';
  if (draft.externalListingId.trim() !== execution.payload.externalListingId) {
    return '실제 몰 상품번호가 동결된 상품과 일치하지 않습니다.';
  }
  if (!draft.observedUrl.trim()) return '실제 몰 관리자 상품 URL을 입력하세요.';
  try {
    const url = new URL(draft.observedUrl.trim());
    if (url.protocol !== 'https:') return '상품 URL은 https 주소여야 합니다.';
  } catch {
    return '상품 URL은 올바른 https 주소여야 합니다.';
  }

  const expectedProviderAccountId = execution.expectedProviderAccountId?.trim() || null;
  const observedProviderAccountId = draft.providerAccountId.trim();
  if (expectedProviderAccountId && !observedProviderAccountId) {
    return '실제 몰 계정 식별자를 입력해 동결된 채널 계정을 확인하세요.';
  }
  if (expectedProviderAccountId && observedProviderAccountId !== expectedProviderAccountId) {
    return '실제 몰 계정 식별자가 동결된 채널 계정과 일치하지 않습니다.';
  }
  return null;
}

function confirmationInput(
  execution: ListingAvailabilityExecution,
  draft: ConfirmationDraft,
): ReportListingAvailabilityInput {
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
    },
  };
}

/** Operator-entered evidence; this component never sends an availability action. */
export function ListingAvailabilityConfirmationForm({
  execution,
}: {
  execution: ListingAvailabilityExecution;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ConfirmationDraft>({
    externalListingId: '',
    observedUrl: '',
    observedStatus: '',
    providerAccountId: '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const report = useMutation({
    mutationFn: () => listingAvailabilityExecutionApi.report(
      execution.executionId,
      confirmationInput(execution, draft),
    ),
    onSuccess: () => {
      setValidationError(null);
      setReported(true);
      void queryClient.invalidateQueries({
        queryKey: listingAvailabilityExecutionKeys.history(execution.channelAccountId, execution.payload.externalListingId),
      });
    },
    onError: (error) => setValidationError(errorMessage(error)),
  });

  const update = (patch: Partial<ConfirmationDraft>) => {
    setValidationError(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const submit = () => {
    const error = validateConfirmation(execution, draft);
    if (error) {
      setValidationError(error);
      return;
    }
    report.mutate();
  };

  const expectedProviderAccountId = execution.expectedProviderAccountId?.trim() || null;
  return (
    <details className="mt-2 rounded-md border border-amber-200 bg-amber-50/70 p-2.5">
      <summary className="cursor-pointer text-[11px] font-semibold text-amber-900">
        실제 몰 결과 확인 기록 · 재전송하지 않음
      </summary>
      <div className="mt-2">
        <p className="text-[10px] leading-4 text-amber-800">
          몰 관리자에서 상품번호, URL, 실제 계정을 확인해 입력하세요. 이 작업은 확인 기록만 남깁니다.
        </p>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-slate-600">실제 몰 상품번호</span>
          <input
            value={draft.externalListingId}
            onChange={(event) => update({ externalListingId: event.target.value })}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
            placeholder="몰 화면에서 확인한 상품번호"
            aria-label="실제 몰 상품번호"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-slate-600">실제 몰 관리자 상품 URL</span>
          <input
            type="url"
            value={draft.observedUrl}
            onChange={(event) => update({ observedUrl: event.target.value })}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
            placeholder="https://…"
            aria-label="실제 몰 관리자 상품 URL"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-slate-600">실제 몰 계정 식별자 {expectedProviderAccountId ? '· 필수' : '(선택)'}</span>
          {expectedProviderAccountId && (
            <span className="mb-1 block text-[10px] leading-4 text-slate-500">
              실제 몰 관리자에서 계정을 확인해 동결된 채널 계정과 대조하세요.
            </span>
          )}
          <input
            value={draft.providerAccountId}
            onChange={(event) => update({ providerAccountId: event.target.value })}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
            placeholder="확인한 판매자 계정 ID"
            aria-label="실제 몰 계정 식별자"
            required={Boolean(expectedProviderAccountId)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-slate-600">실제 몰 상태 (선택)</span>
          <input
            value={draft.observedStatus}
            onChange={(event) => update({ observedStatus: event.target.value })}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
            placeholder="품절 / 판매중 등"
            aria-label="실제 몰 상태"
          />
        </label>
      </div>
      {validationError && <p role="alert" className="mt-2 text-[11px] text-red-700">{validationError}</p>}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={!execution.leaseToken || report.isPending || reported}
          onClick={submit}
          className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
        >
          {report.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <CheckCircle2 size={12} aria-hidden />}
          {report.isPending ? '확인 기록 중…' : '실제 몰 확인 기록'}
        </button>
      </div>
      {reported && <p role="status" className="mt-2 text-[10px] text-emerald-700">실제 몰 확인 결과를 기록했습니다.</p>}
      </div>
    </details>
  );
}

/** Recent listing-specific attempts. One active row is rendered with its manual confirmation form. */
export function ListingAvailabilityExecutionHistory({
  channelAccountId,
  externalListingId,
}: {
  channelAccountId: string | null;
  externalListingId: string | null;
}) {
  const query = useQuery({
    queryKey: listingAvailabilityExecutionKeys.history(channelAccountId ?? '', externalListingId ?? ''),
    queryFn: () => listingAvailabilityExecutionApi.list(channelAccountId!, externalListingId!),
    enabled: Boolean(channelAccountId && externalListingId),
    refetchInterval: (current) => (current.state.data?.some(isActive) ? 3_000 : false),
  });

  if (!channelAccountId || !externalListingId) return null;
  if (query.isLoading) return <p className="mt-2 text-[10px] text-slate-400">품절·재개 실행 이력을 불러오는 중…</p>;
  if (query.isError) return <p role="alert" className="mt-2 text-[10px] text-red-700">실행 이력을 불러오지 못했습니다.</p>;
  if (!query.data?.length) return null;

  return (
    <section className="mt-3 border-t border-slate-100 pt-2" aria-label="품절·재개 실행 이력">
      <p className="text-[10px] font-semibold text-slate-500">이 상품의 품절·재개 실행</p>
      <ul className="mt-1 space-y-2">
        {query.data.slice(0, 5).map((execution) => (
          <li key={execution.executionId} className="rounded border border-slate-200 p-2">
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="font-medium text-slate-700">
                {execution.payload.kind === 'resume' ? '판매 재개' : '품절'} · {statusLabel(execution)}
              </span>
              {execution.createdAt && (
                <time
                  className="text-slate-400"
                  dateTime={(execution.createdAt instanceof Date ? execution.createdAt : new Date(execution.createdAt)).toISOString()}
                >
                  {(execution.createdAt instanceof Date ? execution.createdAt : new Date(execution.createdAt)).toLocaleString('ko-KR')}
                </time>
              )}
            </div>
            {(execution.status === 'executing' || execution.status === 'reconciling') && (
              <ListingAvailabilityConfirmationForm execution={execution} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
