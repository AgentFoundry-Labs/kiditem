'use client';

import type { DetailPageData } from '@kiditem/templates';
import { getTemplate, parseDetailPageData, placeholderDetailPageData } from '@kiditem/templates';
import DetailPageEditor from './components/DetailPageEditor';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { renderTemplateToHtml } from '../../lib/template-html';
import { Loader2 } from 'lucide-react';
import EditorLoadingScreen from './components/EditorLoadingScreen';
import EditorErrorScreen from './components/EditorErrorScreen';
import { useParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

function extractImageUrls(data: Record<string, unknown> | null | undefined): string[] {
  if (!data) return [];
  const urls: string[] = [];
  for (const key of ['images', 'description_images', 'detail_images', 'size_images']) {
    const val = data[key];
    if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === 'string' && v) urls.push(v);
      }
    }
  }
  return urls;
}

interface ProductDetail {
  rawData: Record<string, unknown> | null;
  processedData: Record<string, unknown> | null;
  draftContent: Record<string, unknown> | null;
  pipelineStep: string | null;
  raw_data?: Record<string, unknown> | null;
  processed_data?: Record<string, unknown> | null;
}

interface PreviewResponse {
  data: Record<string, unknown>;
  template: string | null;
  images?: string[];
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const productId = params.id as string;

  const { data: editorData, isLoading, error: queryError } = useQuery({
    queryKey: queryKeys.sourcing.preview(productId),
    queryFn: async () => {
      const [detail, preview, cssRes] = await Promise.all([
        apiClient.get<ProductDetail>(`/api/products/${productId}`),
        apiClient.get<PreviewResponse>(`/api/products/${productId}/preview`),
        fetch('/templates-styles.css').then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      ]);

      const rawDataValue = detail.rawData ?? detail.raw_data ?? null;
      const processedDataValue = detail.processedData ?? detail.processed_data ?? null;

      const productName =
        processedDataValue && typeof processedDataValue.title === 'string'
          ? processedDataValue.title
          : '상품명 미지정';

      const rawImages = extractImageUrls(rawDataValue);
      const processedImages = extractImageUrls(processedDataValue);

      let previewData: DetailPageData = placeholderDetailPageData;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let templateConfig: any = getTemplate('bold-vertical');

      if (preview.template !== null && preview.data) {
        const parsed = parseDetailPageData(preview.data);
        const resolve = (url: string) => url.startsWith('/processed/') ? `${API_BASE}${url}` : url;
        parsed.images = parsed.images.map(resolve);
        parsed.sizeImages = parsed.sizeImages.map(resolve);
        parsed.detailImages = parsed.detailImages.map(resolve);
        if (parsed.heroBanner) parsed.heroBanner = resolve(parsed.heroBanner);
        const templateId = preview.template.replace(/_/g, '-');
        templateConfig = getTemplate(templateId);
        previewData = parsed;
      }

      return { productName, previewData, rawImages, processedImages, templateConfig, templateCss: cssRes };
    },
  });

  const productName = editorData?.productName ?? '';
  const previewData = editorData?.previewData ?? null;
  const rawImages = editorData?.rawImages ?? [];
  const processedImages = editorData?.processedImages ?? [];
  const templateConfig = editorData?.templateConfig ?? null;
  const templateCss = editorData?.templateCss ?? '';
  const error = queryError ? (isApiError(queryError) ? queryError.detail : '에디터 데이터를 불러올 수 없습니다.') : null;

  const handleClose = () => router.push(`/sourcing/${productId}`);
  const handleSave = (_html: string) => router.push(`/sourcing/${productId}`);

  if (isLoading) {
    return <EditorLoadingScreen />;
  }

  if (error || !templateConfig) {
    return (
      <EditorErrorScreen
        error={error}
        onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.preview(productId) })}
        onClose={handleClose}
      />
    );
  }

  const editorHtml = previewData
    ? renderTemplateToHtml(templateConfig.component as React.ComponentType<unknown>, previewData, templateConfig, templateCss)
    : '';

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <Loader2 size={32} className="animate-spin" />
                <p className="text-sm font-medium">에디터 로딩 중...</p>
              </div>
            </div>
          }
        >
          <DetailPageEditor
            html={editorHtml}
            templateCss={templateCss}
            productName={productName}
            productId={productId}
            rawImages={rawImages}
            processedImages={processedImages}
            onSave={handleSave}
            onClose={handleClose}
          />
        </Suspense>
      </div>
    </div>
  );
}
