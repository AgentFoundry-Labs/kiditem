'use client';

import { useQuery } from '@tanstack/react-query';
import {
  placeholderDetailPageData,
  type DetailPageData,
} from '@kiditem/templates';
import { queryKeys } from '@/lib/query-keys';
import { productsApi } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import type { ProductDetailResponse } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import { mapProcessedData, PLACEHOLDER_DATA, type ProductEditState } from '../lib/product-workspace-types';

export interface ProductWorkspaceData {
  product: ProductDetailResponse;
  detailPageData: DetailPageData;
  editedHtml: string | null;
  templateCss: string;
  editState: ProductEditState;
}

export function useProductDetail(
  productId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.sourcing.detail(productId),
    enabled: options.enabled ?? true,
    queryFn: async () => {
      const data = await productsApi.getDetail(productId);
      const css = await fetch('/templates-styles.css')
        .then((response) => (response.ok ? response.text() : ''))
        .catch(() => '');

      const processedEditState = data.processed_data
        ? mapProcessedData(data.processed_data)
        : PLACEHOLDER_DATA;
      const basicInfo = data.basicInfo;
      const thumbnailInputs =
        basicInfo.thumbnailUrls.length > 0
          ? basicInfo.thumbnailUrls
          : data.thumbnail_url
            ? [data.thumbnail_url]
            : [];
      const editState: ProductEditState = {
        ...processedEditState,
        name: basicInfo.name || data.name,
        category: basicInfo.category,
        originalPrice: basicInfo.originalPrice,
        salePrice: basicInfo.salePrice || data.price_krw || processedEditState.salePrice,
        discountRate: basicInfo.discountRate,
        thumbnails: thumbnailInputs,
        tags: basicInfo.tags,
      };

      return {
        product: data,
        detailPageData: placeholderDetailPageData,
        editedHtml: null,
        templateCss: css,
        editState,
      } satisfies ProductWorkspaceData;
    },
  });
}
