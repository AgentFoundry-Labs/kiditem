'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import {
  closeRegistrationOperation,
  confirmRegistrationOperation,
  type RegistrationOperationRead,
  type RegistrationOperationState,
} from './registration-operation';

/**
 * 등록 실행 결과 카드(KID-364 · KID-218). 상태 말은 `REGISTRATION_OPERATION_STATE_LABEL` 하나다.
 *
 * `reconciling`(확인 필요)은 몰에 제출됐지만 등록상품ID를 못 읽은 실행이다. 실패도 성공도 아니다 — 운영자가 몰에서 읽은
 * 등록상품ID(와 몰 옵션번호)로 확인하거나, 몰에 없으면 "등록되지 않음"으로 닫는다. 같은 조직의 운영자면 누구나 닫는다
 * (리더 가정 KID-329 (a)). 확인은 서버가 몰 증거로 판정하고, 이 카드는 판정하지 않는다.
 */

const TONE: Record<RegistrationOperationState, string> = {
  running: 'border-slate-200 bg-slate-50 text-slate-700',
  needs_confirmation: 'border-amber-200 bg-amber-50 text-amber-900',
  confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  failed: 'border-red-200 bg-red-50 text-red-800',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
};

interface PlanOption {
  id: string;
  label: string;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** 얼린 plan의 판매 옵션(몰 옵션번호를 적을 줄). plan 모양을 모르면 빈 목록 — 등록상품ID만으로 확인한다. */
function planOptions(read: RegistrationOperationRead): PlanOption[] {
  const payload = recordValue(read.operation.plan?.payload);
  const snapshot = recordValue(payload.snapshot ?? payload);
  const options = recordValue(snapshot.product).options;
  if (!Array.isArray(options)) return [];
  return options.flatMap((option) => {
    const row = recordValue(option);
    if (typeof row.id !== 'string') return [];
    const values = Array.isArray(row.values) ? row.values.filter((value): value is string => typeof value === 'string') : [];
    const code = typeof row.optionCode === 'string' ? row.optionCode : row.id.slice(0, 8);
    return [{ id: row.id, label: `${code} · ${values.join(' / ') || '단품'}` }];
  });
}

/** 실행 종류별 확인 방식. 새 등록은 몰이 준 등록상품ID로, 기존 몰 상품 수정은 그 상품번호로, 묶음 품절·재개는 닫기만. */
function confirmationMode(read: RegistrationOperationRead): 'listing_id' | 'existing_listing' | 'close_only' {
  const kind = read.operation.plan?.executionKind;
  if (kind === 'sold_out' || kind === 'resume') return 'close_only';
  if (kind === 'update' || kind === 'thumbnail_update') return 'existing_listing';
  return 'listing_id';
}

function planExternalListingId(read: RegistrationOperationRead): string {
  const value = read.operation.plan?.externalListingId;
  return typeof value === 'string' ? value : '';
}

export function RegistrationOperationResolution({
  read: initialRead,
  onResolved,
  className,
}: {
  read: RegistrationOperationRead;
  /** 확인·닫기가 서버에 닿았을 때 — 화면이 등록 상태를 다시 읽는다. */
  onResolved?: () => void;
  className?: string;
}) {
  const mode = confirmationMode(initialRead);
  const [externalListingId, setExternalListingId] = useState(initialRead.result?.externalListingId ?? planExternalListingId(initialRead));
  const [observedUrl, setObservedUrl] = useState('');
  const [optionIds, setOptionIds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(() => planOptions(initialRead), [initialRead]);
  const operationId = initialRead.operation.id;

  const confirm = useMutation({
    mutationFn: () => confirmRegistrationOperation(operationId, {
      externalListingId,
      ...(observedUrl.trim() ? { observedUrl } : {}),
      options: options.flatMap((option) => {
        const externalOptionId = optionIds[option.id]?.trim();
        return externalOptionId ? [{ salesProductOptionId: option.id, externalOptionId }] : [];
      }),
    }),
    onSuccess: () => {
      setError(null);
      toast.success('몰에서 읽은 등록상품ID로 확인했습니다.');
      onResolved?.();
    },
    onError: (cause) => setError(friendlyError(cause, '확인 결과를 기록하지 못했습니다.')),
  });

  const close = useMutation({
    mutationFn: () => closeRegistrationOperation(
      operationId,
      mode === 'listing_id' ? undefined : '운영자가 몰에서 확인: 반영되지 않음',
    ),
    onSuccess: () => {
      setError(null);
      toast.success(mode === 'listing_id' ? '등록되지 않음으로 닫았습니다.' : '반영되지 않음으로 닫았습니다.');
      onResolved?.();
    },
    onError: (cause) => setError(friendlyError(cause, '실행을 닫지 못했습니다.')),
  });

  // 서버가 돌려준 새 상태가 이긴다 — 목록을 다시 읽지 않는 화면(마법사 결과 · 품절 결과 · 칸 창)에서 옛 입력이 남지 않게.
  const read = confirm.data ?? close.data ?? initialRead;
  const busy = confirm.isPending || close.isPending;
  const needsConfirmation = read.state === 'needs_confirmation';

  return (
    <div className={cn('rounded-lg border p-2.5 text-[11px]', TONE[read.state], className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{read.label}</span>
        {read.result?.externalListingId && (
          <span className="font-mono text-[10px]">등록상품ID {read.result.externalListingId}</span>
        )}
      </div>
      {read.message && <p className="mt-1">{read.message}</p>}
      {needsConfirmation && mode === 'close_only' && (
        <div className="mt-2 space-y-2">
          <p>몰에 보냈지만 반영을 다시 읽어 확인하지 못했습니다. 몰 관리자에서 확인한 뒤, 반영됐으면 몰 상품을 다시 가져오고, 반영되지 않았으면 닫아 주세요.</p>
          <div className="flex justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 disabled:opacity-40"
              disabled={busy}
              onClick={() => close.mutate()}
            >
              <XCircle size={12} aria-hidden />
              반영되지 않음
            </button>
          </div>
        </div>
      )}
      {needsConfirmation && mode !== 'close_only' && (
        <div className="mt-2 space-y-2">
          <p>
            {mode === 'listing_id'
              ? '몰에 제출됐지만 등록상품ID를 읽지 못했습니다. 몰 관리자에서 확인해 주세요.'
              : '몰에 보냈지만 반영을 다시 읽어 확인하지 못했습니다. 몰 관리자에서 확인해 주세요.'}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="block">
              <span className="mb-0.5 block font-medium">등록상품ID</span>
              <input
                aria-label="등록상품ID"
                value={externalListingId}
                onChange={(event) => setExternalListingId(event.target.value)}
                disabled={busy}
                className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block font-medium">상품 주소(선택)</span>
              <input
                aria-label="상품 주소"
                value={observedUrl}
                onChange={(event) => setObservedUrl(event.target.value)}
                disabled={busy}
                className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-xs"
              />
            </label>
          </div>
          {options.length > 0 && (
            <div className="space-y-1">
              <p className="font-medium">몰 옵션번호(선택 — 적은 옵션만 연결합니다)</p>
              {options.map((option) => (
                <label key={option.id} className="grid grid-cols-1 items-center gap-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <span>{option.label}</span>
                  <input
                    aria-label={`${option.label} 몰 옵션번호`}
                    value={optionIds[option.id] ?? ''}
                    onChange={(event) => setOptionIds((current) => ({ ...current, [option.id]: event.target.value }))}
                    disabled={busy}
                    className="rounded border border-amber-200 bg-white px-2 py-1 text-xs"
                  />
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-1.5">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 disabled:opacity-40"
              disabled={busy}
              onClick={() => close.mutate()}
            >
              <XCircle size={12} aria-hidden />
              {mode === 'listing_id' ? '등록되지 않음' : '반영되지 않음'}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded bg-amber-700 px-2 py-1 font-semibold text-white disabled:opacity-40"
              disabled={busy || !externalListingId.trim()}
              onClick={() => confirm.mutate()}
            >
              <CheckCircle2 size={12} aria-hidden />
              몰에서 확인
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-red-700">{error}</p>}
    </div>
  );
}
