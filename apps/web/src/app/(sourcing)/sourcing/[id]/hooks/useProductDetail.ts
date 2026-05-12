'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { productsApi } from '../../lib/sourcing-api';
import { mapProcessedData, PLACEHOLDER_DATA, type ProductEditState } from '../lib/types';

/**
 * Sourcing 후보(SourcingCandidate) 상세를 로드.
 *
 * Phase 7 (#192) 이후: master-bound preview / edited-html / template-css
 * fetch 는 제거 (해당 영역은 master 측 /generate, /thumbnail-editor/edit 에서
 * 처리). 후보 단계는 source 데이터 표시 + promote/reject 만.
 */
export function useProductDetail(productId: string) {
  return useQuery({
    queryKey: queryKeys.sourcing.detail(productId),
    queryFn: async () => {
      const data = await productsApi.getDetail(productId);

      const editState: ProductEditState = data.processed_data
        ? mapProcessedData(data.processed_data)
        : {
            ...PLACEHOLDER_DATA,
            name: data.name,
            thumbnails: data.thumbnail_url ? [data.thumbnail_url] : [],
          };

      return { product: data, editState };
    },
  });
}
