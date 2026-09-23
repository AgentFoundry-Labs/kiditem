'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductRecipeComponentCandidate } from '@kiditem/shared/product-operations';
import type { ChannelOptionMatchingQueueRow, ChannelProductMatchingQueueRow } from '@kiditem/shared/channel-product-matching';
import { SellpiaOutOfStockToggle } from '@/components/SellpiaOutOfStockToggle';
import { friendlyError } from '@/lib/api-error';
import { recipeConflictMessage } from '@/lib/recipe-conflict';
import { formatNumber } from '@/lib/utils';
import {
  useRecipeComponentCandidates,
  useSaveProductInventoryMatching,
} from '../hooks/useChannelSkuMappings';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ChannelProductMatchingQueueRow;
  options: ChannelOptionMatchingQueueRow[];
};

type DraftComponent = {
  masterProductId: string;
  code: string | null;
  name: string | null;
  optionName: string | null;
  currentStock: number | null;
  quantity: number | null;
};

export function ProductLinkDialog({ open, onOpenChange, row, options }: Props) {
  const [activeOptionId, setActiveOptionId] = useState<string | null>(options[0]?.option.id ?? null);
  const [inventorySearch, setInventorySearch] = useState('');
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftComponent[]>>(() => draftsFrom(options).drafts);
  // The recipes this dialog loaded. A refetch while it is open must not replace them, or a save
  // would pass the server's conflict check against another writer's newer recipe.
  const [loaded, setLoaded] = useState<Record<string, LoadedComponent[]>>(() => draftsFrom(options).loaded);
  const optionResetKey = options.map(({ option }) => `${option.id}:${option.updatedAt}`).join('|');

  useEffect(() => {
    if (!open) return;
    const firstAttention = options.find(({ option }) => option.inventoryComponents.length === 0) ?? options[0];
    const next = draftsFrom(options);
    setDrafts(next.drafts);
    setLoaded(next.loaded);
    setActiveOptionId(firstAttention?.option.id ?? null);
    setInventorySearch(optionSearch(firstAttention));
    setIncludeOutOfStock(false);
  }, [open, optionResetKey, row.listing.id]);

  const inventoryCandidates = useRecipeComponentCandidates(
    inventorySearch,
    includeOutOfStock,
    open && Boolean(activeOptionId),
  );
  const saveMutation = useSaveProductInventoryMatching();
  const activeOption = options.find(({ option }) => option.id === activeOptionId) ?? null;
  const activeDraft = activeOptionId ? drafts[activeOptionId] ?? [] : [];
  const isSingleOption = options.length === 1;

  const changedOptions = useMemo(() => options.flatMap((optionRow) => {
    const draft = drafts[optionRow.option.id] ?? [];
    const expectedComponents = loaded[optionRow.option.id] ?? [];
    if (recipeSignature(draft) === recipeSignature(expectedComponents)) return [];
    return [{
      channelListingOptionId: optionRow.option.id,
      expectedComponents,
      components: draft.map((component) => ({
        masterProductId: component.masterProductId,
        quantity: component.quantity!,
      })),
    }];
  }), [drafts, loaded, options]);
  const hasInvalidQuantity = Object.values(drafts).some((components) => components.some(
    ({ quantity }) => quantity === null || !Number.isSafeInteger(quantity) || quantity <= 0,
  ));
  const isPending = saveMutation.isPending;
  const canSave = changedOptions.length > 0 && !hasInvalidQuantity && !isPending;
  const hasConfiguredInventory = options.some(({ option }) => option.inventoryComponents.length > 0);

  const selectOption = (optionRow: ChannelOptionMatchingQueueRow) => {
    setActiveOptionId(optionRow.option.id);
    setInventorySearch(optionSearch(optionRow));
    setIncludeOutOfStock(false);
  };

  const addInventory = (candidate: ProductRecipeComponentCandidate) => {
    if (!activeOptionId) return;
    setDrafts((current) => {
      const components = current[activeOptionId] ?? [];
      if (components.some(({ masterProductId }) =>
        masterProductId === candidate.masterProductId)) return current;
      return {
        ...current,
        [activeOptionId]: [...components, {
          masterProductId: candidate.masterProductId,
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
    if (!canSave) return;
    try {
      await saveMutation.mutateAsync({
        channelListingId: row.listing.id,
        options: changedOptions,
      });
      toast.success(`재고 매칭을 저장했습니다. 변경 옵션 ${changedOptions.length}개`);
      onOpenChange(false);
    } catch (error) {
      toast.error(saveErrorMessage(error) ?? '재고 매칭을 저장하지 못했습니다. 반영 상태를 새로고침해 확인해 주세요.');
    }
  };

  const clearAll = async () => {
    if (!window.confirm('이 상품의 옵션별 재고 매칭을 모두 해제할까요?')) return;
    try {
      await saveMutation.mutateAsync({
        channelListingId: row.listing.id,
        options: options.map(({ option }) => ({
          channelListingOptionId: option.id,
          expectedComponents: loaded[option.id] ?? [],
          components: [],
        })),
      });
      toast.success('재고 매칭을 모두 해제했습니다.');
      onOpenChange(false);
    } catch (error) {
      toast.error(saveErrorMessage(error) ?? '재고 매칭을 해제하지 못했습니다.');
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] flex max-h-[94vh] w-[min(96vw,980px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-extrabold text-slate-900">
                재고 매칭
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-600">
                옵션별 Sellpia 재고를 선택하고 판매 1개당 차감 수량을 저장합니다. 단일 재고상품 요약은 자동으로 계산됩니다.
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
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="font-extrabold text-slate-900">Sellpia 재고 매칭</h3><p className="mt-1 text-xs text-slate-500">재고 상품을 선택하고 판매 1개당 차감 수량을 입력합니다.</p></div>
                <span className="text-xs font-bold text-slate-500">옵션 {formatNumber(options.length)}개 · 변경 {formatNumber(changedOptions.length)}개</span>
              </div>
              {options.length === 0 ? <EmptyLabel message="수집된 채널 옵션이 없습니다." /> : (
                <div className={`mt-4 grid gap-4 ${isSingleOption ? '' : 'lg:grid-cols-[260px_minmax(0,1fr)]'}`}>
                  {!isSingleOption ? <div className="max-h-[430px] space-y-2 overflow-y-auto">
                    {options.map((optionRow) => {
                      const components = drafts[optionRow.option.id] ?? [];
                      const active = optionRow.option.id === activeOptionId;
                      return <button key={optionRow.option.id} type="button" onClick={() => selectOption(optionRow)} className={`w-full rounded-xl border p-3 text-left ${active ? 'border-purple-500 bg-purple-50' : 'border-slate-200 bg-white'}`}>
                        <span className="block truncate text-sm font-bold text-slate-900">{optionRow.option.itemName ?? '옵션명 없음'}</span>
                        <span className="mt-1 block truncate font-mono text-xs text-slate-500">{optionRow.option.sellerSku ?? optionRow.option.externalOptionId}</span>
                        <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${components.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{components.length ? `재고 ${components.length}개 연결` : '재고 연결 필요'}</span>
                      </button>;
                    })}
                  </div> : null}
                  {activeOption ? (
                    <div className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-900">{isSingleOption ? '기본 옵션' : activeOption.option.itemName ?? '옵션명 없음'}</p>
                          {isSingleOption && activeOption.option.itemName ? <p className="mt-1 text-xs text-slate-600">{activeOption.option.itemName}</p> : null}
                          <p className="mt-1 font-mono text-xs text-slate-500">{activeOption.option.sellerSku ?? activeOption.option.externalOptionId}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${activeDraft.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {activeDraft.length ? <Check size={13} /> : null}{activeDraft.length ? `재고 ${activeDraft.length}개 연결` : '재고 연결 필요'}
                        </span>
                      </div>
                      <label className="block text-xs font-bold text-slate-600">Sellpia 재고 검색<span className="relative mt-1.5 block"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label="Sellpia 재고 검색" value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="상품코드 · 상품명 · 옵션명 · 바코드" className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-purple-600" /></span></label>
                      <SellpiaOutOfStockToggle checked={includeOutOfStock} onCheckedChange={setIncludeOutOfStock} />
                      <div className="max-h-44 space-y-2 overflow-y-auto">
                        {inventorySearch.trim().length < 2 ? <EmptyLabel message="재고 상품을 찾으려면 2자 이상 입력하세요." />
                          : inventoryCandidates.isLoading ? <LoadingLabel>Sellpia 재고를 찾는 중입니다.</LoadingLabel>
                            : inventoryCandidates.error ? <ErrorLabel message={friendlyError(inventoryCandidates.error) ?? 'Sellpia 재고를 불러오지 못했습니다.'} />
                              : (inventoryCandidates.data?.items.length ?? 0) === 0 ? <EmptyLabel message="조건에 맞는 Sellpia 재고가 없습니다." />
                                : inventoryCandidates.data?.items.map((candidate) => {
                                  const selected = activeDraft.some(({ masterProductId }) => masterProductId === candidate.masterProductId);
                                  return <div key={candidate.masterProductId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"><div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{candidate.code} · {candidate.name}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{candidate.optionName ?? '옵션 없음'} · 현재고 {stockLabel(candidate.currentStock)}</p></div><button type="button" aria-label={`${candidate.code} 재고 선택`} disabled={selected} onClick={() => addInventory(candidate)} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-purple-100 px-3 py-2 text-xs font-bold text-purple-700 disabled:opacity-50"><Plus size={13} /> {selected ? '선택됨' : '선택'}</button></div>;
                                })}
                      </div>
                      <div className="space-y-2">
                        {activeDraft.length === 0 ? <EmptyLabel message="이 옵션이 차감할 Sellpia 재고를 선택해 주세요." /> : activeDraft.map((component, index) => (
                          <div key={component.masterProductId} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_120px_40px]">
                            <div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{component.code ?? '연결 없음'} · {component.name ?? '삭제된 재고'}</p><p className="mt-1 truncate text-[11px] text-slate-500">{component.optionName ?? '옵션 없음'} · 현재고 {stockLabel(component.currentStock)}</p></div>
                            <label className="text-xs font-bold text-slate-600">차감 수량<input aria-label={`${component.code ?? '연결 없음'} 차감 수량`} type="number" min={1} required value={component.quantity ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [activeOption.option.id]: (current[activeOption.option.id] ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value === '' ? null : Number(event.target.value) } : item) }))} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>
                            <button type="button" aria-label={`${component.code ?? '연결 없음'} 재고 제거`} onClick={() => setDrafts((current) => ({ ...current, [activeOption.option.id]: (current[activeOption.option.id] ?? []).filter((_, itemIndex) => itemIndex !== index) }))} className="mt-4 flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
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
            <div>{hasConfiguredInventory ? <button type="button" disabled={isPending} onClick={() => void clearAll()} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">재고 매칭 전체 해제</button> : null}</div>
            <div className="flex gap-2"><Dialog.Close asChild><button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">취소</button></Dialog.Close><button type="button" disabled={!canSave} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saveMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} 재고 매칭 저장</button></div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type LoadedComponent = { masterProductId: string; quantity: number };

function draftsFrom(options: ChannelOptionMatchingQueueRow[]): {
  drafts: Record<string, DraftComponent[]>;
  loaded: Record<string, LoadedComponent[]>;
} {
  const loaded = Object.fromEntries(options.map(({ option }) => [
    option.id,
    option.inventoryComponents.map(({ masterProductId, quantity }) => ({ masterProductId, quantity })),
  ]));
  const drafts = Object.fromEntries(options.map(({ option }) => [
    option.id,
    option.inventoryComponents.map((component) => ({
      masterProductId: component.masterProductId,
      code: component.code,
      name: component.name,
      optionName: component.optionName,
      currentStock: component.currentStock,
      quantity: component.quantity,
    })),
  ]));
  return { drafts, loaded };
}

function saveErrorMessage(error: unknown): string | null {
  return recipeConflictMessage(error) ?? friendlyError(error);
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

function recipeSignature(components: Array<{ masterProductId: string; quantity: number | null }>): string {
  return [...components]
    .map(({ masterProductId, quantity }) => `${masterProductId}:${quantity ?? ''}`)
    .sort()
    .join('|');
}

function stockLabel(value: number | null): string {
  return value === null ? '미수집' : formatNumber(value);
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
