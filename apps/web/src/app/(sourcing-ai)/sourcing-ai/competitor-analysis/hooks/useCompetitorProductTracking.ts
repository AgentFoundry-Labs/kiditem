"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isApiError } from "@/lib/api-error";
import {
  addWingTrackedProduct,
  listWingTrackedProducts,
  type AddWingTrackedProductInput,
  type WingTrackedProduct,
} from "../../lib/wing-tracking-api";

const TRACKED_QUERY_KEY = ["wing-tracked-products"] as const;

export function useCompetitorProductTracking() {
  const queryClient = useQueryClient();
  const trackedQuery = useQuery({
    queryKey: TRACKED_QUERY_KEY,
    queryFn: listWingTrackedProducts,
    staleTime: 30_000,
  });
  const trackMutation = useMutation({
    mutationFn: addWingTrackedProduct,
    onSuccess: (trackedProduct) => {
      queryClient.setQueryData<WingTrackedProduct[]>(
        TRACKED_QUERY_KEY,
        (current = []) => [
          trackedProduct,
          ...current.filter(
            (product) => product.productId !== trackedProduct.productId,
          ),
        ],
      );
      toast.success("추적 상품에 추가했습니다", {
        description: "상품 추적 페이지에서 가격·리뷰 추이를 확인하세요.",
      });
    },
    onError: (error) =>
      toast.error(
        isApiError(error) ? error.message : "상품 추적 추가에 실패했습니다.",
      ),
  });
  const trackedProductIds = useMemo(
    () =>
      new Set(
        (trackedQuery.data ?? [])
          .filter((product) => product.enabled)
          .map((product) => product.productId),
      ),
    [trackedQuery.data],
  );

  const trackProduct = (input: AddWingTrackedProductInput | null) => {
    if (!input || trackedProductIds.has(input.productId)) return;
    trackMutation.mutate(input);
  };

  return {
    trackedProductIds,
    trackingProductId: trackMutation.isPending
      ? (trackMutation.variables?.productId ?? null)
      : null,
    trackingPending: trackMutation.isPending,
    trackProduct,
  };
}
