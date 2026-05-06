'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ImageIcon,
  Pencil,
  Plus,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DETAIL_PREVIEW_SCROLL_MESSAGE,
  SCRIPTED_PREVIEW_SANDBOX,
  buildDetailPreviewLayoutMetrics,
  isDetailPreviewMetricsMessage,
  isSameDetailPreviewLayout,
  type DetailPreviewMetricsMessage,
  type DetailPreviewLayoutMetrics,
  withDetailPreviewBridge,
} from '@/app/(sourcing)/sourcing/[id]/lib/preview-sandbox';

type GenerateResultData = {
  html?: string;
  templateId?: string;
  generationId?: string;
  productId?: string | null;
  productName?: string;
  imageUrls?: string[];
  raw?: unknown;
};

interface GenerateResultProps {
  result: GenerateResultData;
  onReset: () => void;
  onNewCreate: () => void;
}

const MINIMAP_MAX_WIDTH = 170;
const INITIAL_PREVIEW_LAYOUT: DetailPreviewLayoutMetrics = {
  scale: 0.22,
  minimapWidth: MINIMAP_MAX_WIDTH,
  contentHeight: 2400,
  viewportTop: 0,
  viewportHeight: 0,
};

export default function GenerateResult({ result, onReset, onNewCreate }: GenerateResultProps) {
  const fullIframeRef = useRef<HTMLIFrameElement>(null);
  const minimapContainerRef = useRef<HTMLDivElement>(null);
  const html = typeof result.html === 'string' ? result.html : null;
  const sandboxedHtml = useMemo(() => (html ? withDetailPreviewBridge(html) : ''), [html]);
  const [previewLayout, setPreviewLayout] = useState(INITIAL_PREVIEW_LAYOUT);
  const previewLayoutRef = useRef(INITIAL_PREVIEW_LAYOUT);
  const imageUrls = result.imageUrls ?? [];
  const { scale, minimapWidth, contentHeight, viewportTop, viewportHeight } = previewLayout;

  const editorHref = useMemo(() => {
    if (!result.productId || !result.generationId) return null;
    const queryKey = result.templateId === 'bold-vertical' ? 'boldId' : 'kpId';
    return `/sourcing/${result.productId}/editor?${queryKey}=${result.generationId}`;
  }, [result.generationId, result.productId, result.templateId]);

  const applyPreviewMetrics = useCallback((data: DetailPreviewMetricsMessage) => {
    const container = minimapContainerRef.current;
    if (!container) return;
    const next = buildDetailPreviewLayoutMetrics(data, {
      containerHeight: container.clientHeight,
      maxMinimapWidth: MINIMAP_MAX_WIDTH,
    });
    if (isSameDetailPreviewLayout(previewLayoutRef.current, next)) return;
    previewLayoutRef.current = next;
    setPreviewLayout(next);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== fullIframeRef.current?.contentWindow) return;
      if (!isDetailPreviewMetricsMessage(event.data)) return;
      applyPreviewMetrics(event.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [applyPreviewMetrics]);

  useEffect(() => {
    previewLayoutRef.current = INITIAL_PREVIEW_LAYOUT;
    setPreviewLayout(INITIAL_PREVIEW_LAYOUT);
  }, [sandboxedHtml]);

  const handleMinimapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickRatio = (event.clientY - rect.top) / rect.height;
    const targetY = clickRatio * contentHeight - (viewportHeight || 0) / 2;
    fullIframeRef.current?.contentWindow?.postMessage(
      {
        type: DETAIL_PREVIEW_SCROLL_MESSAGE,
        y: Math.max(0, targetY),
        behavior: 'smooth',
      },
      '*',
    );
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface-sunken)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={18} />
            입력값으로 돌아가기
          </button>
          <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600">
            <Sparkles size={16} />
            AI GENERATED
          </div>
        </div>
      </div>

      {!html ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="card max-w-3xl p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <CheckCircle2 className="text-emerald-500" size={24} />
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                AI 분석 완료
              </h2>
            </div>
            <pre className="max-h-[400px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-4 text-xs text-[var(--text-secondary)]">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-600">
                <CheckCircle2 size={18} />
                상세페이지 생성 완료
              </div>
              <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
                {String(result.productName ?? '직접 생성 상세페이지')} · {String(result.templateId ?? 'bold-vertical')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={onNewCreate}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <Plus size={14} />
                새로 만들기
              </button>
              {editorHref ? (
                <Link
                  href={editorHref}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
                >
                  <Pencil size={14} />
                  에디터에서 편집
                </Link>
              ) : (
                <button
                  disabled
                  className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-[var(--text-muted)] px-3 py-2 text-xs font-bold text-white opacity-60"
                >
                  <Pencil size={14} />
                  에디터 연결 없음
                </button>
              )}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(92px,170px)_minmax(0,1fr)_150px] gap-4">
            <aside
              ref={minimapContainerRef}
              className="relative min-h-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
              style={{ width: minimapWidth }}
              onClick={handleMinimapClick}
              title="클릭하면 해당 위치로 이동"
            >
              <iframe
                srcDoc={sandboxedHtml}
                className="pointer-events-none absolute left-0 top-0 border-0"
                style={{
                  width: `${minimapWidth / scale}px`,
                  height: `${contentHeight}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
                title="생성 상세페이지 미니맵"
                sandbox={SCRIPTED_PREVIEW_SANDBOX}
              />
              <div
                className="pointer-events-none absolute left-0 right-0 border-2 border-indigo-500 bg-indigo-500/15"
                style={{
                  top: `${viewportTop * scale}px`,
                  height: `${viewportHeight * scale}px`,
                }}
              />
            </aside>

            <main className="min-h-0 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
              <iframe
                ref={fullIframeRef}
                srcDoc={sandboxedHtml}
                className="h-full w-full border-0"
                title="생성된 상세페이지 미리보기"
                sandbox={SCRIPTED_PREVIEW_SANDBOX}
              />
            </main>

            <aside className="min-h-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
              <div className="border-b border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-primary)]">
                미리보기 썸네일
              </div>
              <div className="flex h-full flex-col gap-2 overflow-y-auto p-3 pb-12">
                {imageUrls.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-xs text-[var(--text-tertiary)]">
                    <ImageIcon size={24} />
                    이미지 없음
                  </div>
                ) : (
                  imageUrls.map((url, index) => (
                    <div
                      key={`${url}-${index}`}
                      className={cn(
                        'overflow-hidden rounded-lg border bg-[var(--surface-sunken)]',
                        index === 0 ? 'border-indigo-300' : 'border-[var(--border)]',
                      )}
                    >
                      <img
                        src={url}
                        alt={`업로드 이미지 ${index + 1}`}
                        className="aspect-square w-full object-cover"
                      />
                      <div className="px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)]">
                        #{index + 1}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
