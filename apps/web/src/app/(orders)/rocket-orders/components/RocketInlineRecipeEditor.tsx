"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import {
  MasterProductOperationsDetailSchema,
  ProductRecipeComponentCandidateListResponseSchema,
  type ProductRecipeComponentCandidate,
} from "@kiditem/shared/product-operations";
import type { RocketPurchasePreviewComponent } from "@kiditem/shared/rocket-purchase-preview";
import { apiClient } from "@/lib/api-client";
import { friendlyError } from "@/lib/api-error";
import { recipeConflictMessage } from "@/lib/recipe-conflict";
import { queryKeys } from "@/lib/query-keys";
import { SellpiaOutOfStockToggle } from "@/components/SellpiaOutOfStockToggle";
import { toast } from "sonner";

type RecipeDraft = Omit<RocketPurchasePreviewComponent, 'quantity'> & {
  quantity: number | null;
};

export function RocketInlineRecipeEditor({
  masterProductId,
  channelListingOptionId,
  productName,
  existingComponents,
  onSaved,
  onCancel,
}: {
  masterProductId: string;
  channelListingOptionId: string;
  productName: string;
  existingComponents: RocketPurchasePreviewComponent[];
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);
  const hasExistingRecipe = existingComponents.length > 0;
  const [draft, setDraft] = useState<RecipeDraft[]>(() =>
    existingComponents.map((component) => ({
      masterProductId: component.masterProductId,
      code: component.code,
      name: component.name,
      optionName: component.optionName,
      currentStock: component.currentStock,
      quantity: component.quantity,
    })),
  );
  const [draftTouched, setDraftTouched] = useState(false);
  // The recipe this editor loaded. A refetch after the operator started editing must not replace
  // it, or the save would pass the server's conflict check against another writer's newer recipe.
  const [loadedRecipe, setLoadedRecipe] = useState(() => recipeOf(existingComponents));
  const candidateParams = useMemo(
    () =>
      new URLSearchParams({
        search: search.trim(),
        limit: "20",
        stockStatus: includeOutOfStock ? "all" : "in_stock",
      }),
    [includeOutOfStock, search],
  );
  const candidateKeyParams = useMemo(
    () => Object.fromEntries(candidateParams.entries()),
    [candidateParams],
  );
  const candidates = useQuery({
    queryKey:
      queryKeys.products.operations.recipeCandidates(candidateKeyParams),
    queryFn: () =>
      apiClient.getParsed(
        `/api/products/recipe-component-candidates?${candidateParams.toString()}`,
        ProductRecipeComponentCandidateListResponseSchema,
      ),
    enabled: search.trim().length >= 2,
  });
  const product = useQuery({
    queryKey: queryKeys.products.operations.detail(masterProductId),
    queryFn: () =>
      apiClient.getParsed(
        `/api/products/masters/${masterProductId}`,
        MasterProductOperationsDetailSchema,
      ),
    enabled: hasExistingRecipe,
  });
  const currentOption = product.data?.channelListings
    .flatMap(({ options }) => options)
    .find(({ id }) => id === channelListingOptionId);

  useEffect(() => {
    if (!currentOption || draftTouched) return;
    setLoadedRecipe(recipeOf(currentOption.inventoryComponents));
    setDraft(
      currentOption.inventoryComponents.map((component) => ({
        masterProductId: component.masterProductId,
        code: component.code,
        name: component.name,
        optionName: component.optionName,
        currentStock: component.currentStock,
        quantity: component.quantity,
      })),
    );
  }, [currentOption, draftTouched]);

  const save = useMutation({
    mutationFn: async () => {
      const components = draft.map(({ masterProductId, quantity }) => ({
        masterProductId,
        quantity,
      }));
      await apiClient.put(
        `/api/channels/options/${channelListingOptionId}/inventory-components`,
        { expectedComponents: loadedRecipe, components },
      );
      return { mode: hasExistingRecipe ? ("replaced" as const) : ("created" as const) };
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.products.operations.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.channelProductMappings.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.channelSkuAvailability.all,
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      ]);
      if (result.mode === "replaced") {
        toast.success(
          "Sellpia 재고 구성을 수정했습니다. 현재 발주를 다시 계산합니다.",
        );
      } else if (result.mode === "created") {
        toast.success(
          "Sellpia 재고 구성을 연결했습니다. 현재 발주를 다시 계산합니다.",
        );
      } else {
        toast.info(
          "이미 연결된 재고 구성을 기준으로 현재 발주를 다시 계산합니다.",
        );
      }
      await onSaved();
    },
  });

  const hasInvalidQuantity = draft.some(
    ({ quantity }) =>
      quantity === null || !Number.isInteger(quantity) || quantity <= 0,
  );
  const canSave =
    draft.length > 0 &&
    !hasInvalidQuantity &&
    !save.isPending;
  const addCandidate = (candidate: ProductRecipeComponentCandidate) => {
    setDraftTouched(true);
    setDraft((current) =>
      current.some(
        ({ masterProductId }) =>
          masterProductId === candidate.masterProductId,
      )
        ? current
        : [...current, { ...candidate, quantity: 1 }],
    );
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    save.mutate();
  };
  const errorMessage = product.error
    ? "현재 Sellpia 재고 구성을 불러오지 못했습니다."
    : save.error
      ? (recipeConflictMessage(save.error)
        ?? friendlyError(save.error)
        ?? "Sellpia 재고 구성을 저장하지 못했습니다.")
      : null;

  return (
    <section
      aria-label={`${productName} Sellpia 재고 연결`}
      className="rounded-xl border border-purple-200 bg-purple-50/60 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">
            Sellpia 재고 {hasExistingRecipe ? "수정" : "연결"}
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            이 상품 1개를 출고할 때 차감할 Sellpia 재고와 구성 수량을
            선택하세요.
          </p>
        </div>
        <button
          type="button"
          aria-label="재고 연결 닫기"
          disabled={save.isPending}
          onPointerDown={(event) => {
            event.preventDefault();
            onCancel();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            onCancel();
          }}
          onClick={onCancel}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-white disabled:opacity-50"
        >
          <X size={16} />
        </button>
      </div>

      <form
        onSubmit={submit}
        className="mt-3 grid gap-4 xl:grid-cols-[minmax(360px,1fr)_minmax(360px,1fr)]"
      >
        <div>
          <label className="relative block">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              aria-label="Sellpia 상품 코드 또는 상품명 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sellpia 상품 코드 또는 상품명"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800"
            />
          </label>
          <SellpiaOutOfStockToggle
            checked={includeOutOfStock}
            onCheckedChange={setIncludeOutOfStock}
            className="mt-2"
          />
          <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
            {search.trim().length < 2 ? (
              <p className="px-2 py-3 text-xs text-slate-500">
                2자 이상 입력해 재고를 검색하세요.
              </p>
            ) : candidates.isLoading ? (
              <p className="flex items-center gap-2 px-2 py-3 text-xs text-slate-500">
                <Loader2 size={13} className="animate-spin" /> 재고 검색 중
              </p>
            ) : candidates.error ? (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"
              >
                Sellpia 재고를 불러오지 못했습니다.
              </p>
            ) : candidates.data?.items.length ? (
              candidates.data.items.map((candidate) => {
                const selected = draft.some(
                  ({ masterProductId }) =>
                    masterProductId === candidate.masterProductId,
                );
                return (
                  <div
                    key={candidate.masterProductId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-800">
                        {candidate.code} · {candidate.name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {candidate.optionName ?? "옵션 없음"} · 현재고{" "}
                        {candidate.currentStock === null
                          ? "미수집"
                          : candidate.currentStock.toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`${candidate.code} 재고 추가`}
                      disabled={selected}
                      onClick={() => addCandidate(candidate)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-purple-300 bg-white px-2.5 py-1.5 text-xs font-bold text-purple-700 disabled:opacity-50"
                    >
                      <Plus size={12} /> {selected ? "추가됨" : "추가"}
                    </button>
                  </div>
                );
              })
            ) : (
              <p className="px-2 py-3 text-xs text-slate-500">
                검색 결과가 없습니다.
              </p>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="space-y-2">
            {draft.length === 0 ? (
              <p className="rounded-lg border border-dashed border-purple-200 bg-white/70 px-3 py-5 text-center text-xs text-slate-500">
                왼쪽 검색 결과에서 사용할 재고를 추가하세요.
              </p>
            ) : (
              draft.map((component, index) => (
                <div
                  key={component.masterProductId}
                  className="grid grid-cols-[minmax(0,1fr)_96px_32px] items-end gap-2 rounded-lg border border-purple-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0 pb-1">
                    <p className="truncate text-xs font-bold text-slate-800">
                      {component.code ?? '연결 없음'} · {component.name ?? '삭제된 재고'}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {component.optionName ?? "옵션 없음"} · 현재고{" "}
                      {component.currentStock === null
                        ? "미수집"
                        : component.currentStock.toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <label className="text-[11px] font-semibold text-slate-600">
                    구성 수량
                    <input
                      type="number"
                      min={1}
                      step={1}
                      required
                      aria-label={`${component.code ?? '연결 없음'} 구성 수량`}
                      value={component.quantity ?? ""}
                      onChange={(event) =>
                        {
                          setDraftTouched(true);
                          setDraft((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    quantity:
                                      event.target.value === ""
                                        ? null
                                        : Number(event.target.value),
                                  }
                                : item,
                            ),
                          );
                        }
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`${component.code ?? '연결 없음'} 재고 제거`}
                    onClick={() =>
                      {
                        setDraftTouched(true);
                        setDraft((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        );
                      }
                    }
                    className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
          {errorMessage ? (
            <p
              role="alert"
              className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              {errorMessage}
            </p>
          ) : null}
          <div className="mt-auto flex justify-end gap-2 pt-3">
            <button
              type="button"
              disabled={save.isPending}
              onPointerDown={(event) => {
                event.preventDefault();
                onCancel();
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                onCancel();
              }}
              onClick={onCancel}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-700 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300"
            >
              {save.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : null}
              {save.isPending
                ? "저장·계산 중…"
                : hasExistingRecipe
                  ? "재고 수정하고 다시 계산"
                  : "재고 연결하고 다시 계산"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function recipeOf(components: ReadonlyArray<{ masterProductId: string; quantity: number }>) {
  return components.map(({ masterProductId, quantity }) => ({ masterProductId, quantity }));
}
