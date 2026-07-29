"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import {
  ProductRecipeComponentCandidateListResponseSchema,
  type CreateProductVariantRecipesIfEmptyResponse,
  type ProductRecipeComponentCandidate,
} from "@kiditem/shared/product-operations";
import { apiClient } from "@/lib/api-client";
import { friendlyError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { toast } from "sonner";

type RecipeDraft = ProductRecipeComponentCandidate & {
  quantity: number;
};

export function RocketInlineRecipeEditor({
  productVariantId,
  productName,
  onSaved,
  onCancel,
}: {
  productVariantId: string;
  productName: string;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<RecipeDraft[]>([]);
  const candidateParams = useMemo(
    () =>
      new URLSearchParams({
        search: search.trim(),
        limit: "20",
      }),
    [search],
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
  const save = useMutation({
    mutationFn: () =>
      apiClient.post<CreateProductVariantRecipesIfEmptyResponse>(
        "/api/products/variant-recipes/create-if-empty",
        {
          recipes: [
            {
              productVariantId,
              components: draft.map(({ sellpiaInventorySkuId, quantity }) => ({
                sellpiaInventorySkuId,
                quantity,
              })),
            },
          ],
        },
      ),
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
      if (result.appliedProductVariantIds.includes(productVariantId)) {
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
    ({ quantity }) => !Number.isInteger(quantity) || quantity <= 0,
  );
  const canSave = draft.length > 0 && !hasInvalidQuantity && !save.isPending;
  const addCandidate = (candidate: ProductRecipeComponentCandidate) => {
    setDraft((current) =>
      current.some(
        ({ sellpiaInventorySkuId }) =>
          sellpiaInventorySkuId === candidate.sellpiaInventorySkuId,
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
  const errorMessage = save.error
    ? (friendlyError(save.error) ?? "Sellpia 재고 구성을 저장하지 못했습니다.")
    : null;

  return (
    <section
      aria-label={`${productName} Sellpia 재고 연결`}
      className="rounded-xl border border-purple-200 bg-purple-50/60 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">
            Sellpia 재고 연결
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
                  ({ sellpiaInventorySkuId }) =>
                    sellpiaInventorySkuId === candidate.sellpiaInventorySkuId,
                );
                return (
                  <div
                    key={candidate.sellpiaInventorySkuId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-800">
                        {candidate.code} · {candidate.name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {candidate.optionName ?? "옵션 없음"} · 현재고{" "}
                        {candidate.currentStock.toLocaleString("ko-KR")}
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
                  key={component.sellpiaInventorySkuId}
                  className="grid grid-cols-[minmax(0,1fr)_96px_32px] items-end gap-2 rounded-lg border border-purple-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0 pb-1">
                    <p className="truncate text-xs font-bold text-slate-800">
                      {component.code} · {component.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {component.optionName ?? "옵션 없음"} · 현재고{" "}
                      {component.currentStock.toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <label className="text-[11px] font-semibold text-slate-600">
                    구성 수량
                    <input
                      type="number"
                      min={1}
                      step={1}
                      required
                      aria-label={`${component.code} 구성 수량`}
                      value={component.quantity}
                      onChange={(event) =>
                        setDraft((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  quantity: Number(event.target.value),
                                }
                              : item,
                          ),
                        )
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`${component.code} 재고 제거`}
                    onClick={() =>
                      setDraft((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
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
              {save.isPending ? "저장·계산 중…" : "재고 연결하고 다시 계산"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
