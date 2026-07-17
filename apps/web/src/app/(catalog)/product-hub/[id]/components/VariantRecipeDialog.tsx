'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import {
  ProductRecipeComponentCandidateListResponseSchema,
  type ProductRecipeComponentCandidate,
  type ProductVariantDetail,
} from '@kiditem/shared/product-operations';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';

type DraftComponent = {
  clientId: string;
  sellpiaInventorySkuId: string;
  quantity: number | null;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number;
};

export function VariantRecipeDialog({
  open,
  onOpenChange,
  variant,
  initialInventorySearch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: ProductVariantDetail;
  initialInventorySearch?: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftComponent[]>(() => toDraft(variant));
  const [inventorySearch, setInventorySearch] = useState(initialInventorySearch ?? '');
  const nextDraftId = useRef(0);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(variant));
      setInventorySearch(initialInventorySearch ?? '');
    }
  }, [initialInventorySearch, open, variant]);

  const candidateParams = useMemo(() => {
    const params = new URLSearchParams({
      search: inventorySearch.trim(),
      limit: '20',
    });
    return params;
  }, [inventorySearch]);
  const candidateKeyParams = useMemo(
    () => Object.fromEntries(candidateParams.entries()),
    [candidateParams],
  );
  const candidateQuery = useQuery({
    queryKey: queryKeys.products.operations.recipeCandidates(candidateKeyParams),
    queryFn: () => apiClient.getParsed(
      `/api/products/recipe-component-candidates?${candidateParams.toString()}`,
      ProductRecipeComponentCandidateListResponseSchema,
    ),
    enabled: open && inventorySearch.trim().length >= 2,
  });

  const mutation = useMutation({
    mutationFn: () => apiClient.put<{ id: string }>(
      `/api/products/variants/${variant.id}/components`,
      {
        components: draft.map((component) => ({
          sellpiaInventorySkuId: component.sellpiaInventorySkuId.trim(),
          quantity: component.quantity,
        })),
        expectedRecipe: variant.components.map((component) => ({
          id: component.id,
          sellpiaInventorySkuId: component.sellpiaInventorySkuId,
          quantity: component.quantity,
          source: component.source,
          confirmedBy: component.confirmedBy,
          confirmedAt: component.confirmedAt,
        })),
      },
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.channelProductMappings.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      ]);
      onOpenChange(false);
    },
  });

  const hasInvalidComponent = draft.some((component) => (
    component.sellpiaInventorySkuId.trim().length === 0
    || component.quantity === null
    || !Number.isInteger(component.quantity)
    || component.quantity <= 0
  ));
  const hasDuplicates = new Set(draft.map((component) => component.sellpiaInventorySkuId.trim().toLowerCase())).size !== draft.length;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (hasInvalidComponent || hasDuplicates) return;
    mutation.mutate();
  };
  const addInventorySku = (item: ProductRecipeComponentCandidate) => {
    setDraft((current) => {
      if (current.some(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId === item.sellpiaInventorySkuId)) {
        return current;
      }
      return [...current, {
        clientId: `recipe-${variant.id}-${nextDraftId.current++}`,
        sellpiaInventorySkuId: item.sellpiaInventorySkuId,
        quantity: null,
        code: item.code,
        name: item.name,
        optionName: item.optionName,
        currentStock: item.currentStock,
      }];
    });
  };
  const errorMessage = mutation.error
    ? (isApiError(mutation.error) && mutation.error.status === 409
      ? '다른 운영자가 레시피를 변경했습니다. 상세를 새로고침한 뒤 다시 확인해 주세요.'
      : isApiError(mutation.error) ? mutation.error.detail : '옵션 레시피를 저장하지 못했습니다.')
    : null;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !mutation.isPending && onOpenChange(nextOpen)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] flex max-h-[92vh] w-[min(94vw,820px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-6 py-5">
            <div>
              <Dialog.Title className="text-lg font-extrabold text-[var(--text-primary)]">구성 레시피 편집</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">
                {variant.name} 옵션이 소비하는 Sellpia SKU 전체 구성을 한 번에 교체합니다.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X size={18} /></Dialog.Close>
          </header>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="overflow-y-auto p-6">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                저장 시 현재 레시피 전체가 교체됩니다. 확인된 Sellpia 재고 SKU만 선택할 수 있고, 물리 재고는 이곳에서 수정할 수 없습니다.
              </div>

              <section aria-label="Sellpia 구성품 검색" className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
                <label className="text-xs font-bold text-[var(--text-secondary)]">
                  Sellpia 재고 SKU 검색
                  <span className="relative mt-1.5 block">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="search"
                      aria-label="Sellpia 재고 SKU 검색"
                      value={inventorySearch}
                      onChange={(event) => setInventorySearch(event.target.value)}
                      placeholder="상품코드 · 상품명 · 옵션명 · 바코드"
                      className="h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] pl-9 pr-3 text-sm text-[var(--text-primary)]"
                    />
                  </span>
                </label>
                <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                  {inventorySearch.trim().length < 2 ? (
                    <p className="px-2 py-3 text-xs text-[var(--text-tertiary)]">Sellpia 재고 SKU를 찾으려면 2자 이상 입력하세요.</p>
                  ) : candidateQuery.isLoading ? (
                    <p className="flex items-center gap-2 px-2 py-3 text-xs text-[var(--text-tertiary)]"><Loader2 size={13} className="animate-spin" /> 재고 SKU를 불러오는 중입니다.</p>
                  ) : candidateQuery.error ? (
                    <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">재고 SKU를 불러오지 못했습니다.</p>
                  ) : candidateQuery.data?.items.length ? candidateQuery.data.items.map((item) => {
                    const selected = draft.some(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId === item.sellpiaInventorySkuId);
                    return (
                      <div key={item.sellpiaInventorySkuId} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-extrabold text-[var(--text-primary)]">{item.code} · {item.name}</p>
                          <p className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]">{item.optionName ?? '옵션 없음'} · 재고 {item.currentStock}</p>
                          <code className="mt-0.5 block select-all truncate text-[10px] text-[var(--text-muted)]">{item.sellpiaInventorySkuId}</code>
                        </div>
                        <button
                          type="button"
                          aria-label={`${item.code} 구성품 추가`}
                          disabled={selected}
                          onClick={() => addInventorySku(item)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--primary-soft)] px-3 py-2 text-xs font-bold text-[var(--primary)] disabled:opacity-50"
                        >
                          <Plus size={13} /> {selected ? '추가됨' : '추가'}
                        </button>
                      </div>
                    );
                  }) : (
                    <p className="px-2 py-3 text-xs text-[var(--text-tertiary)]">조건에 맞는 Sellpia 재고 SKU가 없습니다.</p>
                  )}
                </div>
              </section>

              <div className="mt-4 space-y-3">
                {draft.map((component, index) => (
                  <div key={component.clientId} className="grid gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4 sm:grid-cols-[1fr_120px_40px]">
                    <div className="min-w-0 text-xs text-[var(--text-secondary)]">
                      <p className="truncate font-extrabold text-[var(--text-primary)]">{component.code} · {component.name}</p>
                      <p className="mt-1 truncate">{component.optionName ?? '옵션 없음'} · 현재고 {component.currentStock}</p>
                      <code className="mt-1 block select-all truncate text-[10px] text-[var(--text-muted)]">{component.sellpiaInventorySkuId}</code>
                    </div>
                    <label className="text-xs font-bold text-[var(--text-secondary)]">
                      <span className="sr-only">{component.code} </span>필요 수량
                      <input
                        aria-label={`${component.code} 필요 수량`}
                        type="number"
                        min={1}
                        required
                        value={component.quantity ?? ''}
                        onChange={(event) => updateDraft(setDraft, index, { quantity: event.target.value === '' ? null : Number(event.target.value) })}
                        className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={`${component.code} 제거`}
                      onClick={() => setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      className="mt-5 flex h-10 w-10 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {hasDuplicates ? <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">같은 Sellpia SKU를 중복으로 넣을 수 없습니다.</p> : null}
              {errorMessage ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p> : null}
            </div>

            <footer className="flex justify-end gap-2 border-t border-[var(--border-subtle)] px-6 py-4">
              <Dialog.Close asChild><button type="button" className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)]">취소</button></Dialog.Close>
              <button
                type="submit"
                disabled={mutation.isPending || hasInvalidComponent || hasDuplicates}
                className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {mutation.isPending ? '저장 중...' : '전체 레시피 저장'}
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function toDraft(variant: ProductVariantDetail): DraftComponent[] {
  return variant.components.map((component) => ({
    clientId: component.id,
    sellpiaInventorySkuId: component.sellpiaInventorySkuId,
    quantity: component.quantity,
    code: component.code,
    name: component.name,
    optionName: component.optionName,
    currentStock: component.currentStock,
  }));
}

function updateDraft(
  setDraft: Dispatch<SetStateAction<DraftComponent[]>>,
  index: number,
  update: Partial<DraftComponent>,
) {
  setDraft((current) => current.map((component, itemIndex) => (
    itemIndex === index ? { ...component, ...update } : component
  )));
}
