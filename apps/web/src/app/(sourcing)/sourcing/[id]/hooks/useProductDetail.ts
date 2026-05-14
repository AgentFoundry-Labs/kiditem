'use client';

import { useQuery } from '@tanstack/react-query';
import {
  parseDetailPageData,
  placeholderDetailPageData,
  type DetailPageData,
} from '@kiditem/templates';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { productsApi } from '../../lib/sourcing-api';
import { mapProcessedData, PLACEHOLDER_DATA, type ProductEditState } from '../lib/types';

const resolveProcessedUrl = (url: string) =>
  url.startsWith('/processed/') ? `${API_BASE}${url}` : url;

function applyImageResolution(parsed: DetailPageData): DetailPageData {
  parsed.images = Array.isArray(parsed.images) ? parsed.images.map(resolveProcessedUrl) : [];
  parsed.sizeImages = Array.isArray(parsed.sizeImages)
    ? parsed.sizeImages.map(resolveProcessedUrl)
    : [];
  parsed.detailImages = Array.isArray(parsed.detailImages)
    ? parsed.detailImages.map(resolveProcessedUrl)
    : [];
  if (parsed.heroBanner) parsed.heroBanner = resolveProcessedUrl(parsed.heroBanner);
  return parsed;
}

export function useProductDetail(productId: string) {
  return useQuery({
    queryKey: queryKeys.sourcing.detail(productId),
    queryFn: async () => {
      const data = await productsApi.getDetail(productId);
      const masterProductId = data.promotedMasterId ?? data.promoted_master_id ?? null;
      const [previewRes, editedHtmlRes, css] = await Promise.all([
        masterProductId
          ? apiClient
              .get<{ template: string | null; data: Record<string, unknown> }>(
                `/api/products/${masterProductId}/preview`,
              )
              .catch(() => null)
          : Promise.resolve(null),
        masterProductId
          ? apiClient
              .get<{ html: string | null; savedAt: string | null }>(
                `/api/products/${masterProductId}/edited-html`,
              )
              .catch(() => null)
          : Promise.resolve(null),
        fetch('/templates-styles.css')
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => ''),
      ]);

      let detailPageData: DetailPageData = placeholderDetailPageData;
      if (previewRes?.template && previewRes?.data) {
        try {
          detailPageData = applyImageResolution(parseDetailPageData(previewRes.data));
        } catch {
          // keep placeholder
        }
      }

      const editState: ProductEditState = data.processed_data
        ? mapProcessedData(data.processed_data)
        : {
            ...PLACEHOLDER_DATA,
            name: data.name,
            salePrice: data.price_krw ?? 0,
            thumbnails: data.thumbnail_url ? [data.thumbnail_url] : [],
          };

      return {
        product: data,
        detailPageData,
        editedHtml: editedHtmlRes?.html ?? null,
        templateCss: css,
        editState,
      };
    },
  });
}
