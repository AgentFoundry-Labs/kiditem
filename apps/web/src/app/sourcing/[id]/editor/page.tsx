'use client';

import type { DetailPageData } from '@kiditem/templates';
import { getTemplate, parseDetailPageData, placeholderDetailPageData } from '@kiditem/templates';
import DetailPageEditor from '@/components/editor/DetailPageEditor';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { renderTemplateToHtml } from '@/lib/template-html';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

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
  const productId = params.id as string;

  const [productName, setProductName] = useState('');
  const [previewData, setPreviewData] = useState<DetailPageData | null>(null);
  const [rawImages, setRawImages] = useState<string[]>([]);
  const [processedImages, setProcessedImages] = useState<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [templateConfig, setTemplateConfig] = useState<any>(null);
  const [templateCss, setTemplateCss] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [detail, preview, cssRes] = await Promise.all([
        apiClient.get<ProductDetail>(`/api/products/${productId}`),
        apiClient.get<PreviewResponse>(`/api/products/${productId}/preview`),
        fetch('/templates-styles.css').then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      ]);

      const rawDataValue = detail.rawData ?? detail.raw_data ?? null;
      const processedDataValue = detail.processedData ?? detail.processed_data ?? null;

      const name =
        processedDataValue && typeof processedDataValue.title === 'string'
          ? processedDataValue.title
          : '상품명 미지정';
      setProductName(name);
      setTemplateCss(cssRes);

      setRawImages(extractImageUrls(rawDataValue));
      setProcessedImages(extractImageUrls(processedDataValue));

      if (preview.template === null || !preview.data) {
        setTemplateConfig(getTemplate('bold-vertical'));
        setPreviewData(placeholderDetailPageData);
        return;
      }

      const parsed = parseDetailPageData(preview.data);
      const resolve = (url: string) => url.startsWith('/processed/') ? `${API_BASE}${url}` : url;
      parsed.images = parsed.images.map(resolve);
      parsed.sizeImages = parsed.sizeImages.map(resolve);
      parsed.detailImages = parsed.detailImages.map(resolve);
      if (parsed.heroBanner) parsed.heroBanner = resolve(parsed.heroBanner);
      const templateId = preview.template.replace(/_/g, '-');
      setTemplateConfig(getTemplate(templateId));
      setPreviewData(parsed);
    } catch (err) {
      setError(isApiError(err) ? err.detail : '에디터 데이터를 불러올 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClose = () => router.push(`/sourcing/${productId}`);
  const handleSave = (_html: string) => router.push(`/sourcing/${productId}`);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F5F7F8]">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm font-medium">에디터를 준비하고 있습니다...</p>
        </div>
      </div>
    );
  }

  if (error || !templateConfig) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F5F7F8]">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-sm font-medium">{error ?? '상세페이지 데이터가 없습니다.'}</p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition-colors"
            >
              다시 시도
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-white text-gray-600 text-sm font-bold rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              돌아가기
            </button>
          </div>
        </div>
      </div>
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
