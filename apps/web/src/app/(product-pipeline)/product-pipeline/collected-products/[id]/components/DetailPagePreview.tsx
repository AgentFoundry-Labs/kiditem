'use client';

// 상세페이지 탭 — 좌측 미니맵 + 우측 풀 미리보기.
//
// 미니맵: 페이지 전체를 작게 표시 (iframe 위에 transform: scale 적용한 cloned iframe)
//   사용자 요구: "왼쪽에 상세페이지 길게 해서 지금 현재 어디 위치인지 한눈에 볼 수 있게"
//
// 우측 viewport 가 스크롤되면 미니맵 위에 viewport 위치 표시 박스가 따라 움직임.
// 미니맵 클릭하면 해당 위치로 스크롤 (jump).
//
// KP 이력이 있을 때: KidsPlayfulRenderer (React) 를 renderToStaticMarkup 로 HTML 화 →
// Tailwind CDN 주입한 srcDoc 으로 같은 미니맵+iframe 구조에 끼움. 디자인 동일.

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Download, Pencil, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getTemplate,
  parseDetailPageData,
} from '@kiditem/templates';
import { API_BASE } from '@/lib/api';
import {
  rowToRendererData,
  useKidsPlayfulGenerationList,
  useBoldVerticalGenerationList,
  type KidsPlayfulGenerationItem,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import type { KidsPlayfulData } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/kids-playful-types';
import { buildKidsPlayfulHtml } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/build-kids-playful-html';
import {
  adaptBoldVerticalToDetailPageData,
  type BoldVerticalGeneration,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/bold-vertical-types';
import { ensureStyledDetailHtml, renderTemplateToHtml } from '@/app/(product-pipeline)/product-pipeline/_shared/lib/template-html';
import {
  buildGenerationHistoryHtml,
  generatedDetailTemplateLabel,
} from '../lib/generated-detail-html';
import {
  DETAIL_PREVIEW_SCROLL_MESSAGE,
  SCRIPTED_PREVIEW_SANDBOX,
  buildDetailPreviewLayoutMetrics,
  isDetailPreviewMetricsMessage,
  isSameDetailPreviewLayout,
  stripSrcDocScripts,
  type DetailPreviewMetricsMessage,
  type DetailPreviewLayoutMetrics,
  withDetailPreviewBridge,
} from '@/app/(product-pipeline)/product-pipeline/_shared/lib/preview-sandbox';
import { detailPageEditorHref } from '@/app/(product-pipeline)/product-pipeline/_shared/lib/product-pipeline-routes';
import { useGenerationHistory, type GenerationHistoryItem } from '../hooks/useGenerationHistory';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface Props {
  productId: string;
  detailPreviewHtml: string;
  editedHtml?: string | null;
  templateCss: string;
  /**
   * 사용자가 생성 이력 탭에서 골라 띄우기로 한 KP entry id.
   * null = 자동 (이 product 의 최신 KP 이력 사용).
   */
  selectedKidsPlayfulId?: string | null;
  /** 사용자가 고른 KIDITEM DESIGN entry id. */
  selectedBoldVerticalId?: string | null;
  /** 사용자가 고른 ContentAgent entry id. */
  selectedAgentId?: string | null;
  initialAgentHistory?: GenerationHistoryItem[];
  generationHistoryQueryEnabled?: boolean;
  detailEditorSourceCandidateId?: string | null;
  detailEditorReturnHref: string;
}

const MAX_MINIMAP_WIDTH = 200; // px — 우선 가로 200px 시도, 페이지가 길면 더 좁게
const FULL_PREVIEW_WIDTH = 720; // px — 쿠팡 상세페이지 기준 미리보기 폭
const VIEWPORT_HEIGHT_VH = 82; // vh — 우측 iframe 높이
const INITIAL_PREVIEW_LAYOUT: DetailPreviewLayoutMetrics = {
  scale: 0.25,
  minimapWidth: MAX_MINIMAP_WIDTH,
  contentHeight: 2000,
  viewportTop: 0,
  viewportHeight: 0,
};

function isCompletedDetailGenerationStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return normalized === 'COMPLETED' || normalized === 'READY';
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function buildServerRenderHtml(html: string): string {
  const cleaned = stripSrcDocScripts(html);
  const base = `<base href="${API_BASE}/" />`;
  if (/<base\s/i.test(cleaned)) {
    return cleaned;
  }
  if (/<head(\s[^>]*)?>/i.test(cleaned)) {
    return cleaned.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n${base}`);
  }
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  ${base}
</head>
<body>${cleaned}</body>
</html>`;
}

export default function DetailPagePreview({
  productId,
  detailPreviewHtml,
  editedHtml = null,
  templateCss,
  selectedKidsPlayfulId = null,
  selectedBoldVerticalId = null,
  selectedAgentId = null,
  initialAgentHistory,
  generationHistoryQueryEnabled = true,
  detailEditorSourceCandidateId,
  detailEditorReturnHref,
}: Props) {
  const fullIframeRef = useRef<HTMLIFrameElement>(null);
  const minimapContainerRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // 이 product 의 Trend / KIDITEM / Agent 이력 — server DB 에서 조회.
  const { data: kpEntries = [] } = useKidsPlayfulGenerationList(productId, {
    enabled: generationHistoryQueryEnabled,
  });
  const { data: boldEntries = [] } = useBoldVerticalGenerationList(productId, {
    enabled: generationHistoryQueryEnabled,
  });
  const { data: agentHistory = [] } = useGenerationHistory(
    productId,
    initialAgentHistory,
    { enabled: generationHistoryQueryEnabled },
  );

  // 우선순위: 사용자 명시 선택 > 자동 default
  // selected{Agent|Trend|KIDITEM}Id 있으면 그것 우선
  // 셋 다 null 이면 최신 Trend > 최신 KIDITEM > Agent default
  const selectedAgentEntry = useMemo(
    () => (selectedAgentId ? agentHistory.find((h) => h.id === selectedAgentId) ?? null : null),
    [selectedAgentId, agentHistory],
  );
  const autoAgentEntry = useMemo(() => {
    if (selectedAgentId || selectedKidsPlayfulId || selectedBoldVerticalId || editedHtml) return null;
    return agentHistory.find((entry) => (
      isCompletedDetailGenerationStatus(entry.status) &&
      (entry.detailPageArtifactId || entry.detailPageData)
    )) ?? null;
  }, [agentHistory, editedHtml, selectedAgentId, selectedBoldVerticalId, selectedKidsPlayfulId]);
  const activeAgentEntry = selectedAgentEntry ?? autoAgentEntry;
  const { data: selectedAgentEditedHtml } = useQuery({
    queryKey: activeAgentEntry?.id
      ? queryKeys.productContent.generationEditedHtml(activeAgentEntry.id)
      : queryKeys.productContent.generationEditedHtml(''),
    queryFn: () => {
      if (!activeAgentEntry?.id) {
        throw new Error('detail page generation id is required');
      }
      return apiClient.get<{ html: string | null; savedAt: string | null }>(
        `/api/ai/detail-page/${activeAgentEntry.id}/edited-html`,
      );
    },
    enabled: !!activeAgentEntry?.id,
    staleTime: 30_000,
  });
  // optimistic placeholder (`id: 'optimistic-...'`) 는 진행 배너 용도라 auto-select 대상에서 제외.
  // 클릭 시 실제 row id 가 아니라 404 → 에디터 "불러올 수 없다" 에러 발생하던 버그 픽스.
  const realKpEntries = useMemo(
    () => kpEntries.filter((e) => !e.id.startsWith('optimistic-')),
    [kpEntries],
  );
  const realBoldEntries = useMemo(
    () => boldEntries.filter((e) => !e.id.startsWith('optimistic-')),
    [boldEntries],
  );

  const hasExplicitSelection = !!(selectedAgentId || selectedKidsPlayfulId || selectedBoldVerticalId);

  const boldEntry = useMemo(() => {
    if (selectedAgentId || selectedKidsPlayfulId) return null; // 다른 게 명시 선택
    if (selectedBoldVerticalId) {
      return realBoldEntries.find((e) => e.id === selectedBoldVerticalId) ?? null;
    }
    if (editedHtml) return null;
    // 자동 default — Trend 이력 없을 때만 KIDITEM default 적용
    return realKpEntries.length === 0 ? realBoldEntries[0] ?? null : null;
  }, [realBoldEntries, realKpEntries, selectedBoldVerticalId, selectedKidsPlayfulId, selectedAgentId, editedHtml]);

  const kpEntry: KidsPlayfulGenerationItem | null = useMemo(() => {
    if (selectedAgentId || selectedBoldVerticalId) return null;
    if (selectedKidsPlayfulId) {
      return realKpEntries.find((e) => e.id === selectedKidsPlayfulId) ?? null;
    }
    if (editedHtml) return null;
    return realKpEntries[0] ?? null;
  }, [realKpEntries, selectedKidsPlayfulId, selectedBoldVerticalId, selectedAgentId, editedHtml]);

  const kpData: KidsPlayfulData | null = useMemo(
    () => (kpEntry ? rowToRendererData(kpEntry) : null),
    [kpEntry],
  );
  const editorHref = useMemo(() => {
    const generationId = kpEntry?.id ?? boldEntry?.id ?? activeAgentEntry?.id ?? null;
    if (!generationId && !detailEditorSourceCandidateId) return null;
    return detailPageEditorHref({
      candidateId: detailEditorSourceCandidateId,
      generationId,
      returnTo: detailEditorReturnHref,
    });
  }, [activeAgentEntry?.id, boldEntry?.id, detailEditorReturnHref, detailEditorSourceCandidateId, kpEntry?.id]);

  // KIDITEM generation → BoldVertical 템플릿.
  const boldHtml = useMemo(() => {
    if (!boldEntry) return null;
    try {
      const adapted = adaptBoldVerticalToDetailPageData(
        boldEntry.result as unknown as BoldVerticalGeneration,
        boldEntry.imageUrls,
        boldEntry.processedImages,
        API_BASE,
      );
      const data = parseDetailPageData(adapted);
      const config = getTemplate('bold-vertical');
      return renderTemplateToHtml(
        config.component as React.ComponentType<unknown>,
        data,
        config,
        templateCss,
      );
    } catch {
      return null;
    }
  }, [boldEntry, templateCss]);

  // selectedAgentId 가 있으면 artifact/revision HTML 을 우선 사용하고,
  // legacy row 만 detailPageData 로 HTML rebuild. 아니면 KP/default 순서.
  const agentSelectedHtml = useMemo(() => {
    if (selectedAgentEditedHtml?.html) {
      return ensureStyledDetailHtml(selectedAgentEditedHtml.html, templateCss);
    }
    if (!activeAgentEntry?.detailPageData) return null;
    try {
      return buildGenerationHistoryHtml(activeAgentEntry, templateCss);
    } catch {
      return null;
    }
  }, [activeAgentEntry, selectedAgentEditedHtml?.html, templateCss]);

  // ⚡ 깜빡임 방지: 의미적으로 같은 컨텐츠인 동안 srcDoc 안 갱신.
  const previewKey = activeAgentEntry
    ? `agent:${activeAgentEntry.id}:${selectedAgentEditedHtml?.savedAt ?? 'generated'}`
    : kpEntry
      ? `kp:${kpEntry.id}:${kpEntry.imageProcessingStatus}`
      : boldEntry
        ? `bold:${boldEntry.id}:${boldEntry.imageProcessingStatus}`
        : editedHtml
          ? `edited:${editedHtml.length}`
          : 'default';
  const effectivePreviewHtml = useMemo(() => {
    if (agentSelectedHtml) return agentSelectedHtml;
    if (kpData) return buildKidsPlayfulHtml(kpData);
    if (boldHtml) return boldHtml;
    if (!hasExplicitSelection && editedHtml) {
      return ensureStyledDetailHtml(editedHtml, templateCss);
    }
    return ensureStyledDetailHtml(detailPreviewHtml, templateCss);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, detailPreviewHtml, agentSelectedHtml, boldHtml, editedHtml, hasExplicitSelection, templateCss]);
  const sandboxedPreviewHtml = useMemo(
    () => withDetailPreviewBridge(effectivePreviewHtml),
    [effectivePreviewHtml],
  );

  // 미니맵 scale: width-fit 와 height-fit 둘 다 충족하는 값 (작은 쪽 채택).
  // 이전엔 width 만 fit → 페이지가 길면 미니맵 아래쪽 잘림. 사용자 "밑부분이 잘려있어".
  const [previewLayout, setPreviewLayout] = useState(INITIAL_PREVIEW_LAYOUT);
  const previewLayoutRef = useRef(INITIAL_PREVIEW_LAYOUT);
  const { scale, minimapWidth, contentHeight, viewportTop, viewportHeight } = previewLayout;

  const applyPreviewMetrics = useCallback((data: DetailPreviewMetricsMessage) => {
    const container = minimapContainerRef.current;
    if (!container) return;
    const next = buildDetailPreviewLayoutMetrics(data, {
      containerHeight: container.clientHeight,
      maxMinimapWidth: MAX_MINIMAP_WIDTH,
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
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [applyPreviewMetrics]);

  useEffect(() => {
    previewLayoutRef.current = INITIAL_PREVIEW_LAYOUT;
    setPreviewLayout(INITIAL_PREVIEW_LAYOUT);
  }, [sandboxedPreviewHtml]);

  // 미니맵 클릭 → 풀 iframe 해당 위치로 jump
  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const minimap = e.currentTarget.getBoundingClientRect();
    const clickRatio = (e.clientY - minimap.top) / minimap.height;
    const full = fullIframeRef.current;
    if (!full?.contentWindow) return;
    const targetY = clickRatio * contentHeight - viewportHeight / 2;
    full.contentWindow.postMessage(
      {
        type: DETAIL_PREVIEW_SCROLL_MESSAGE,
        y: Math.max(0, targetY),
        behavior: 'smooth',
      },
      '*',
    );
  };

  // 이미지 다운로드 — 서버 Puppeteer 렌더러로 긴 JPEG 1장 저장.
  // 클라이언트 html2canvas 는 긴 상세페이지에서 자주 멈춰서 서버 캡처 경로를 사용한다.
  const handleDownloadJpeg = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const renderHtml = buildServerRenderHtml(effectivePreviewHtml);
      const res = await apiClient.fetchRaw('/api/render-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: renderHtml, format: 'jpeg', quality: 92 }),
      });
      if (!res.ok) {
        throw new Error(`JPEG 렌더링 실패: ${res.status}`);
      }
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const blob = await res.blob();
      downloadBlob(blob, `detail-page-${productId.slice(0, 8)}-${ts}.jpg`);
      toast.success('JPEG 다운로드 완료');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'JPEG 다운로드 실패';
      toast.error(msg);
    } finally {
      setIsDownloading(false);
    }
  }, [effectivePreviewHtml, isDownloading, productId]);

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-800 inline-flex items-center gap-2">
          생성된 상세페이지
          {activeAgentEntry ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              {generatedDetailTemplateLabel(activeAgentEntry)}
            </span>
          ) : kpData ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
              <Sparkles size={10} />
              TREND VERTICAL
            </span>
          ) : boldEntry ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
              KIDITEM DESIGN
            </span>
          ) : null}
        </h3>
        <div className="flex items-center gap-2">
          {/* 에디터 진입 — Trend 결과 표시 중이면 ?kpId, KIDITEM 결과면 ?boldId 로 load. */}
          {editorHref && (
            <Link
              href={editorHref}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Pencil size={13} />
              에디터에서 편집
            </Link>
          )}
          <button
            type="button"
            onClick={handleDownloadJpeg}
            disabled={isDownloading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {isDownloading ? 'JPEG 생성 중...' : 'JPEG 다운로드'}
          </button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto" style={{ height: `${VIEWPORT_HEIGHT_VH}vh` }}>
        {/* 좌측 — 미니맵. 페이지 전체가 fit-to-height 로 한 화면에 들어옴 */}
        <div
          ref={minimapContainerRef}
          className="relative shrink-0 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden cursor-pointer shadow-sm"
          style={{ width: minimapWidth }}
          onClick={handleMinimapClick}
          title="클릭하면 해당 위치로 이동"
        >
          {/* 축소된 iframe — pointer-events-none 으로 자체 스크롤 차단 (외부 div 클릭만 받음) */}
          <iframe
            srcDoc={sandboxedPreviewHtml}
            className="absolute top-0 left-0 border-0 pointer-events-none"
            style={{
              width: `${minimapWidth / scale}px`,
              height: `${contentHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            title="detail-minimap"
            sandbox={SCRIPTED_PREVIEW_SANDBOX}
          />
          {/* 현재 viewport 위치 박스 — y축 픽셀값 × scale 로 정확히 계산.
              scrollY 가 800px, scale 0.25 면 박스 top 200px. transition 없이 즉시 반영. */}
          <div
            className="absolute left-0 right-0 border-2 border-indigo-500 bg-indigo-500/15 pointer-events-none"
            style={{
              top: `${viewportTop * scale}px`,
              height: `${viewportHeight * scale}px`,
            }}
          />
        </div>

        {/* 우측 — 풀 미리보기 */}
        <div
          className="shrink-0 rounded-xl border border-slate-200 bg-white overflow-hidden"
          style={{ width: FULL_PREVIEW_WIDTH }}
        >
          <iframe
            ref={fullIframeRef}
            srcDoc={sandboxedPreviewHtml}
            className="w-full h-full border-0"
            title="detail-page-preview"
            sandbox={SCRIPTED_PREVIEW_SANDBOX}
          />
        </div>
      </div>
    </div>
  );
}
