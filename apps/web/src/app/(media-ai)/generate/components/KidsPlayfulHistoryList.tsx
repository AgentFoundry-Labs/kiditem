'use client';

/**
 * /generate 하단 + sourcing 상세 — KidsPlayful 생성 이력 카드 리스트.
 *
 * Server DB 기반 (companyId scope) — react-query useQuery 로 fetch.
 * 카드 = 썸네일 + 상품명 + 메인헤드라인 + 생성 시각.
 * 클릭 시 풀스크린 KidsPlayfulRenderer 모달.
 * filterProductId 옵션 — sourcing 상세 페이지에서 그 product 만.
 */
import { useEffect, useMemo, useState } from 'react';
import { Calendar, History, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE } from '@/lib/api';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import {
  SAME_ORIGIN_SCRIPTLESS_SANDBOX,
  stripSrcDocScripts,
} from '@/app/(catalog)/product-content/lib/preview-sandbox';
import {
  rowThumbnail,
  rowDisplaySubtitle,
  rowDisplayTitle,
  rowTemplateLabel,
  rowToRendererData,
  useBoldVerticalGenerationList,
  useKidsPlayfulGenerationDelete,
  useKidsPlayfulGenerationList,
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
                KIDITEM DESIGN / Trend Vertical 생성 결과 — 카드 클릭하면 다시 볼 수 있어요.{' '}
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
  const [templateCss, setTemplateCss] = useState<string | null>(null);
  const isBoldVertical = entry.templateId === 'bold-vertical';
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
  const html = useMemo(() => {
    if (templateCss == null) return '';
    if (isBoldVertical) {
      const adapted = adaptBoldVerticalToDetailPageData(
        entry.result as unknown as BoldVerticalGeneration,
        entry.imageUrls,
        entry.processedImages,
        API_BASE,
      );
      return buildBoldVerticalHtml(adapted, templateCss);
    }
    return buildKidsPlayfulHtml(rowToRendererData(entry), templateCss);
  }, [entry, isBoldVertical, templateCss]);
  const sandboxedHtml = useMemo(() => stripSrcDocScripts(html), [html]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2">
      <div className="relative flex h-[98vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={18} className="text-violet-600 shrink-0" />
            <h3 className="text-base font-bold text-slate-900 truncate">
              {stripExclamation(rowDisplayTitle(entry))}
            </h3>
            <span className="text-xs text-slate-400 font-mono truncate">{stripExclamation(entry.productName)}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-white">
          {templateCss == null ? (
            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
              템플릿 스타일을 불러오는 중입니다.
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
