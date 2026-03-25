'use client';

import type { DetailPageData, TemplateConfig } from '@kiditem/templates';
import { getTemplate, parseDetailPageData } from '@kiditem/templates';
import DetailPageEditor from '@/components/editor/DetailPageEditor';
import { API_BASE } from '@/lib/api';
import { renderTemplateToHtml } from '@/lib/template-html';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ImageGenerationCTA } from './components/ImageGenerationCTA';
import { StructuredEditPanel } from './components/StructuredEditPanel';
import { StructuredPreviewPane } from './components/StructuredPreviewPane';

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
  // Keep snake_case as optional fallbacks for backward compat
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

  const [mode, setMode] = useState<'structured' | 'grapes'>('structured');
  const [productName, setProductName] = useState<string>('');
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [processedData, setProcessedData] = useState<Record<string, unknown> | null>(null);
  const [previewData, setPreviewData] = useState<DetailPageData | null>(null);
  const [draftData, setDraftData] = useState<DetailPageData | null>(null);
  const [rawImages, setRawImages] = useState<string[]>([]);
  const [processedImages, setProcessedImages] = useState<string[]>([]);
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig | null>(null);
  const [templateCss, setTemplateCss] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
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

      // Support both camelCase (direct Prisma) and snake_case (legacy)
      const rawDataValue = detail.rawData ?? detail.raw_data ?? null;
      const processedDataValue = detail.processedData ?? detail.processed_data ?? null;
      const draftContentValue = detail.draftContent ?? null;
      const pipelineStepValue = detail.pipelineStep ?? null;

      const name =
        processedDataValue && typeof processedDataValue.title === 'string'
          ? processedDataValue.title
          : '상품명 미지정';
      setProductName(name);
      setRawData(rawDataValue);
      setProcessedData(processedDataValue);
      setTemplateCss(css);

      // Extract rawImages from preview.images (preferred) or rawData fallback
      const extractedRawImages = preview.images && preview.images.length > 0
        ? preview.images
        : extractImageUrls(rawDataValue);
      const extractedProcessedImages = extractImageUrls(processedDataValue);
      setRawImages(extractedRawImages);
      setProcessedImages(extractedProcessedImages);

      // Pitfall 3 guard: if preview.template is null, no draftContent/processedData
      // → cannot enter structured mode
      if (preview.template === null || !preview.data) {
        setMode('grapes');
        setIsLoading(false);
        return;
      }

      const parsed = parseDetailPageData(preview.data);
      const templateId = preview.template.replace(/_/g, '-');
      const config = getTemplate(templateId);
      setPreviewData(parsed);
      setDraftData(parsed);
      setTemplateConfig(config);

      // Determine initial mode:
      // structured if: draftContent exists AND processedData is null
      if (draftContentValue !== null && processedDataValue === null) {
        setMode('structured');
      } else {
        setMode('grapes');
      }

      // If images are currently generating, resume polling
      if (pipelineStepValue === 'images_generating') {
        setIsGenerating(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '에디터 데이터를 불러올 수 없습니다.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling useEffect for image generation completion
  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/products/${productId}`);
        if (!res.ok) return;
        const p = await res.json() as { pipelineStep: string | null; processedData: Record<string, unknown> | null };
        // Done when pipelineStep is null AND processedData exists
        if (!p.pipelineStep && p.processedData) {
          setIsGenerating(false);
          // Re-fetch preview for final HTML
          const previewRes = await fetch(`${API_BASE}/api/products/${productId}/preview`);
          if (previewRes.ok) {
            const preview = await previewRes.json() as PreviewResponse;
            if (preview.data) {
              const parsed = parseDetailPageData(preview.data);
              setPreviewData(parsed);
              setDraftData(parsed);
            }
          }
          setMode('grapes');
        }
      } catch { void 0; }
    }, 3000);
    return () => clearInterval(interval);
  }, [isGenerating, productId]);

  const saveDraftContent = useCallback(async (data: DetailPageData) => {
    try {
      await fetch(`${API_BASE}/api/products/${productId}/draft-content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch {
      // silent — preview still works locally
    }
  }, [productId]);

  const handleDraftChange = useCallback((updated: DetailPageData) => {
    setDraftData(updated); // immediate preview update
  }, []);

  const handleSaveDraft = useCallback(() => {
    if (draftData) void saveDraftContent(draftData);
  }, [draftData, saveDraftContent]);

  const handleTriggerImageGeneration = useCallback(async () => {
    // Save current draft before triggering
    if (draftData) await saveDraftContent(draftData);
    setIsGenerating(true);
    try {
      await fetch(`${API_BASE}/api/products/${productId}/trigger-image-generation`, {
        method: 'POST',
      });
    } catch {
      setIsGenerating(false);
    }
  }, [draftData, saveDraftContent, productId]);

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

  // Structured mode: show left panel + right preview
  if (mode === 'structured' && draftData !== null) {
    return (
      <div className="flex h-screen">
        {/* Left panel: editing + CTA */}
        <div className="w-[420px] shrink-0 border-r border-gray-200 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-800">구조 편집</h2>
            <button onClick={handleClose} className="text-xs text-gray-500 hover:text-gray-700">닫기</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <StructuredEditPanel
              data={draftData}
              rawImages={rawImages}
              onChange={handleDraftChange}
              onSave={handleSaveDraft}
            />
          </div>
          <div className="p-4 border-t border-gray-200">
            <ImageGenerationCTA
              isGenerating={isGenerating}
              onConfirm={handleTriggerImageGeneration}
            />
          </div>
        </div>
        {/* Right panel: live preview */}
        <div className="flex-1 bg-gray-100">
          <StructuredPreviewPane
            draftData={draftData}
            templateConfig={templateConfig}
            templateCss={templateCss}
          />
        </div>
      </div>
    );
  }

  // GrapesJS mode (existing behavior preserved)
  const activeData = previewData ?? draftData;
  const editorHtml = activeData
    ? renderTemplateToHtml(templateConfig.component as React.ComponentType<unknown>, activeData, templateConfig, templateCss)
    : '';

  return (
    <div className="h-screen flex flex-col">
      {/* Re-entry toolbar: visible in grapes mode when draftData exists */}
      {draftData && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setMode('structured')}
            className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
          >
            구조 편집
          </button>
          <span className="text-xs text-gray-400">GrapesJS 편집 모드</span>
        </div>
      )}
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
