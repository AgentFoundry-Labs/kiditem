'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import {
  candidatesToSalesProducts,
  type CandidateSalesProductDeps,
  type CandidateSalesProductsOutcome,
} from '../lib/candidate-sales-products';
import { productsApi } from '../lib/sourcing-api';
import { prepareSavedCandidateDetailImage } from '../lib/wing-registration-flow';

const DEPS: CandidateSalesProductDeps = {
  getDetail: (candidateId) => productsApi.getDetail(candidateId),
  renderDetailImage: async (candidateId, detail) => {
    const rendered = await prepareSavedCandidateDetailImage(candidateId, detail);
    return rendered.status === 'ready' ? rendered.imageUrl : null;
  },
  createFromCandidates: (body) => salesProductApi.createFromCandidates(body),
};

/**
 * 수집상품 화면의 [몰 대량등록] — 고른 수집상품을 판매상품으로 만든 뒤(이미 만든 것은 그대로) 몰 대량등록 창을 연다.
 */
export function useCandidateMallSheet() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<CandidateSalesProductsOutcome | null>(null);

  const prepare = useMutation({
    mutationFn: (candidateIds: string[]) =>
      candidatesToSalesProducts(candidateIds, DEPS, (done, total) => setProgress({ done, total })),
    onSuccess: (result) => {
      if (result.created > 0) void queryClient.invalidateQueries({ queryKey: salesProductKeys.all });
      if (result.products.length === 0) {
        toast.error('판매상품으로 만들 수 있는 수집상품이 없습니다.', {
          description: result.skipped[0] ? `${result.skipped[0].name}: ${result.skipped[0].reason}` : undefined,
        });
        return;
      }
      setOutcome(result);
    },
    onError: (error) => toast.error(
      isApiError(error) ? error.detail : error instanceof Error ? error.message : '판매상품을 만들지 못했습니다.',
    ),
    onSettled: () => setProgress(null),
  });

  return {
    start: (candidateIds: string[]) => {
      if (candidateIds.length === 0 || prepare.isPending) return;
      prepare.mutate(candidateIds);
    },
    preparing: prepare.isPending,
    progress,
    outcome,
    close: () => setOutcome(null),
  };
}
