'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import {
  useChannelVariantCandidates,
  useLinkChannelListingOption,
} from '../hooks/useChannelSkuMappings';
import { operatorProductReference } from '../../lib/operator-product-reference';
import type {
  ChannelMatchCandidateReason,
  ChannelOptionMatchingQueueRow,
} from '@kiditem/shared/channel-product-matching';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ChannelOptionMatchingQueueRow;
};

const REASON_LABEL: Record<ChannelMatchCandidateReason, string> = {
  existing_identity: '기존 연결',
  exact_code: '옵션 코드 일치',
  unique_barcode: '바코드 일치',
  exact_normalized_name: '옵션명 일치',
  ai_suggestion: 'AI 제안',
  manual_search: '검색 결과',
};

export function VariantLinkDialog({ open, onOpenChange, row }: Props) {
  const [search, setSearch] = useState('');
  const candidates = useChannelVariantCandidates(row.option.id, search, open);
  const linkMutation = useLinkChannelListingOption();

  const confirm = async (productVariantId: string | null) => {
    try {
      await linkMutation.mutateAsync({ channelListingOptionId: row.option.id, productVariantId });
      toast.success(productVariantId ? '옵션 연결을 확인했습니다.' : '옵션 연결을 해제했습니다.');
      onOpenChange(false);
    } catch (error) {
      toast.error(friendlyError(error) ?? '옵션 연결을 저장하지 못했습니다.');
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !linkMutation.isPending && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] flex max-h-[88vh] w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle,#e2e8f0)] bg-[var(--surface,#fff)] shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-extrabold text-slate-900">KidItem 옵션 연결</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-600">
                먼저 연결된 상품에 속한 판매 옵션만 후보로 표시됩니다. 확인해야 연결이 저장됩니다.
              </Dialog.Description>
              <p className="mt-3 truncate text-sm font-semibold text-slate-900">
                {row.option.itemName ?? '옵션명 없음'} · <span className="font-mono">{row.option.externalOptionId}</span>
              </p>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X size={18} />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            <label className="block text-xs font-bold text-slate-600">
              KidItem 판매 옵션 검색
              <span className="relative mt-1.5 block">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="옵션 코드 또는 옵션명"
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--primary,#7048e8)]"
                />
              </span>
            </label>

            {candidates.isLoading ? (
              <p className="flex items-center gap-2 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
                <Loader2 size={16} className="animate-spin" /> 옵션 후보를 찾는 중입니다.
              </p>
            ) : candidates.error ? (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {friendlyError(candidates.error) ?? '옵션 후보를 불러오지 못했습니다.'}
              </p>
            ) : (candidates.data?.items.length ?? 0) === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                표시할 옵션 후보가 없습니다. 옵션 코드나 이름으로 검색해 주세요.
              </p>
            ) : (
              <ul className="space-y-2">
                {candidates.data?.items.map((candidate) => (
                  <li key={candidate.productVariantId} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">
                        {operatorProductReference(candidate.code, candidate.name)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {candidate.optionLabel ?? '옵션 설명 없음'} · {REASON_LABEL[candidate.reason]}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={linkMutation.isPending}
                      onClick={() => void confirm(candidate.productVariantId)}
                      className="shrink-0 rounded-xl bg-[var(--primary,#7048e8)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      이 옵션으로 확인
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {row.linkedVariant ? (
            <footer className="border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                disabled={linkMutation.isPending}
                onClick={() => {
                  if (window.confirm('이 채널 옵션의 KidItem 옵션 연결을 해제할까요?')) void confirm(null);
                }}
                className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"
              >
                옵션 연결 해제
              </button>
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
