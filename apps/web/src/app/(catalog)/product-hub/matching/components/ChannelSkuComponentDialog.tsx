'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { friendlyError } from '@/lib/api-error';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import {
  useChannelSkuCandidates,
  useReplaceChannelSkuComponents,
} from '../hooks/useChannelSkuMappings';
import {
  addCandidateToDraft,
  createUnmapInput,
  initializeComponentDraft,
  removeDraftComponent,
  serializeComponentDraft,
  updateDraftQuantity,
} from '../lib/component-draft';
import type {
  ChannelSkuMappingListItem,
  ChannelSkuMatchCandidateReason,
} from '@kiditem/shared/channel-sku-matching';

type ChannelSkuComponentDialogProps = {
  open: boolean;
  item: ChannelSkuMappingListItem;
  onOpenChange: (open: boolean) => void;
};

const CANDIDATE_REASON_LABEL: Record<ChannelSkuMatchCandidateReason, string> = {
  exact_sellpia_code: '상품코드 일치',
  unique_barcode: '고유 식별자',
  ambiguous_identifier: '중복 식별자',
  exact_normalized_name: '등록상품명 일치',
  name_suggestion: '이름 제안',
  manual_search: '검색 결과',
};

export function ChannelSkuComponentDialog({
  open,
  item,
  onOpenChange,
}: ChannelSkuComponentDialogProps) {
  const [draft, setDraft] = useState(() =>
    initializeComponentDraft(item.components),
  );
  const [draftError, setDraftError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [unmapConfirmOpen, setUnmapConfirmOpen] = useState(false);
  const candidatesQuery = useChannelSkuCandidates(
    item.sku.id,
    submittedSearch,
    open,
  );
  const replaceMutation = useReplaceChannelSkuComponents();

  const resetAndClose = () => {
    setDraft(initializeComponentDraft(item.components));
    setDraftError(null);
    setSearchText('');
    setSubmittedSearch('');
    setUnmapConfirmOpen(false);
    onOpenChange(false);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (replaceMutation.isPending) return;
    if (!nextOpen) resetAndClose();
  };

  const handleSave = async () => {
    const serialized = serializeComponentDraft(draft);
    if (!serialized.ok) {
      setDraftError(serialized.error);
      return;
    }

    setDraftError(null);
    try {
      await replaceMutation.mutateAsync({
        channelSkuId: item.sku.id,
        input: serialized.input,
      });
      toast.success('Sellpia 구성을 저장했습니다.');
      resetAndClose();
    } catch (error) {
      toast.error(friendlyError(error) ?? 'Sellpia 구성 저장에 실패했습니다.');
    }
  };

  const handleUnmap = async () => {
    try {
      await replaceMutation.mutateAsync({
        channelSkuId: item.sku.id,
        input: createUnmapInput(),
      });
      toast.success('SKU 매칭을 해제했습니다.');
      resetAndClose();
    } catch (error) {
      toast.error(friendlyError(error) ?? '매칭 해제에 실패했습니다.');
      setUnmapConfirmOpen(false);
    }
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleDialogOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] flex max-h-[92vh] w-[min(96vw,960px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)] shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-[var(--border,#e2e8f0)] px-6 py-5">
              <div className="min-w-0">
                <Dialog.Title className="text-lg font-bold text-[var(--text-primary,#0f172a)]">
                  Sellpia 구성 매칭
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary,#475569)]">
                  후보는 참고 정보입니다. 저장 버튼을 눌러야 실제 구성에 반영됩니다.
                </Dialog.Description>
                <div className="mt-3 grid gap-1 text-xs text-[var(--text-secondary,#475569)] sm:grid-cols-2">
                  <p className="truncate">
                    <span className="font-semibold text-[var(--text-primary,#0f172a)]">
                      상품
                    </span>{' '}
                    {item.product.registeredName ?? item.product.displayName ?? '상품명 없음'} ·{' '}
                    <span className="font-mono">{item.product.externalProductId}</span>
                  </p>
                  <p className="truncate">
                    <span className="font-semibold text-[var(--text-primary,#0f172a)]">
                      옵션 SKU
                    </span>{' '}
                    {item.sku.optionName ?? '옵션명 없음'} ·{' '}
                    <span className="font-mono">{item.sku.externalSkuId}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={resetAndClose}
                disabled={replaceMutation.isPending}
                className="rounded-lg p-2 text-[var(--text-tertiary,#64748b)] hover:bg-[var(--surface-sunken,#f1f5f9)] disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <section aria-labelledby="candidate-heading" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 id="candidate-heading" className="text-sm font-bold text-[var(--text-primary,#0f172a)]">
                      Sellpia 후보
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--text-tertiary,#64748b)]">
                      근거를 확인한 뒤 구성에 추가하세요. 후보는 자동 저장되지 않습니다.
                    </p>
                  </div>
                  <form
                    className="flex w-full gap-2 sm:w-auto"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setSubmittedSearch(searchText.trim());
                    }}
                  >
                    <label className="sr-only" htmlFor="sellpia-candidate-search">
                      Sellpia 후보 검색
                    </label>
                    <input
                      id="sellpia-candidate-search"
                      value={searchText}
                      disabled={candidatesQuery.isFetching}
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="상품코드, 이름, 바코드"
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border,#cbd5e1)] bg-[var(--surface,#fff)] px-3 py-2 text-sm outline-none focus:border-[var(--primary,#7048e8)] sm:w-64"
                    />
                    <button
                      type="submit"
                      disabled={candidatesQuery.isFetching}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border,#cbd5e1)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary,#475569)] hover:bg-[var(--surface-sunken,#f8fafc)]"
                    >
                      <Search size={15} />
                      후보 검색
                    </button>
                  </form>
                </div>

                <div className="grid gap-2 lg:grid-cols-2">
                  {candidatesQuery.isLoading || candidatesQuery.isFetching ? (
                    <div className="col-span-full flex items-center gap-2 rounded-xl border border-[var(--border,#e2e8f0)] p-4 text-sm text-[var(--text-secondary,#475569)]">
                      <Loader2 size={16} className="animate-spin" />{' '}
                      {candidatesQuery.isLoading
                        ? '후보를 찾는 중입니다.'
                        : 'Sellpia 후보를 최신 상태로 다시 확인 중입니다.'}
                    </div>
                  ) : candidatesQuery.error ? (
                    <div role="alert" className="col-span-full flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                      <span>{friendlyError(candidatesQuery.error) ?? 'Sellpia 후보를 불러오지 못했습니다.'}</span>
                      <button
                        type="button"
                        onClick={() => void candidatesQuery.refetch()}
                        className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-100"
                      >
                        후보 다시 불러오기
                      </button>
                    </div>
                  ) : (candidatesQuery.data?.items.length ?? 0) === 0 ? (
                    <div className="col-span-full rounded-xl border border-dashed border-[var(--border,#cbd5e1)] p-4 text-sm text-[var(--text-secondary,#64748b)]">
                      표시할 후보가 없습니다. Sellpia 상품코드나 이름으로 검색해 주세요.
                    </div>
                  ) : (
                    candidatesQuery.data?.items.map((candidate) => (
                      <article
                        key={candidate.masterProductId}
                        className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border,#e2e8f0)] bg-[var(--surface-raised,#fff)] p-3"
                      >
                        <div className="min-w-0 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-semibold text-[var(--text-primary,#0f172a)]">
                              {candidate.code}
                            </span>
                            <span className="rounded-full bg-[var(--primary-soft,#ede9fe)] px-2 py-0.5 text-[11px] font-semibold text-[var(--primary,#6d28d9)]">
                              {CANDIDATE_REASON_LABEL[candidate.reason]}
                            </span>
                          </div>
                          <p className="mt-1 truncate font-medium text-[var(--text-primary,#0f172a)]">
                            {candidate.name}
                            {candidate.optionName ? ` · ${candidate.optionName}` : ''}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-tertiary,#64748b)]">
                            현재 재고 {formatNumber(candidate.currentStock)}
                            {candidate.barcode ? ` · ${candidate.barcode}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`${candidate.code} 구성에 추가`}
                          onClick={() => {
                            const result = addCandidateToDraft(draft, candidate);
                            setDraft(result.draft);
                            setDraftError(result.error);
                          }}
                          className="shrink-0 rounded-lg border border-[var(--primary,#7048e8)] p-2 text-[var(--primary,#7048e8)] hover:bg-[var(--primary-soft,#f3f0ff)]"
                        >
                          <Plus size={15} />
                        </button>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section aria-labelledby="recipe-heading" className="space-y-3">
                <div>
                  <h2 id="recipe-heading" className="text-sm font-bold text-[var(--text-primary,#0f172a)]">
                    저장할 Sellpia 구성
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--text-tertiary,#64748b)]">
                    쇼핑몰 옵션 SKU 1개 판매 시 차감할 Sellpia 상품과 수량입니다.
                  </p>
                </div>

                {draft.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border,#cbd5e1)] p-4 text-sm text-[var(--text-secondary,#64748b)]">
                    아직 구성품이 없습니다. 정상 저장하려면 하나 이상 추가해 주세요.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {draft.map((row) => (
                      <div
                        key={row.masterProductId}
                        className="grid items-center gap-3 rounded-xl border border-[var(--border,#e2e8f0)] p-3 sm:grid-cols-[minmax(0,1fr)_110px_40px]"
                      >
                        <div className="min-w-0 text-sm">
                          <p className="truncate font-medium text-[var(--text-primary,#0f172a)]">
                            <span className="font-mono">{row.code}</span> · {row.name}
                            {row.optionName ? ` · ${row.optionName}` : ''}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-tertiary,#64748b)]">
                            현재 재고 {formatNumber(row.currentStock)}
                            {' · '}
                            {row.purchasePrice === null
                              ? '매입가 없음'
                              : `매입가 ${formatKRW(row.purchasePrice)}원`}
                            {' · '}
                            {row.componentCapacity === null
                              ? '구성 가능 저장 후 계산'
                              : `구성 가능 ${formatNumber(row.componentCapacity)}`}
                            {row.isBottleneck ? ' · 병목' : ''}
                            {row.barcode ? ` · ${row.barcode}` : ''}
                          </p>
                        </div>
                        <label className="text-xs font-semibold text-[var(--text-secondary,#475569)]">
                          <span className="sr-only">{row.code} 수량</span>
                          <input
                            aria-label={`${row.code} 수량`}
                            value={row.quantityText}
                            inputMode="numeric"
                            onChange={(event) => {
                              setDraft((current) =>
                                updateDraftQuantity(
                                  current,
                                  row.masterProductId,
                                  event.target.value,
                                ),
                              );
                              setDraftError(null);
                            }}
                            className="w-full rounded-lg border border-[var(--border,#cbd5e1)] px-3 py-2 text-right font-mono text-sm outline-none focus:border-[var(--primary,#7048e8)]"
                          />
                        </label>
                        <button
                          type="button"
                          aria-label={`${row.code} 구성에서 제거`}
                          onClick={() => {
                            setDraft((current) =>
                              removeDraftComponent(current, row.masterProductId),
                            );
                            setDraftError(null);
                          }}
                          className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {draftError ? (
                  <p role="alert" className="text-sm font-medium text-rose-600">
                    {draftError}
                  </p>
                ) : null}
              </section>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border,#e2e8f0)] px-6 py-4">
              <button
                type="button"
                onClick={() => setUnmapConfirmOpen(true)}
                disabled={replaceMutation.isPending}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                매칭 해제
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetAndClose}
                  disabled={replaceMutation.isPending}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-secondary,#475569)] hover:bg-[var(--surface-sunken,#f1f5f9)] disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={draft.length === 0 || replaceMutation.isPending}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg bg-[var(--primary,#7048e8)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {replaceMutation.isPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : null}
                  구성 저장
                </button>
              </div>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={unmapConfirmOpen}
        onOpenChange={setUnmapConfirmOpen}
        title="Sellpia 구성 매칭을 해제할까요?"
        description="저장된 모든 구성품이 제거됩니다. 후보는 저장되지 않으며 현재 재고 숫자는 수정하지 않습니다."
        confirmText="매칭 해제 확인"
        cancelText="취소"
        tone="danger"
        onConfirm={handleUnmap}
        isLoading={replaceMutation.isPending}
      />
    </>
  );
}
