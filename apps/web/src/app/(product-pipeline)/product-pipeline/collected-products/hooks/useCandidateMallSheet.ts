'use client';

import { useState } from 'react';

/**
 * 수집상품 화면의 [몰 대량등록] — 고른 카드의 판매상품 초안 id로 몰 대량등록 창을 연다.
 *
 * 판매상품 초안은 수집 시점부터 있으므로(KID-310 · ADR-0022) 여기서 만들거나 찾을 것이
 * 없다 — 카드가 이미 아는 `salesProductId` 를 그대로 넘긴다.
 */
export function useCandidateMallSheet() {
  const [salesProductIds, setSalesProductIds] = useState<string[] | null>(null);

  return {
    start: (ids: string[]) => {
      if (ids.length === 0) return;
      setSalesProductIds(ids);
    },
    salesProductIds,
    close: () => setSalesProductIds(null),
  };
}
