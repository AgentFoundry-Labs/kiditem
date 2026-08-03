'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductRecipeComponentCandidate } from '@kiditem/shared/product-operations';
import type {
  ChannelMatchCandidateReason,
  ChannelOptionMatchingQueueRow,
  ChannelProductMatchingQueueRow,
} from '@kiditem/shared/channel-product-matching';
import { SellpiaOutOfStockToggle } from '@/components/SellpiaOutOfStockToggle';
import { friendlyError } from '@/lib/api-error';
import { formatNumber } from '@/lib/utils';
import {
  useChannelProductCandidates,
  useLinkChannelListingProduct,
  useRecipeComponentCandidates,
  useSaveProductInventoryMatching,
} from '../hooks/useChannelSkuMappings';
import { operatorProductReference } from '../../lib/operator-product-reference';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ChannelProductMatchingQueueRow;
  options: ChannelOptionMatchingQueueRow[];
};

type DraftComponent = {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number;
  quantity: number | null;
};

const REASON_LABEL: Record<ChannelMatchCandidateReason, string> = {
  existing_identity: '기존 연결',
  exact_code: '상품 코드 일치',
  unique_barcode: '바코드 일치',
  confirmed_manual_match_alias: 'Sellpia 수동매칭 별칭 일치',
  exact_normalized_name: '상품명 일치',
  ai_suggestion: 'AI 제안',
  manual_search: '검색 결과',
};

export function ProductLinkDialog({ open, onOpenChange, row, options }: Props) {
  const [productSearch, setProductSearch] = useState('');
  const [selectedMasterProductId, setSelectedMasterProductId] = useState<string | null>(
    row.listing.masterProductId,
  );
  const [activeOptionId, setActiveOptionId] = useState<string | null>(options[0]?.option.id ?? null);
  const [inventorySearch, setInventorySearch] = useState('');
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftComponent[]>>(() => draftsFrom(options));
  const optionResetKey = options.map(({ option }) => `${option.id}:${option.updatedAt}`).join('|');

  useEffect(() => {
    if (!open) return;
    const firstAttention = options.find(({ option }) => option.inventoryComponents.length === 0) ?? options[0];
    setProductSearch('');
    setSelectedMasterProductId(row.listing.masterProductId);
    setDrafts(draftsFrom(options));
    setActiveOptionId(firstAttention?.option.id ?? null);
    setInventorySearch(optionSearch(firstAttention));
    setIncludeOutOfStock(false);
  }, [open, optionResetKey, row.listing.id, row.listing.masterProductId]);

  const candidates = useChannelProductCandidates(row.listing.id, productSearch, open);
  const inventoryCandidates = useRecipeComponentCandidates(
    inventorySearch,
    includeOutOfStock,
    open && Boolean(activeOptionId),
  );
  const saveMutation = useSaveProductInventoryMatching();
  const unlinkMutation = useLinkChannelListingProduct();
  const activeOption = options.find(({ option }) => option.id === activeOptionId) ?? null;
  const activeDraft = activeOptionId ? drafts[activeOptionId] ?? [] : [];
  const selectedCandidate = candidates.data?.items.find(
    ({ masterProductId }) => masterProductId === selectedMasterProductId,
  );
  const selectedProductLabel = selectedCandidate
    ? operatorProductReference(selectedCandidate.code, selectedCandidate.name)
    : row.linkedProduct?.id === selectedMasterProductId
      ? operatorProductReference(row.linkedProduct.code, row.linkedProduct.name)
      : null;

  const changedOptions = useMemo(() => options.flatMap((optionRow) => {
    const draft = drafts[optionRow.option.id] ?? [];
    if (recipeSignature(draft) === recipeSignature(optionRow.option.inventoryComponents)) return [];
    return [{
      channelListingOptionId: optionRow.option.id,
      components: draft.map((component) => ({
        sellpiaInventorySkuId: component.sellpiaInventorySkuId,
        quantity: component.quantity!,
      })),
    }];
  }), [drafts, options]);
  const hasInvalidQuantity = Object.values(drafts).some((components) => components.some(
    ({ quantity }) => quantity === null || !Number.isSafeInteger(quantity) || quantity <= 0,
  ));
  const isPending = saveMutation.isPending || unlinkMutation.isPending;
  const canSave = Boolean(selectedMasterProductId) && !hasInvalidQuantity && !isPending;

  const selectOption = (optionRow: ChannelOptionMatchingQueueRow) => {
    setActiveOptionId(optionRow.option.id);
    setInventorySearch(optionSearch(optionRow));
    setIncludeOutOfStock(false);
  };

  const addInventory = (candidate: ProductRecipeComponentCandidate) => {
    if (!activeOptionId) return;
    setDrafts((current) => {
      const components = current[activeOptionId] ?? [];
      if (components.some(({ sellpiaInventorySkuId }) =>
        sellpiaInventorySkuId === candidate.sellpiaInventorySkuId)) return current;
      return {
        ...current,
        [activeOptionId]: [...components, {
          sellpiaInventorySkuId: candidate.sellpiaInventorySkuId,
          code: candidate.code,
          name: candidate.name,
          optionName: candidate.optionName,
          currentStock: candidate.currentStock,
          quantity: 1,
        }],
      };
    });
  };

  const save = async () => {
    if (!selectedMasterProductId || !canSave) return;
    try {
      await saveMutation.mutateAsync({
        channelListingId: row.listing.id,
        masterProductId: selectedMasterProductId,
        options: changedOptions,
      });
      toast.success(`운영상품과 옵션 재고 매칭을 저장했습니다. 재고 구성 ${changedOptions.length}개 반영`);
      onOpenChange(false);
    } catch (error) {
      toast.error(friendlyError(error) ?? '운영상품 연결을 저장하지 못했습니다. 반영 상태를 새로고침해 확인해 주세요.');
    }
  };

  const unlink = async () => {
    if (!window.confirm('운영상품 연결만 해제합니다. 옵션의 재고 매칭은 유지됩니다. 계속할까요?')) return;
    try {
      await unlinkMutation.mutateAsync({ channelListingId: row.listing.id, masterProductId: null });
      toast.success('운영상품 연결을 해제했습니다.');
      onOpenChange(false);
    } catch (error) {
      toast.error(friendlyError(error) ?? '운영상품 연결을 해제하지 못했습니다.');
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] flex max-h-[94vh] w-[min(96vw,980px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-extrabold text-slate-900">운영상품 연결</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-600">
                KidItem 운영상품과 옵션별 Sellpia 재고·차감 수량을 한 번에 확정합니다.
              </Dialog.Description>
              <p className="mt-3 truncate text-sm font-semibold text-slate-900">
                {row.listing.displayName ?? '상품명 없음'} · <span className="font-mono">{row.listing.externalId}</span>
              </p>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X size={18} />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-500">선택한 KidItem 운영상품</p>
                  <p className="mt-1 font-extrabold text-slate-900">{selectedProductLabel ?? '운영상품을 선택해 주세요.'}</p>
                </div>
                {selectedMasterProductId ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800"><Check size={13} /> 선택됨</span> : null}
              </div>
              <label className="mt-4 block text-xs font-bold text-slate-600">
                운영상품 검색
                <span className="relative mt-1.5 block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="상품 코드 또는 상품명" className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-purple-600" />
                </span>
              </label>
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                {candidates.isLoading ? <LoadingLabel>운영상품 후보를 찾는 중입니다.</LoadingLabel>
                  : candidates.error ? <ErrorLabel message={friendlyError(candidates.error) ?? '운영상품 후보를 불러오지 못했습니다.'} />
                    : (candidates.data?.items.length ?? 0) === 0 ? <EmptyLabel message="표시할 운영상품 후보가 없습니다." />
                      : candidates.data?.items.map((candidate) => {
                        const selected = candidate.masterProductId === selectedMasterProductId;
                        return <button key={candidate.masterProductId} type="button" onClick={() => setSelectedMasterProductId(candidate.masterProductId)} className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left ${selected ? 'border-purple-500 bg-purple-50' : 'border-slate-200 bg-white'}`}>
                          <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{operatorProductReference(candidate.code, candidate.name)}</span><span className="mt-1 block text-xs text-slate-500">{REASON_LABEL[candidate.reason]}{candidate.category ? ` · ${candidate.category}` : ''}</span></span>
                          <span className="shrink-0 text-xs font-bold text-purple-700">{selected ? '선택됨' : '선택'}</span>
                        </button>;
                      })}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="font-extrabold text-slate-900">옵션별 재고 매칭</h3><p className="mt-1 text-xs text-slate-500">Sellpia 재고 SKU와 판매 1개당 차감 수량을 같은 화면에서 입력합니다.</p></div>
                <span className="text-xs font-bold text-slate-500">옵션 {formatNumber(options.length)}개 · 변경 {formatNumber(changedOptions.length)}개</span>
              </div>
              {options.length === 0 ? <EmptyLabel message="수집된 채널 옵션이 없습니다. 운영상품 연결만 저장할 수 있습니다." /> : (
                <div className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="max-h-[430px] space-y-2 overflow-y-auto">
                    {options.map((optionRow) => {
                      const components = drafts[optionRow.option.id] ?? [];
                      const active = optionRow.option.id === activeOptionId;
                      return <button key={optionRow.option.id} type="button" onClick={() => selectOption(optionRow)} className={`w-full rounded-xl border p-3 text-left ${active ? 'border-purple-500 bg-purple-50' : 'border-slate-200 bg-white'}`}>
                        <span className="block truncate text-sm font-bold text-slate-900">{optionRow.option.itemName ?? '옵션명 없음'}</span>
                        <span className="mt-1 block truncate font-mono text-xs text-slate-500">{optionRow.option.sellerSku ?? optionRow.option.externalOptionId}</span>
                        <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${components.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{components.length ? `재고 ${components.length}개 연결` : '재고 연결 필요'}</span>
                      </button>;
                    })}
                  </div>
                  {activeOption ? (
                    <div className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div><p className="font-bold text-slate-900">{activeOption.option.itemName ?? '옵션명 없음'}</p><p className="mt-1 font-mono text-xs text-slate-500">{activeOption.option.sellerSku ?? activeOption.option.externalOptionId}</p></div>
                      <label className="block text-xs font-bold text-slate-600">Sellpia 재고 검색<span className="relative mt-1.5 block"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label="Sellpia 재고 검색" value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="상품코드 · 상품명 · 옵션명 · 바코드" className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-purple-600" /></span></label>
                      <SellpiaOutOfStockToggle checked={includeOutOfStock} onCheckedChange={setIncludeOutOfStock} />
                      <div className="max-h-44 space-y-2 overflow-y-auto">
                        {inventorySearch.trim().length < 2 ? <EmptyLabel message="재고 상품을 찾으려면 2자 이상 입력하세요." />
                          : inventoryCandidates.isLoading ? <LoadingLabel>Sellpia 재고를 찾는 중입니다.</LoadingLabel>
                            : inventoryCandidates.error ? <ErrorLabel message={friendlyError(inventoryCandidates.error) ?? 'Sellpia 재고를 불러오지 못했습니다.'} />
                              : (inventoryCandidates.data?.items.length ?? 0) === 0 ? <EmptyLabel message="조건에 맞는 Sellpia 재고가 없습니다." />
                                : inventoryCandidates.data?.items.map((candidate) => {
                                  const selected = activeDraft.some(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId === candidate.sellpiaInventorySkuId);
                                  return <div key={candidate.sellpiaInventorySkuId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"><div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{candidate.code} · {candidate.name}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{candidate.optionName ?? '옵션 없음'} · 현재고 {formatNumber(candidate.currentStock)}</p></div><button type="button" aria-label={`${candidate.code} 재고 선택`} disabled={selected} onClick={() => addInventory(candidate)} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-purple-100 px-3 py-2 text-xs font-bold text-purple-700 disabled:opacity-50"><Plus size={13} /> {selected ? '선택됨' : '선택'}</button></div>;
                                })}
                      </div>
                      <div className="space-y-2">
                        {activeDraft.length === 0 ? <EmptyLabel message="이 옵션이 차감할 Sellpia 재고를 선택해 주세요." /> : activeDraft.map((component, index) => (
                          <div key={component.sellpiaInventorySkuId} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_120px_40px]">
                            <div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{component.code} · {component.name}</p><p className="mt-1 truncate text-[11px] text-slate-500">{component.optionName ?? '옵션 없음'} · 현재고 {formatNumber(component.currentStock)}</p></div>
                            <label className="text-xs font-bold text-slate-600">차감 수량<input aria-label={`${component.code} 차감 수량`} type="number" min={1} required value={component.quantity ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [activeOption.option.id]: (current[activeOption.option.id] ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value === '' ? null : Number(event.target.value) } : item) }))} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>
                            <button type="button" aria-label={`${component.code} 재고 제거`} onClick={() => setDrafts((current) => ({ ...current, [activeOption.option.id]: (current[activeOption.option.id] ?? []).filter((_, itemIndex) => itemIndex !== index) }))} className="mt-4 flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
            <div>{row.linkedProduct ? <button type="button" disabled={isPending} onClick={() => void unlink()} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">운영상품 연결 해제</button> : null}</div>
            <div className="flex gap-2"><Dialog.Close asChild><button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">취소</button></Dialog.Close><button type="button" disabled={!canSave} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saveMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} 운영상품·재고 매칭 저장</button></div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function draftsFrom(options: ChannelOptionMatchingQueueRow[]): Record<string, DraftComponent[]> {
  return Object.fromEntries(options.map(({ option }) => [
    option.id,
    option.inventoryComponents.map((component) => ({
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      code: component.code,
      name: component.name,
      optionName: component.optionName,
      currentStock: component.currentStock,
      quantity: component.quantity,
    })),
  ]));
}

function optionSearch(row?: ChannelOptionMatchingQueueRow): string {
  if (!row) return '';
  const sellerSku = row.option.sellerSku?.trim() ?? '';
  const sellerSkuLooksLikeChannelId = sellerSku === row.option.externalOptionId
    || /^\d+$/.test(sellerSku);
  return !sellerSkuLooksLikeChannelId && sellerSku
    ? sellerSku
    : row.option.itemName ?? sellerSku;
}

function recipeSignature(components: Array<{ sellpiaInventorySkuId: string; quantity: number | null }>): string {
  return [...components]
    .map(({ sellpiaInventorySkuId, quantity }) => `${sellpiaInventorySkuId}:${quantity ?? ''}`)
    .sort()
    .join('|');
}

function LoadingLabel({ children }: { children: string }) {
  return <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> {children}</p>;
}

function EmptyLabel({ message }: { message: string }) {
  return <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-xs text-slate-500">{message}</p>;
}

function ErrorLabel({ message }: { message: string }) {
  return <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{message}</p>;
}
