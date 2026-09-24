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
import { useRegistrationState } from '@/app/(channels)/_shared/use-registration-state';
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
 *
 * 몰 계정별 등록 상태는 Channels 등록 상태 reader 하나(`useRegistrationState`)가 답한다(KID-320).
 * 그 읽기가 끝날 때까지 기다려 등록 버튼이 잠깐 열렸다 닫히지 않게 하고, 읽지 못하면 계정 없이 연다 —
 * 등록 상태 때문에 작업공간이 열리지 않으면 안 된다.
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

  const registration = useRegistrationState(enabled ? salesProductId : null);

  const data = useMemo<ProductWorkspaceData | undefined>(() => {
    if (!source.data || !media.data || registration.isLoading) return undefined;
    const product = composeProductDetail(
      source.data.draft,
      source.data.sourceRecord,
      media.data,
      registration.accounts,
    );
    return {
      product,
      detailPageData: placeholderDetailPageData,
      templateCss: source.data.templateCss,
      editState: editStateFor(product),
    };
  }, [media.data, registration.accounts, registration.isLoading, source.data]);

  const error = source.error ?? media.error ?? null;
  return {
    data,
    isLoading: source.isLoading || media.isLoading || registration.isLoading,
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
    originalPrice: basicInfo.originalPrice ?? 0, // 미리보기 값 — 저장하지 않는다
    salePrice: basicInfo.salePrice || data.price_krw || processedEditState.salePrice,
    discountRate: basicInfo.discountRate,
    thumbnails: thumbnailInputs,
    tags: basicInfo.tags,
  };
}
