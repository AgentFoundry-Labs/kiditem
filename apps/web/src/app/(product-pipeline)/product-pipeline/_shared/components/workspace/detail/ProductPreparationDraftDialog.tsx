'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { ChannelAccountOption } from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api';

interface ProductPreparationDraftDialogProps {
  open: boolean;
  accounts: ChannelAccountOption[];
  isLoading: boolean;
  isSubmitting: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (channelAccountId: string) => void;
}

export default function ProductPreparationDraftDialog({
  open,
  accounts,
  isLoading,
  isSubmitting,
  errorMessage = null,
  onClose,
  onSubmit,
}: ProductPreparationDraftDialogProps) {
  const [channelAccountId, setChannelAccountId] = useState('');

  useEffect(() => {
    if (!open) setChannelAccountId('');
  }, [open]);

  if (!open) return null;

  const hasSelectedAccount = accounts.some((account) => account.id === channelAccountId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preparation-draft-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="preparation-draft-title" className="text-base font-black text-slate-900">
              제품 등록 준비
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              등록 초안을 저장할 채널 계정을 선택하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mt-4 grid gap-1.5 text-sm font-bold text-slate-700">
          등록 채널 계정
          <select
            value={channelAccountId}
            onChange={(event) => setChannelAccountId(event.target.value)}
            disabled={isLoading || isSubmitting}
            className="h-10 rounded-md border border-slate-200 px-3 text-sm"
          >
            <option value="">계정을 선택하세요</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.channel}
              </option>
            ))}
          </select>
        </label>

        {isLoading && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Loader2 size={12} className="animate-spin" />
            채널 계정을 불러오는 중입니다.
          </p>
        )}
        {!isLoading && accounts.length === 0 && !errorMessage && (
          <p className="mt-2 text-xs font-semibold text-amber-700">
            사용할 수 있는 채널 계정이 없습니다.
          </p>
        )}
        {errorMessage && (
          <p className="mt-2 text-xs font-semibold text-rose-600">{errorMessage}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-9 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              if (hasSelectedAccount) onSubmit(channelAccountId);
            }}
            disabled={!hasSelectedAccount || isLoading || isSubmitting}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSubmitting && <Loader2 size={12} className="animate-spin" />}
            등록 준비 저장
          </button>
        </div>
      </div>
    </div>
  );
}
