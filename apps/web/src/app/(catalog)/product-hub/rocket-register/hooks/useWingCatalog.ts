'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collectWingOptions } from '../lib/rocket-register-extension';
import {
  listRocketStatus,
  listWingCatalog,
  patchWingListing,
  syncWingToDb,
  type CoupangListing,
  type MatchStatus,
  type RocketStatusResult,
  type WingSyncResult,
} from '../lib/rocket-register-db-api';

const CATALOG_KEY = ['rocket-register', 'wing-catalog'] as const;
const ROCKET_STATUS_KEY = ['rocket-register', 'rocket-status'] as const;

/** 저장된 WING 카탈로그(매칭 재고 조인). */
export function useWingCatalog() {
  return useQuery<CoupangListing[]>({
    queryKey: CATALOG_KEY,
    queryFn: listWingCatalog,
    staleTime: 30_000,
  });
}

/** 쿠팡 로켓 등록/미등록 현황(마스터 단위). */
export function useRocketStatus() {
  return useQuery<RocketStatusResult>({
    queryKey: ROCKET_STATUS_KEY,
    queryFn: listRocketStatus,
    staleTime: 30_000,
  });
}

/** WING 수집(확장) → 백엔드 저장 + 셀피아 재고 이름매칭. */
export function useSyncWing() {
  const qc = useQueryClient();
  return useMutation<WingSyncResult, Error, { maxPages: number }>({
    mutationFn: async ({ maxPages }) => {
      const res = await collectWingOptions({ maxPages });
      const products = (res.products ?? []).flatMap((p) =>
        (p.options ?? [])
          .filter((o) => o.vendorItemId)
          .map((o) => ({
            vendorItemId: o.vendorItemId as string,
            productName: p.name,
            salePrice: o.salePrice ?? null,
          })),
      );
      if (products.length === 0) throw new Error('수집된 WING 옵션ID가 없습니다.');
      return syncWingToDb(products);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATALOG_KEY });
    },
  });
}

/** 검토 결과 반영(승인 linked / 무시 ignored / 매칭 변경). */
export function usePatchWingListing() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { id: string; matchStatus?: MatchStatus; matchedOptionId?: string | null }
  >({
    mutationFn: ({ id, ...patch }) => patchWingListing(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATALOG_KEY });
    },
  });
}
