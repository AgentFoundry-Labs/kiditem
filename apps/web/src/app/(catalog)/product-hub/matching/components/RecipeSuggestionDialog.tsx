'use client';

import { useEffect, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductRecipeComponentCandidate } from '@kiditem/shared/product-operations';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelRecipeSuggestionResponse,
} from '@kiditem/shared/channel-product-matching';
import { SellpiaOutOfStockToggle } from '@/components/SellpiaOutOfStockToggle';
import { friendlyError, isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import {
  getChannelRecipeSuggestion,
} from '../lib/channel-sku-matching-api';
import {
  useLinkChannelListingOptionRecipe,
  useRecipeComponentCandidates,
} from '../hooks/useChannelSkuMappings';

type RecipeChoice = {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number;
  source: 'suggestion' | 'search';
  recommendedQuantity: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  already_configured: '이미 재고 연결됨',
  unique_code: '상품코드 추천',
  unique_barcode: '바코드 추천',
  confirmed_manual_match_alias: 'Sellpia 수동매칭 추천',
  exact_name_option: '상품명+옵션 추천',
  exact_name: '상품명 추천',
  high_confidence_name: '고신뢰 상품명 추천',
  identifier_name_mismatch: '상품코드·상품명 불일치',
  quantity_review: '수량 확인 필요',
  conflict: '충돌',
  ambiguous: '복수 후보',
  name_review_only: '이름 검토 필요',
  no_match: '추천 후보 없음',
};

export function RecipeSuggestionDialog({
  open,
  row,
  onOpenChange,
}: {
  open: boolean;
  row: ChannelOptionMatchingQueueRow;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const linkMutation = useLinkChannelListingOptionRecipe();
  const [inventorySearch, setInventorySearch] = useState('');
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);
  const [selected, setSelected] = useState<RecipeChoice | null>(null);
  const [quantity, setQuantity] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setInventorySearch(row.option.sellerSku ?? row.option.itemName ?? '');
    setIncludeOutOfStock(false);
    setSelected(null);
    setQuantity(null);
  }, [open, row.option.id, row.option.itemName, row.option.sellerSku]);

  const suggestion = useQuery({
    queryKey: queryKeys.channelProductMappings.recipeSuggestion(row.option.id),
    queryFn: () => getChannelRecipeSuggestion(row.option.id),
    enabled: open,
  });
  const candidateQuery = useRecipeComponentCandidates(
    inventorySearch,
    includeOutOfStock,
    open,
  );

  useEffect(() => {
    if (!open || selected || !suggestion.data) return;
    const proposal = suggestion.data.proposals[0];
    if (!proposal) return;
    const nextChoice = choiceFromProposal(proposal);
    setSelected(nextChoice);
    setQuantity(proposal.recommendedQuantity ?? suggestion.data.recommendedQuantity ?? 1);
  }, [open, selected, suggestion.data]);

  const data = suggestion.data;
  const hasLinkedVariant = Boolean(row.option.productVariantId);
  const hasExistingRecipe = Boolean(data?.existingComponents.length)
    || row.recipeStatus === 'matched'
    || row.recipeStatus === 'review_required';
  const quantityValue = quantity ?? 0;
  const canSave = Boolean(
    hasLinkedVariant
    && selected
    && Number.isSafeInteger(quantityValue)
    && quantityValue > 0
    && !hasExistingRecipe,
  );
  const errorMessage = linkMutation.error
    ? (isApiError(linkMutation.error) && linkMutation.error.status === 409
      ? '이미 다른 재고 연결이 확정되어 있습니다. 상품 상세에서 현재 레시피를 확인해 주세요.'
      : friendlyError(linkMutation.error) ?? '재고 연결을 저장하지 못했습니다.')
    : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !canSave) return;
    try {
      const result = await linkMutation.mutateAsync({
        channelListingOptionId: row.option.id,
        sellpiaInventorySkuId: selected.sellpiaInventorySkuId,
        quantity: quantityValue,
      });
      toast.success(result.status === 'created'
        ? 'Sellpia 재고 연결을 저장했습니다.'
        : '이미 같은 Sellpia 재고 연결이 확정되어 있습니다.');
      onOpenChange(false);
    } catch {
      // Rendered through errorMessage.
    }
  };

  const openRecipe = () => {
    const masterProductId = data?.masterProductId ?? row.linkedVariant?.masterProductId;
    const productVariantId = data?.productVariantId ?? row.option.productVariantId;
    if (!masterProductId || !productVariantId) return;
    const search = new URLSearchParams({ recipeVariant: productVariantId });
    if (selected?.code) search.set('recipeSearch', selected.code);
    router.push(`/product-hub/${masterProductId}?${search}#variant-${productVariantId}`);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !linkMutation.isPending && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] flex max-h-[92vh] w-[min(94vw,860px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-extrabold text-slate-900">
                Sellpia 재고 연결
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-600">
                이 채널 옵션이 차감할 Sellpia 재고 상품과 수량을 선택합니다.
              </Dialog.Description>
              <p className="mt-3 truncate text-sm font-semibold text-slate-900">
                {row.option.itemName ?? '옵션명 없음'} · <span className="font-mono">{row.option.sellerSku ?? row.option.externalOptionId}</span>
              </p>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X size={18} />
            </Dialog.Close>
          </header>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
              <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-500">KidItem 판매 옵션</p>
                  <p className="mt-1 truncate font-bold text-slate-900">
                    {row.linkedVariant
                      ? `${row.linkedVariant.code} · ${row.linkedVariant.name}`
                      : '운영 옵션 미연결'}
                  </p>
                  {row.linkedVariant?.optionLabel ? (
                    <p className="mt-1 truncate text-xs text-slate-500">{row.linkedVariant.optionLabel}</p>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-500">연결 상태</p>
                  <p className={cn(
                    'mt-1 font-bold',
                    hasExistingRecipe ? 'text-emerald-700' : 'text-slate-900',
                  )}>
                    {hasExistingRecipe ? '이미 재고 연결됨' : hasLinkedVariant ? '재고 연결 가능' : '옵션 연결 필요'}
                  </p>
                </div>
              </section>

              {!hasLinkedVariant ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  재고를 연결하려면 먼저 이 채널 옵션을 KidItem 판매 옵션에 연결해 주세요.
                </p>
              ) : null}

              {suggestion.isLoading ? (
                <p className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
                  <Loader2 size={16} className="animate-spin" /> 추천 재고를 확인하는 중입니다.
                </p>
              ) : suggestion.error ? (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {friendlyError(suggestion.error) ?? '추천 재고를 불러오지 못했습니다.'}
                </p>
              ) : data ? (
                <SuggestionSection
                  data={data}
                  selected={selected}
                  onSelect={(choice) => {
                    setSelected(choice);
                    setQuantity(choice.recommendedQuantity ?? 1);
                  }}
                  onOpenRecipe={openRecipe}
                />
              ) : null}

              <section aria-label="Sellpia 재고 검색" className="rounded-xl border border-slate-200 bg-white p-4">
                <label className="text-xs font-bold text-slate-600">
                  Sellpia 재고 상품 검색
                  <span className="relative mt-1.5 block">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      aria-label="Sellpia 재고 상품 검색"
                      value={inventorySearch}
                      onChange={(event) => setInventorySearch(event.target.value)}
                      placeholder="상품코드 · 상품명 · 옵션명 · 바코드"
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-[var(--primary,#7048e8)]"
                    />
                  </span>
                </label>
                <SellpiaOutOfStockToggle
                  checked={includeOutOfStock}
                  onCheckedChange={setIncludeOutOfStock}
                  className="mt-3"
                />
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                  {inventorySearch.trim().length < 2 ? (
                    <p className="px-2 py-3 text-xs text-slate-500">재고 상품을 찾으려면 2자 이상 입력하세요.</p>
                  ) : candidateQuery.isLoading ? (
                    <p className="flex items-center gap-2 px-2 py-3 text-xs text-slate-500">
                      <Loader2 size={13} className="animate-spin" /> 재고 상품을 불러오는 중입니다.
                    </p>
                  ) : candidateQuery.error ? (
                    <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {friendlyError(candidateQuery.error) ?? '재고 상품을 불러오지 못했습니다.'}
                    </p>
                  ) : candidateQuery.data?.items.length ? candidateQuery.data.items.map((item) => (
                    <SkuChoiceRow
                      key={item.sellpiaInventorySkuId}
                      choice={choiceFromCandidate(item)}
                      selectedId={selected?.sellpiaInventorySkuId ?? null}
                      onSelect={(choice) => {
                        setSelected(choice);
                        setQuantity(1);
                      }}
                    />
                  )) : (
                    <p className="px-2 py-3 text-xs text-slate-500">조건에 맞는 Sellpia 재고 상품이 없습니다.</p>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-500">확정할 재고 연결</p>
                {selected ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
                    <div className="min-w-0">
                      <p className="truncate font-extrabold text-slate-900">{selected.code} · {selected.name}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {selected.optionName ?? '옵션 없음'} · 현재고 {formatNumber(selected.currentStock)}
                      </p>
                    </div>
                    <label className="text-xs font-bold text-slate-600">
                      차감 수량
                      <input
                        aria-label="차감 수량"
                        type="number"
                        min={1}
                        required
                        value={quantity ?? ''}
                        onChange={(event) => setQuantity(event.target.value === '' ? null : Number(event.target.value))}
                        className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--primary,#7048e8)]"
                      />
                    </label>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">추천 재고를 선택하거나 직접 검색해서 선택해 주세요.</p>
                )}
                {hasExistingRecipe ? (
                  <p className="mt-3 text-sm font-semibold text-amber-800">
                    기존 레시피는 이 화면에서 덮어쓰지 않습니다. 변경이 필요하면 상품 상세에서 전체 레시피를 편집해 주세요.
                  </p>
                ) : null}
                {errorMessage ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p> : null}
              </section>
            </div>

            <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <Dialog.Close asChild>
                <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                  취소
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={!canSave || linkMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--primary,#7048e8)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {linkMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                재고 연결 저장
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SuggestionSection({
  data,
  selected,
  onSelect,
  onOpenRecipe,
}: {
  data: ChannelRecipeSuggestionResponse;
  selected: RecipeChoice | null;
  onSelect: (choice: RecipeChoice) => void;
  onOpenRecipe: () => void;
}) {
  if (data.existingComponents.length > 0) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-bold text-emerald-800">현재 연결된 Sellpia 재고</p>
            <ul className="mt-2 space-y-1 text-sm text-emerald-900">
              {data.existingComponents.map((component) => (
                <li key={component.sellpiaInventorySkuId}>
                  <span className="font-mono font-bold">{component.code}</span> · 수량 {formatNumber(component.quantity)}
                </li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={onOpenRecipe} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800">
            상품 상세에서 편집
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-900">추천 재고</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {STATUS_LABEL[data.status] ?? data.status} · {data.reason}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {data.proposals.length ? data.proposals.map((proposal) => (
          <SkuChoiceRow
            key={proposal.sellpiaInventorySkuId}
            choice={choiceFromProposal(proposal)}
            selectedId={selected?.sellpiaInventorySkuId ?? null}
            onSelect={onSelect}
          />
        )) : (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
            자동 추천할 재고가 없습니다. 아래 검색에서 Sellpia 재고 상품을 직접 선택해 주세요.
          </p>
        )}
      </div>
    </section>
  );
}

function SkuChoiceRow({
  choice,
  selectedId,
  onSelect,
}: {
  choice: RecipeChoice;
  selectedId: string | null;
  onSelect: (choice: RecipeChoice) => void;
}) {
  const isSelected = selectedId === choice.sellpiaInventorySkuId;
  return (
    <div className={cn(
      'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
      isSelected ? 'border-[var(--primary,#7048e8)] bg-purple-50' : 'border-slate-200 bg-white',
    )}>
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-slate-900">{choice.code} · {choice.name}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {choice.optionName ?? '옵션 없음'} · 현재고 {formatNumber(choice.currentStock)}
          {choice.recommendedQuantity ? ` · 추천 수량 ${formatNumber(choice.recommendedQuantity)}` : ''}
        </p>
      </div>
      <button
        type="button"
        aria-label={`${choice.code} 재고 선택`}
        disabled={isSelected}
        onClick={() => onSelect(choice)}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--primary-soft,#f0ebff)] px-3 py-2 text-xs font-bold text-[var(--primary,#7048e8)] disabled:opacity-60"
      >
        <Check size={13} /> {isSelected ? '선택됨' : '선택'}
      </button>
    </div>
  );
}

function choiceFromProposal(
  proposal: ChannelRecipeSuggestionResponse['proposals'][number],
): RecipeChoice {
  return {
    sellpiaInventorySkuId: proposal.sellpiaInventorySkuId,
    code: proposal.code,
    name: proposal.name,
    optionName: proposal.optionName,
    currentStock: proposal.currentStock,
    source: 'suggestion',
    recommendedQuantity: proposal.recommendedQuantity,
  };
}

function choiceFromCandidate(item: ProductRecipeComponentCandidate): RecipeChoice {
  return {
    sellpiaInventorySkuId: item.sellpiaInventorySkuId,
    code: item.code,
    name: item.name,
    optionName: item.optionName,
    currentStock: item.currentStock,
    source: 'search',
    recommendedQuantity: null,
  };
}
