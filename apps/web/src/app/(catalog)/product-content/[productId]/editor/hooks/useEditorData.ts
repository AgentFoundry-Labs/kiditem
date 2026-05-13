'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getTemplate,
  parseDetailPageData,
  placeholderDetailPageData,
  type DetailPageData,
} from '@kiditem/templates';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  collectProductImageUrls,
  extractImageUrls,
  resolveProcessedUrl,
  type PreviewResponse,
  type ProductDetail,
} from '../lib/editor-data';

export function useEditorData(productId: string) {
  return useQuery({
    queryKey: queryKeys.productContent.preview(productId),
    queryFn: async () => {
      const [detail, preview, cssRes] = await Promise.all([
        apiClient.get<ProductDetail>(`/api/products/masters/${productId}`),
        apiClient
          .get<PreviewResponse>(`/api/products/${productId}/preview`)
          .catch(() => ({ data: {}, template: null }) as PreviewResponse),
        fetch('/templates-styles.css')
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => ''),
      ]);

      const rawDataValue = detail.rawData ?? detail.raw_data ?? null;
      const processedDataValue = detail.processedData ?? detail.processed_data ?? null;

      const productName =
        processedDataValue && typeof processedDataValue.title === 'string'
          ? processedDataValue.title
          : detail.name ?? '상품명 미지정';

      const rawImages = Array.from(new Set([
        ...extractImageUrls(rawDataValue),
        ...collectProductImageUrls(detail.images, detail.imageUrl, detail.thumbnailUrl),
      ]));
      const processedImages = extractImageUrls(processedDataValue);

      let previewData: DetailPageData = placeholderDetailPageData;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let templateConfig: any = getTemplate('bold-vertical');

      if (preview.template !== null && preview.data) {
        try {
          const parsed = parseDetailPageData(preview.data);
          parsed.images = parsed.images.map(resolveProcessedUrl);
          parsed.sizeImages = parsed.sizeImages.map(resolveProcessedUrl);
          parsed.detailImages = parsed.detailImages.map(resolveProcessedUrl);
          if (parsed.heroBanner) parsed.heroBanner = resolveProcessedUrl(parsed.heroBanner);
          templateConfig = getTemplate(preview.template.replace(/_/g, '-'));
          previewData = parsed;
        } catch {
          // draftContent may contain only editor metadata such as editedHtml.
          // In that case the editor can still boot from saved HTML below.
        }
      }

      return {
        productName,
        previewData,
        rawImages,
        processedImages,
        templateConfig,
        templateCss: cssRes,
      };
    },
  });
}
