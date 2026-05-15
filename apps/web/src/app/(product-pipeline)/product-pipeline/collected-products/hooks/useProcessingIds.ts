'use client';

import { useEffect, useState } from 'react';
import { isInProgress, type ProductStatus } from '../lib/sourcing-api';

interface ProductLike {
  id: string;
  status: ProductStatus;
}

export function useProcessingIds(products: ProductLike[]) {
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // 사용자가 'AI 생성' 클릭한 직후 → optimistic 추가 / DB 가 처리 끝내면 자동 제거.
  // 현재 hook 은 외부에서 add 하는 API 가 노출 안 돼있어서 폴링 → status 변화로만 제거.
  useEffect(() => {
    setProcessingIds((prev) => {
      if (prev.size === 0) return prev;
      const productMap = new Map(products.map((p) => [p.id, p]));
      const next = new Set(prev);
      let changed = false;
      Array.from(prev).forEach((id) => {
        const product = productMap.get(id);
        if (product && !isInProgress(product.status)) {
          next.delete(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [products]);

  return { processingIds };
}
