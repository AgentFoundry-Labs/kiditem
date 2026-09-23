'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  placeholderDetailPageData,
  type DetailPageData,
} from '@kiditem/templates';
import { queryKeys } from '@/lib/query-keys';
import {
  composeProductDetail,
  productsApi,
  type ProductDetailResponse,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import { contentWorkspacesApi } from '../lib/content-workspaces-api';
import { mapProcessedData, PLACEHOLDER_DATA, type ProductEditState } from '../lib/product-workspace-types';

export interface ProductWorkspaceData {
  product: ProductDetailResponse;
  detailPageData: DetailPageData;
  templateCss: string;
  editState: ProductEditState;
}

/**
 * 수집상품 화면 값 — 판매상품 초안 id 로 연다(KID-310 · ADR-0022).
 *
 * 초안과 원천 기록은 `collectedProducts.workspace`, 초안의 등록용 사진은
 * `contentWorkspaces.registrationMedia` 에서 읽고 둘 다 온 뒤에 한 값으로 합친다. 사진만
 * 늦게 오면 화면이 사진 없는 값으로 먼저 초기화되기 때문이다.
 */
export function useProductDetail(
  salesProductId: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && Boolean(salesProductId);
  const source = useQuery({
    queryKey: queryKeys.collectedProducts.workspace(salesProductId),
    enabled,
    queryFn: async () => {
      const [{ draft, source: sourceRecord }, templateCss] = await Promise.all([
        productsApi.getDraftWithSource(salesProductId),
        fetch('/templates-styles.css')
          .then((response) => (response.ok ? response.text() : ''))
          .catch(() => ''),
      ]);
      return { draft, sourceRecord, templateCss };
    },
  });
  const media = useQuery({
    queryKey: queryKeys.contentWorkspaces.registrationMedia(salesProductId),
    enabled,
    queryFn: () => contentWorkspacesApi.getRegistrationMedia(salesProductId),
  });

  const data = useMemo<ProductWorkspaceData | undefined>(() => {
    if (!source.data || !media.data) return undefined;
    const product = composeProductDetail(source.data.draft, source.data.sourceRecord, media.data);
    return {
      product,
      detailPageData: placeholderDetailPageData,
      templateCss: source.data.templateCss,
      editState: editStateFor(product),
    };
  }, [media.data, source.data]);

  const error = source.error ?? media.error ?? null;
  return {
    data,
    isLoading: source.isLoading || media.isLoading,
    isError: error !== null,
    error,
  };
}

function editStateFor(data: ProductDetailResponse): ProductEditState {
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
  return {
    ...processedEditState,
    name: basicInfo.name || data.name,
    category: basicInfo.category,
    originalPrice: basicInfo.originalPrice,
    salePrice: basicInfo.salePrice || data.price_krw || processedEditState.salePrice,
    discountRate: basicInfo.discountRate,
    thumbnails: thumbnailInputs,
    tags: basicInfo.tags,
  };
}
