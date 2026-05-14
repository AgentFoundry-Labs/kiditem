'use client';

/**
 * /generate 하단 + sourcing 상세 — KidsPlayful 생성 이력 카드 리스트.
 *
 * Server DB 기반 (companyId scope) — react-query useQuery 로 fetch.
 * 카드 = 썸네일 + 상품명 + 메인헤드라인 + 생성 시각.
 * 클릭 시 풀스크린 KidsPlayfulRenderer 모달.
 * filterProductId 옵션 — sourcing 상세 페이지에서 그 product 만.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Download,
  ExternalLink,
  History,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { downloadBlob } from '@/lib/browser-download';
import { cn } from '@/lib/utils';
import {
  SAME_ORIGIN_SCRIPTLESS_SANDBOX,
  stripSrcDocScripts,
} from '@/app/(sourcing)/sourcing/lib/preview-sandbox';
import { buildSourcingEditorHref } from '@/app/(sourcing)/sourcing/lib/sourcing-routing';
import {
  ensureStyledDetailHtml,
  isRenderableDetailHtml,
} from '@/app/(sourcing)/sourcing/lib/template-html';
import {
  rowThumbnail,
  rowDisplaySubtitle,
  rowDisplayTitle,
  rowTemplateLabel,
  rowToRendererData,
  useBoldVerticalGenerationList,
  useKidsPlayfulGenerationDelete,
  useKidsPlayfulGenerationList,
  useKidsPlayfulOne,
  type KidsPlayfulGenerationItem,
} from '../hooks/useKidsPlayfulGenerate';
import { buildKidsPlayfulHtml } from '../lib/build-kids-playful-html';
import { buildBoldVerticalHtml } from '../lib/build-bold-vertical-html';
import {
  adaptBoldVerticalToDetailPageData,
  type BoldVerticalGeneration,
} from '../lib/bold-vertical-types';

/** 'YYYY-MM-DD HH:mm' */
function formatTs(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 카드에 표시할 상품명/타이틀 — "!" 제거. 실제 상세페이지 콘텐츠는 그대로 둠. */
function stripExclamation(text: string): string {
  return text.replace(/!/g, '').trim();
}

function downloadFileName(entry: KidsPlayfulGenerationItem): string {
  const base = stripExclamation(entry.productName || rowDisplayTitle(entry) || 'detail-page')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return `${base || 'detail-page'}.png`;
}

function canRenderGeneratedResult(entry: KidsPlayfulGenerationItem): boolean {
  if (entry.imageProcessingStatus !== 'completed') return false;
  return !!entry.result && typeof entry.result === 'object' && Object.keys(entry.result).length > 0;
}

interface KidsPlayfulHistoryListProps {
  /** 있으면 이 productId 의 이력만 필터링. sourcing/[id] 의 상세페이지 탭에서 사용. */
  filterProductId?: string;
  /** sourcing 탭에 임베드 시 padding/헤더 작게. */
  compact?: boolean;
}

export default function KidsPlayfulHistoryList({
  filterProductId,
  compact = false,
}: KidsPlayfulHistoryListProps = {}) {
  const { data: kpEntries = [], isLoading: isKpLoading } = useKidsPlayfulGenerationList(filterProductId);
  const { data: boldEntries = [], isLoading: isBoldLoading } = useBoldVerticalGenerationList(filterProductId);
  const deleteMut = useKidsPlayfulGenerationDelete();
  const [openId, setOpenId] = useState<string | null>(null);
  const isLoading = isKpLoading || isBoldLoading;
  const entries = useMemo(
    () =>
      [...kpEntries, ...boldEntries]
        .filter((entry) => !entry.id.startsWith('optimistic-'))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [kpEntries, boldEntries],
  );

  const openEntry = useMemo(
    () => (openId ? entries.find((e) => e.id === openId) ?? null : null),
    [openId, entries],
  );

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 생성 이력을 삭제할까요?')) return;
    deleteMut.mutate(id, {
      onError: (err) => {
        toast.error(isApiError(err) ? err.detail : '삭제 실패');
      },
    });
  };

  return (
    <section className={cn(compact ? '' : 'border-t border-slate-200 bg-white')}>
      <div className={cn(compact ? '' : 'px-8 py-8')}>
        <div className={cn('flex items-center justify-between', compact ? 'mb-3' : 'mb-5')}>
          <div>
            <h2
              className={cn(
                'font-bold text-slate-900 inline-flex items-center gap-2',
                compact ? 'text-sm' : 'text-lg',
              )}
            >
              <History size={compact ? 14 : 18} className="text-violet-500" />
              {compact ? '상세페이지 생성 이력' : '상세페이지 생성 이력'}
            </h2>
            {!compact && (
              <p className="text-xs text-slate-500 mt-1">
                KIDITEM DESIGN / 트렌드 광고형 템플릿 생성 결과 — 카드 클릭하면 다시 볼 수 있어요.{' '}
                <span className="text-slate-400">(DB 영구 저장, 회사 단위)</span>
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <div
            className={cn(
              'rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-slate-400',
              compact ? 'py-6 text-xs' : 'py-12 text-sm',
            )}
          >
            이력 불러오는 중...
          </div>
        ) : entries.length === 0 ? (
          <div
            className={cn(
              'rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-slate-400',
              compact ? 'py-6 text-xs' : 'py-12 text-sm',
            )}
          >
            {filterProductId
              ? '이 상품의 상세페이지 생성 이력이 없어요. 위에서 생성하면 여기에 쌓여요.'
              : '아직 생성 이력이 없어요. 상세페이지를 만들면 여기에 쌓여요.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {entries.map((entry) => (
              <HistoryCard
                key={entry.id}
                entry={entry}
                onOpen={() => setOpenId(entry.id)}
                onDelete={(e) => handleDelete(entry.id, e)}
              />
            ))}
          </div>
        )}
      </div>

      {openEntry && (
        <FullscreenViewer entry={openEntry} onClose={() => setOpenId(null)} />
      )}
    </section>
  );
}

interface HistoryCardProps {
  entry: KidsPlayfulGenerationItem;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function HistoryCard({ entry, onOpen, onDelete }: HistoryCardProps) {
  const thumb = rowThumbnail(entry);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-slate-200 bg-white text-left',
        'hover:border-violet-400 hover:shadow-lg transition-all',
      )}
    >
      <div className="relative aspect-[4/3] bg-slate-100">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={entry.productName} className="w-full h-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Sparkles size={32} />
          </div>
        )}
        <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-violet-600/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold tracking-wider text-white">
          {rowTemplateLabel(entry)}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="absolute top-2 left-2 rounded-md bg-white/80 backdrop-blur-sm p-1.5 text-slate-500 hover:bg-white hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="삭제"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="p-3 space-y-1">
        <p className="text-[11px] text-slate-400 truncate">{stripExclamation(entry.productName)}</p>
        <h3 className="text-sm font-bold text-slate-900 truncate">
          {stripExclamation(`${rowDisplayTitle(entry)} ${rowDisplaySubtitle(entry)}`)}
        </h3>
        <div className="flex items-center gap-1 text-[10px] text-slate-400 pt-1">
          <Calendar size={10} />
          {formatTs(entry.createdAt)}
        </div>
      </div>
    </div>
  );
}

interface FullscreenViewerProps {
  entry: KidsPlayfulGenerationItem;
  onClose: () => void;
}

function FullscreenViewer({ entry, onClose }: FullscreenViewerProps) {
  const router = useRouter();
  const { data: latestEntry, isLoading: isEntryLoading } = useKidsPlayfulOne(entry.id);
  const previewEntry = latestEntry ?? entry;
  const [templateCss, setTemplateCss] = useState<string | null>(null);
  const [editedHtml, setEditedHtml] = useState<string | null>(null);
  const [editedHtmlLoaded, setEditedHtmlLoaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const isBoldVertical = previewEntry.templateId === 'bold-vertical';

  useEffect(() => {
    let cancelled = false;
    setEditedHtml(null);
    setEditedHtmlLoaded(false);

    apiClient
      .get<{ html: string | null }>(
        `/api/ai/detail-page/${encodeURIComponent(entry.id)}/edited-html`,
      )
      .then((row) => {
        if (cancelled) return;
        const html = row.html?.trim() ?? '';
        setEditedHtml(isRenderableDetailHtml(html) ? html : null);
      })
      .catch(() => {
        if (!cancelled) setEditedHtml(null);
      })
      .finally(() => {
        if (!cancelled) setEditedHtmlLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  useEffect(() => {
    let cancelled = false;
    fetch('/templates-styles.css', { cache: 'no-store' })
      .then((res) => (res.ok ? res.text() : ''))
      .then((css) => {
        if (!cancelled) setTemplateCss(css);
      })
      .catch(() => {
        if (!cancelled) setTemplateCss('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const html = useMemo((): string | null => {
    if (templateCss == null) return '';
    if (editedHtmlLoaded && editedHtml) return ensureStyledDetailHtml(editedHtml, templateCss);
    if (!canRenderGeneratedResult(previewEntry)) return null;
    if (isBoldVertical) {
      const adapted = adaptBoldVerticalToDetailPageData(
        previewEntry.result as unknown as BoldVerticalGeneration,
        previewEntry.imageUrls,
        previewEntry.processedImages,
        API_BASE,
      );
      return buildBoldVerticalHtml(adapted, templateCss);
    }
    return buildKidsPlayfulHtml(rowToRendererData(previewEntry), templateCss);
  }, [editedHtml, editedHtmlLoaded, isBoldVertical, previewEntry, templateCss]);
  const sandboxedHtml = useMemo(() => (html ? stripSrcDocScripts(html) : null), [html]);
  const isPreviewLoading = isEntryLoading || templateCss == null || !editedHtmlLoaded;
  const editorHref = useMemo(
    () => buildSourcingEditorHref({
      candidateId: sourceCandidateIdFromGeneration(previewEntry),
      generationId: previewEntry.id,
    }),
    [previewEntry],
  );

  const handleOpenEditor = useCallback(() => {
    router.push(editorHref);
  }, [editorHref, router]);

  const handleDownloadImage = useCallback(async () => {
    if (!html || isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await apiClient.fetchRaw('/api/render-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: stripSrcDocScripts(html),
          viewportWidth: 860,
          baseUrl: window.location.origin,
        }),
      });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      downloadBlob(await res.blob(), downloadFileName(previewEntry));
      toast.success('이미지를 다운로드했어요.');
    } catch (err) {
      console.error('[generate-history] detail image download failed', err);
      toast.error('이미지 다운로드에 실패했습니다.');
    } finally {
      setIsDownloading(false);
    }
  }, [html, isDownloading, previewEntry]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2">
      <div className="relative flex h-[98vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl">
        <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles size={18} className="text-violet-600 shrink-0" />
            <h3 className="text-base font-bold text-slate-900 truncate">
              {stripExclamation(rowDisplayTitle(previewEntry))}
            </h3>
            <span className="text-xs text-slate-400 font-mono truncate">{stripExclamation(previewEntry.productName)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:ml-4">
            <button
              type="button"
              onClick={handleOpenEditor}
              aria-label="에디터 열기"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">에디터 열기</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={!html || isDownloading}
              aria-label="이미지 다운로드"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span className="hidden sm:inline">이미지 다운로드</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="닫기"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-white">
          {isPreviewLoading ? (
            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
              상세페이지 미리보기를 불러오는 중입니다.
            </div>
          ) : !sandboxedHtml ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-slate-400">
              생성된 상세페이지 결과물이 아직 없습니다.
            </div>
          ) : (
            <iframe
              title="상세페이지 생성 이력 미리보기"
              srcDoc={sandboxedHtml}
              className="h-full w-full border-0"
              sandbox={SAME_ORIGIN_SCRIPTLESS_SANDBOX}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function sourceCandidateIdFromGeneration(entry: KidsPlayfulGenerationItem): string | null {
  const rawInput = entry.rawInput;
  if (!rawInput || typeof rawInput !== 'object') return null;
  const sourceReferences = (rawInput as { sourceReferences?: unknown }).sourceReferences;
  if (!Array.isArray(sourceReferences)) return null;
  for (const ref of sourceReferences) {
    if (
      ref &&
      typeof ref === 'object' &&
      (ref as { sourceType?: unknown }).sourceType === 'sourcing_candidate' &&
      typeof (ref as { sourceCandidateId?: unknown }).sourceCandidateId === 'string'
    ) {
      return (ref as { sourceCandidateId: string }).sourceCandidateId;
    }
  }
  return null;
}
