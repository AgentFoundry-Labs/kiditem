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
  useSimpleVerticalGenerationList,
  type KidsPlayfulGenerationItem,
} from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import type { KidsPlayfulData } from '@/app/(media-ai)/generate/lib/kids-playful-types';
import { buildKidsPlayfulHtml } from '@/app/(media-ai)/generate/lib/build-kids-playful-html';
import {
  adaptSimpleVerticalToDetailPageData,
  type SimpleVerticalGeneration,
} from '@/app/(media-ai)/generate/lib/simple-vertical-types';
import { ensureStyledDetailHtml, renderTemplateToHtml } from '../../lib/template-html';
import { useGenerationHistory } from '../hooks/useGenerationHistory';

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
  /** 사용자가 고른 simple-vertical entry id. */
  selectedSimpleVerticalId?: string | null;
  /** 사용자가 고른 ContentAgent entry id. */
  selectedAgentId?: string | null;
}

const MAX_MINIMAP_WIDTH = 200; // px — 우선 가로 200px 시도, 페이지가 길면 더 좁게
const VIEWPORT_HEIGHT_VH = 82; // vh — 우측 iframe 높이

export default function DetailPagePreview({
  productId,
  detailPreviewHtml,
  editedHtml = null,
  templateCss,
  selectedKidsPlayfulId = null,
  selectedSimpleVerticalId = null,
  selectedAgentId = null,
}: Props) {
  const fullIframeRef = useRef<HTMLIFrameElement>(null);
  const minimapContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // 이 product 의 KP / SV / Agent 이력 — server DB 에서 조회.
  const { data: kpEntries = [] } = useKidsPlayfulGenerationList(productId);
  const { data: svEntries = [] } = useSimpleVerticalGenerationList(productId);
  const { data: agentHistory = [] } = useGenerationHistory(productId);

  // 우선순위: 사용자 명시 선택 > 자동 default
  // selected{Agent|KP|SV}Id 있으면 그것 우선
  // 셋 다 null 이면 최신 KP > 최신 SV > Agent default
  const selectedAgentEntry = useMemo(
    () => (selectedAgentId ? agentHistory.find((h) => h.id === selectedAgentId) ?? null : null),
    [selectedAgentId, agentHistory],
  );
  // optimistic placeholder (`id: 'optimistic-...'`) 는 진행 배너 용도라 auto-select 대상에서 제외.
  // 클릭 시 실제 row id 가 아니라 404 → 에디터 "불러올 수 없다" 에러 발생하던 버그 픽스.
  const realKpEntries = useMemo(
    () => kpEntries.filter((e) => !e.id.startsWith('optimistic-')),
    [kpEntries],
  );
  const realSvEntries = useMemo(
    () => svEntries.filter((e) => !e.id.startsWith('optimistic-')),
    [svEntries],
  );

  const hasExplicitSelection = !!(selectedAgentId || selectedKidsPlayfulId || selectedSimpleVerticalId);

  const svEntry = useMemo(() => {
    if (selectedAgentId || selectedKidsPlayfulId) return null; // 다른 게 명시 선택
    if (selectedSimpleVerticalId) {
      return realSvEntries.find((e) => e.id === selectedSimpleVerticalId) ?? null;
    }
    if (editedHtml) return null;
    // 자동 default — KP 이력 없을 때만 SV default 적용
    return realKpEntries.length === 0 ? realSvEntries[0] ?? null : null;
  }, [realSvEntries, realKpEntries, selectedSimpleVerticalId, selectedKidsPlayfulId, selectedAgentId, editedHtml]);

  const kpEntry: KidsPlayfulGenerationItem | null = useMemo(() => {
    if (selectedAgentId || selectedSimpleVerticalId) return null;
    if (selectedKidsPlayfulId) {
      return realKpEntries.find((e) => e.id === selectedKidsPlayfulId) ?? null;
    }
    if (editedHtml) return null;
    return realKpEntries[0] ?? null;
  }, [realKpEntries, selectedKidsPlayfulId, selectedSimpleVerticalId, selectedAgentId, editedHtml]);

  const kpData: KidsPlayfulData | null = useMemo(
    () => (kpEntry ? rowToRendererData(kpEntry) : null),
    [kpEntry],
  );

  // SV → BoldVertical 템플릿 (사용자 요청: AGENT row 같은 풍부한 디자인).
  const svHtml = useMemo(() => {
    if (!svEntry) return null;
    try {
      const adapted = adaptSimpleVerticalToDetailPageData(
        svEntry.result as unknown as SimpleVerticalGeneration,
        svEntry.imageUrls,
        svEntry.processedImages,
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
  }, [svEntry, templateCss]);

  // selectedAgentId 가 있으면 그 row 의 detailPageData 로 HTML rebuild,
  // 아니면 KP 우선, 아니면 default (master_products) HTML.
  const agentSelectedHtml = useMemo(() => {
    if (!selectedAgentEntry?.detailPageData) return null;
    try {
      const data = parseDetailPageData(selectedAgentEntry.detailPageData);
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
  }, [selectedAgentEntry, templateCss]);

  // ⚡ 깜빡임 방지: 의미적으로 같은 컨텐츠인 동안 srcDoc 안 갱신.
  const previewKey = selectedAgentEntry
    ? `agent:${selectedAgentEntry.id}`
    : kpEntry
      ? `kp:${kpEntry.id}:${kpEntry.imageProcessingStatus}`
      : svEntry
        ? `sv:${svEntry.id}:${svEntry.imageProcessingStatus}`
        : editedHtml
          ? `edited:${editedHtml.length}`
          : 'default';
  const effectivePreviewHtml = useMemo(() => {
    if (agentSelectedHtml) return agentSelectedHtml;
    if (kpData) return buildKidsPlayfulHtml(kpData);
    if (svHtml) return svHtml;
    if (!hasExplicitSelection && editedHtml) {
      return ensureStyledDetailHtml(editedHtml, templateCss);
    }
    return ensureStyledDetailHtml(detailPreviewHtml, templateCss);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, detailPreviewHtml, agentSelectedHtml, svHtml, editedHtml, hasExplicitSelection, templateCss]);
  const iframeSandbox =
    effectivePreviewHtml.includes('<script') ? 'allow-scripts allow-same-origin' : 'allow-same-origin';

  // 미니맵 scale: width-fit 와 height-fit 둘 다 충족하는 값 (작은 쪽 채택).
  // 이전엔 width 만 fit → 페이지가 길면 미니맵 아래쪽 잘림. 사용자 "밑부분이 잘려있어".
  const [scale, setScale] = useState(0.25);
  const [minimapWidth, setMinimapWidth] = useState(MAX_MINIMAP_WIDTH);
  const [contentHeight, setContentHeight] = useState(2000);
  const [viewportPx, setViewportPx] = useState({ top: 0, height: 0 });

  const measureContent = useCallback(() => {
    const full = fullIframeRef.current;
    const container = minimapContainerRef.current;
    let doc: Document | null = null;
    try {
      doc = full?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    if (!doc || !container) return;
    const docHeight = doc.documentElement.scrollHeight;
    const fullWidth = doc.documentElement.scrollWidth || 720;
    const containerHeight = container.clientHeight;

    // width-fit scale: 200/720 = 0.28
    // height-fit scale: containerH / docHeight (예: 700 / 4000 = 0.175)
    // 둘 중 작은 쪽 채택 → 페이지 전체가 미니맵 한 화면에 정확히 맞음.
    const widthScale = MAX_MINIMAP_WIDTH / fullWidth;
    const heightScale = containerHeight / docHeight;
    const finalScale = Math.min(widthScale, heightScale);

    setContentHeight(docHeight);
    setScale(finalScale);
    setMinimapWidth(fullWidth * finalScale);
  }, []);

  // 실제 y축 값 측정 — 사용자 요구 "스크롤 따라가는 게 아니라 y축 값 계산해서"
  // scrollY 와 innerHeight 그대로 픽셀로 보존. 미니맵 box 위치 = scrollY * scale.
  // (이전엔 ratio 로 환산해서 transition 으로 부드럽게 했는데 사용자가 부정확하다고 인식 →
  //  px 값 그대로 적용. 박스 정확히 콘텐츠 한 영역에 고정.)
  const updateViewport = useCallback(() => {
    const full = fullIframeRef.current;
    try {
      if (!full?.contentDocument || !full.contentWindow) return;
    } catch {
      return;
    }
    const win = full.contentWindow;
    const top = win.scrollY;
    const height = win.innerHeight;
    setViewportPx({ top, height });
  }, []);

  // requestAnimationFrame loop — iframe scroll 이벤트가 누락되는 경우 대비.
  // 60fps 폴링으로 어떤 scroll 방식이든 정확히 따라감 (휠 / drag scrollbar / 키보드 모두).
  useEffect(() => {
    const tick = () => {
      updateViewport();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [updateViewport]);

  useEffect(() => {
    const full = fullIframeRef.current;
    if (!full) return;
    const onLoad = () => {
      measureContent();
      updateViewport();
    };
    full.addEventListener('load', onLoad);
    if (full.contentDocument?.readyState === 'complete') onLoad();
    // iframe content 가 동적으로 변할 수 있으니 5초 간 한 번씩 재측정 (이미지 lazy-load 등)
    const remeasure = setInterval(measureContent, 1000);
    return () => {
      full.removeEventListener('load', onLoad);
      clearInterval(remeasure);
    };
  }, [effectivePreviewHtml, measureContent, updateViewport]);

  useEffect(() => {
    if (!kpData) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== fullIframeRef.current?.contentWindow) return;
      const data = event.data as
        | {
            type?: string;
            scrollY?: number;
            innerHeight?: number;
            scrollHeight?: number;
            scrollWidth?: number;
          }
        | null;
      if (data?.type !== 'kiditem:detail-preview-metrics') return;

      const docHeight = Math.max(1, data.scrollHeight ?? 0);
      const fullWidth = Math.max(1, data.scrollWidth ?? 720);
      const containerHeight = minimapContainerRef.current?.clientHeight ?? 1;
      const widthScale = MAX_MINIMAP_WIDTH / fullWidth;
      const heightScale = containerHeight / docHeight;
      const finalScale = Math.min(widthScale, heightScale);

      setContentHeight(docHeight);
      setScale(finalScale);
      setMinimapWidth(fullWidth * finalScale);
      setViewportPx({
        top: data.scrollY ?? 0,
        height: data.innerHeight ?? 0,
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [kpData]);

  // 미니맵 클릭 → 풀 iframe 해당 위치로 jump
  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const minimap = e.currentTarget.getBoundingClientRect();
    const clickRatio = (e.clientY - minimap.top) / minimap.height;
    const full = fullIframeRef.current;
    if (!full?.contentWindow) return;
    const viewportHeight = viewportPx.height || 0;
    const targetY = clickRatio * contentHeight - viewportHeight / 2;
    if (kpData) {
      full.contentWindow.postMessage(
        {
          type: 'kiditem:detail-preview-scroll',
          y: Math.max(0, targetY),
          behavior: 'smooth',
        },
        '*',
      );
      return;
    }
    full.contentWindow.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
  };

  // 이미지 다운로드 — 풀 iframe 캡처 → 단일 이미지 → PDF 1쪽 다운로드.
  // 사용자 요청: "PDF 로 해서 다운로드, 이미지 하나로".
  const handleDownloadPdf = useCallback(async () => {
    if (isDownloading) return;
    const full = fullIframeRef.current;
    if (!full?.contentDocument?.body) {
      toast.error('미리보기가 아직 준비되지 않았어요');
      return;
    }
    setIsDownloading(true);
    try {
      // dynamic import — 번들 크기 절약 (다운로드 클릭 시에만 로드)
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const body = full.contentDocument.body;
      const target = (body.querySelector('main, #root, [data-detail-root]') as HTMLElement) || body;
      // 실제 컨텐츠 높이로 캡처 (스크롤 영역 포함)
      const rect = target.getBoundingClientRect();
      const width = Math.max(target.scrollWidth, rect.width);
      const height = Math.max(target.scrollHeight, rect.height);

      const canvas = await html2canvas(target, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        scale: 2, // retina 품질
        width,
        height,
        windowWidth: width,
        windowHeight: height,
      });

      const imgData = canvas.toDataURL('image/png');

      // 캔버스 비율 유지 — A4 폭 기준으로 한 페이지 1 이미지 (높이 자동)
      const pdfWidthMm = 210; // A4 width
      const pdfHeightMm = (canvas.height / canvas.width) * pdfWidthMm;
      const orientation: 'p' | 'l' = pdfHeightMm >= pdfWidthMm ? 'p' : 'l';
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: [pdfWidthMm, pdfHeightMm],
        compress: true,
      });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');

      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      pdf.save(`detail-page-${productId.slice(0, 8)}-${ts}.pdf`);
      toast.success('PDF 다운로드 완료');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF 다운로드 실패';
      toast.error(msg);
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, productId]);

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-800 inline-flex items-center gap-2">
          생성된 상세페이지
          {selectedAgentEntry ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              AGENT
            </span>
          ) : kpData ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
              <Sparkles size={10} />
              TREND VERTICAL
            </span>
          ) : svEntry ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
              SIMPLE VERTICAL
            </span>
          ) : null}
        </h3>
        <div className="flex items-center gap-2">
          {/* 에디터 진입 — KP 결과 표시 중이면 ?kpId 쿼리로 그 결과 load. Agent 면 ?agentId. */}
          <Link
            href={
              kpEntry
                ? `/sourcing/${productId}/editor?kpId=${kpEntry.id}`
                : svEntry
                  ? `/sourcing/${productId}/editor?svId=${svEntry.id}`
                  : selectedAgentEntry
                    ? `/sourcing/${productId}/editor?agentId=${selectedAgentEntry.id}`
                    : `/sourcing/${productId}/editor`
            }
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Pencil size={13} />
            에디터에서 편집
          </Link>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {isDownloading ? 'PDF 생성 중...' : 'PDF 다운로드'}
          </button>
        </div>
      </div>

      <div className="flex gap-3" style={{ height: `${VIEWPORT_HEIGHT_VH}vh` }}>
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
            srcDoc={effectivePreviewHtml}
            className="absolute top-0 left-0 border-0 pointer-events-none"
            style={{
              width: `${minimapWidth / scale}px`,
              height: `${contentHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            title="detail-minimap"
            sandbox={iframeSandbox}
          />
          {/* 현재 viewport 위치 박스 — y축 픽셀값 × scale 로 정확히 계산.
              scrollY 가 800px, scale 0.25 면 박스 top 200px. transition 없이 즉시 반영. */}
          <div
            className="absolute left-0 right-0 border-2 border-indigo-500 bg-indigo-500/15 pointer-events-none"
            style={{
              top: `${viewportPx.top * scale}px`,
              height: `${viewportPx.height * scale}px`,
            }}
          />
        </div>

        {/* 우측 — 풀 미리보기 */}
        <div className="flex-1 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <iframe
            ref={fullIframeRef}
            srcDoc={effectivePreviewHtml}
            className="w-full h-full border-0"
            title="detail-page-preview"
            sandbox={iframeSandbox}
          />
        </div>
      </div>
    </div>
  );
}
