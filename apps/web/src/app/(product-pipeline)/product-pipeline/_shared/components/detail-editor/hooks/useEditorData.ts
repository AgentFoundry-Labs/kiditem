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
  extractImageUrls,
  resolveProcessedUrl,
} from '../lib/editor-data';
import { contentWorkspacesApi } from '../../../lib/content-workspaces-api';

interface ContentAssetListResponse {
  items: Array<{ url: string }>;
}

export function useEditorData(contentWorkspaceId: string) {
  return useQuery({
    queryKey: queryKeys.contentWorkspaces.detail(contentWorkspaceId),
    queryFn: async () => {
      const [workspace, assets, cssRes] = await Promise.all([
        contentWorkspacesApi.get(contentWorkspaceId),
        apiClient.get<ContentAssetListResponse>(
          `/api/ai/content-assets?contentWorkspaceId=${encodeURIComponent(contentWorkspaceId)}&limit=100`,
        ),
        fetch('/templates-styles.css')
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => ''),
      ]);

      const current = workspace.history.find(
        (item) => item.id === workspace.currentDetailPageGenerationId,
      ) ?? workspace.history[0] ?? null;
      const productName = workspace.displayName || '상품명 미지정';
      const rawImages = Array.from(new Set(assets.items.map((asset) => asset.url)));
      const processedImages = current
        ? Array.from(new Set([
            ...Object.values(current.processedImages),
            ...extractImageUrls(current.detailPageData),
          ]))
        : [];

      let previewData: DetailPageData = placeholderDetailPageData;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let templateConfig: any = getTemplate('bold-vertical');

      if (current?.templateId && current.detailPageData) {
        try {
          const parsed = parseDetailPageData(current.detailPageData);
          parsed.images = parsed.images.map(resolveProcessedUrl);
          parsed.sizeImages = parsed.sizeImages.map(resolveProcessedUrl);
          parsed.detailImages = parsed.detailImages.map(resolveProcessedUrl);
          if (parsed.heroBanner) parsed.heroBanner = resolveProcessedUrl(parsed.heroBanner);
          templateConfig = getTemplate(current.templateId.replace(/_/g, '-'));
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
