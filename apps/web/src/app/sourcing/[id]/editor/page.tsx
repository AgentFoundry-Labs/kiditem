'use client';

import type { DetailPageData, TemplateConfig } from '@kiditem/templates';
import { getTemplate, parseDetailPageData } from '@kiditem/templates';
import DetailPageEditor from '@/components/editor/DetailPageEditor';
import { API_BASE } from '@/lib/api';
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
  raw_data: Record<string, unknown> | null;
  processed_data: Record<string, unknown> | null;
}

interface PreviewResponse {
  data: Record<string, unknown>;
  template: string;
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [productName, setProductName] = useState<string>('');
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [processedData, setProcessedData] = useState<Record<string, unknown> | null>(null);
  const [previewData, setPreviewData] = useState<DetailPageData | null>(null);
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig | null>(null);
  const [templateCss, setTemplateCss] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [detailRes, previewRes, cssRes] = await Promise.all([
        fetch(`${API_BASE}/api/products/${productId}`),
        fetch(`${API_BASE}/api/products/${productId}/preview`),
        fetch('/templates-styles.css').then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      ]);

      if (!detailRes.ok) throw new Error(`Failed to load product: ${detailRes.status}`);
      if (!previewRes.ok) throw new Error(`Failed to load preview: ${previewRes.status}`);

      const detail = (await detailRes.json()) as ProductDetail;
      const preview = (await previewRes.json()) as PreviewResponse;
      const css = cssRes;

      const name =
        detail.processed_data && typeof detail.processed_data.title === 'string'
          ? detail.processed_data.title
          : '상품명 미지정';
      setProductName(name);
      setRawData(detail.raw_data);
      setProcessedData(detail.processed_data);
      setTemplateCss(css);

      const parsed = parseDetailPageData(preview.data);
      const templateId = preview.template.replace(/_/g, '-');
      const config = getTemplate(templateId);
      setPreviewData(parsed);
      setTemplateConfig(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : '에디터 데이터를 불러올 수 없습니다.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  const rawImages = extractImageUrls(rawData);
  const processedImages = extractImageUrls(processedData);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClose = () => {
    router.push(`/sourcing/${productId}`);
  };

  const handleSave = (_html: string) => {
    router.push(`/sourcing/${productId}`);
  };

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

  if (error || !previewData || !templateConfig) {
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

  const editorHtml = renderTemplateToHtml(templateConfig.component as React.ComponentType<any>, previewData, templateConfig, templateCss);

  return (
    <div className="h-screen">
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
          rawImages={rawImages}
          processedImages={processedImages}
          onSave={handleSave}
          onClose={handleClose}
        />
      </Suspense>
    </div>
  );
}
