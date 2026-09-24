'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon, Loader2, Search, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ListingThumbnailEvaluation } from '@kiditem/shared/product-content';
import { ErrorState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { queryKeys } from '@/lib/query-keys';
import { resolveImageUrl } from '@/lib/resolve-url';
import { cn } from '@/lib/utils';
import { channelListingsApi, type RegisteredChannelListing } from '../../registered-products/lib/channel-listings-api';
import { useCreateThumbnailEditJobs } from '../../_shared/hooks/useThumbnailJobs';
import { LISTING_THUMBNAIL_GRADE_BG, LISTING_THUMBNAIL_GRADES } from '../../_shared/lib/thumbnail-grade';
import {
  useCurrentListingEvaluations,
  useEvaluateListingThumbnail,
  useRefreshListingEvaluations,
} from '../hooks/useListingThumbnailEvaluations';
import { friendlyError } from '@/lib/api-error';

const PAGE_SIZE = 50;
/** 검색은 입력이 멈춘 뒤에 보낸다. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * 평가 모델 목록. 평가는 모델을 명시해야 하므로(모델 선택 필수) 기본값을 두지 않는다 — 운영자가 고른 모델만
 * 서버로 간다. 서버 vision provider 가 받는 Gemini 모델 id 다.
 */
const EVALUATION_MODELS = [
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
] as const;

/**
 * 리스팅 평가: 몰이 보고한 대표이미지(`imageUrl`, 우리 작업공간의 `thumbnailUrl` 이 아니다)를 모델로 채점하고,
 * 낮은 등급은 AI 편집으로 넘긴다(KID-313 결정, 2026-09-23 14:46). 몰 사진이 없는 리스팅은 평가하지 않는다.
 */
export function ListingEvaluationTab({ onEditStarted }: { onEditStarted?: () => void }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [modelId, setModelId] = useState('');
  const [evaluatingIds, setEvaluatingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const listings = useQuery({
    queryKey: queryKeys.channelListings.list({ page: String(page), limit: String(PAGE_SIZE), search: debouncedSearch, view: 'thumbnail-evaluation' }),
    queryFn: () => channelListingsApi.list({ page, limit: PAGE_SIZE, search: debouncedSearch }),
  });
  const items = useMemo(() => listings.data?.items ?? [], [listings.data]);
  const listingImages = useMemo(
    () => items.map((item) => ({ channelListingId: item.id, imageUrl: item.imageUrl })),
    [items],
  );
  const current = useCurrentListingEvaluations(listingImages);
  const evaluationByListing = useMemo(
    () => new Map((current.data?.evaluations ?? []).map((row) => [row.channelListingId, row] as const)),
    [current.data],
  );
  const evaluate = useEvaluateListingThumbnail();
  const refreshEvaluations = useRefreshListingEvaluations();
  const editJobs = useCreateThumbnailEditJobs();

  const runEvaluation = async (targets: RegisteredChannelListing[]) => {
    if (!modelId) {
      toast.error('평가 모델을 먼저 고르세요');
      return;
    }
    const withImage = targets.filter((item) => item.imageUrl);
    setEvaluatingIds((prev) => new Set([...prev, ...withImage.map((item) => item.id)]));
    let failed = 0;
    // 모델 호출은 한 장씩 차례로 한다 — 동시에 보내 API 한도를 넘기지 않는다.
    for (const item of withImage) {
      try {
        await evaluate.mutateAsync({ channelListingId: item.id, imageUrl: item.imageUrl!, modelId });
      } catch {
        failed += 1;
      } finally {
        setEvaluatingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }
    await refreshEvaluations();
    if (withImage.length > 1) {
      if (failed === 0) toast.success(`${withImage.length}개 평가 완료`);
      else toast.warning(`${withImage.length - failed}개 평가, ${failed}개 실패`);
    } else if (failed > 0) {
      toast.error('평가에 실패했습니다');
    }
  };

  const startEdit = (item: RegisteredChannelListing) => {
    if (!item.contentWorkspaceId) return;
    editJobs.mutate(
      { contentWorkspaceIds: [item.contentWorkspaceId], purpose: 'compliance' },
      {
        onSuccess: () => {
          toast.success('AI 편집을 시작했습니다 — AI 편집 탭에서 결과를 채택하세요');
          onEditStarted?.();
        },
        onError: (error) => toast.error(friendlyError(error, 'AI 편집을 시작하지 못했습니다')),
      },
    );
  };

  const unevaluated = items.filter((item) => item.imageUrl && !evaluationByListing.has(item.id));
  const summary = current.data?.summary;

  if (listings.isError) {
    return <ErrorState message="리스팅을 불러오지 못했습니다" onRetry={() => listings.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Search size={14} className="text-slate-400" aria-hidden />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="리스팅 이름 검색"
            aria-label="리스팅 검색"
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </label>
        <select
          aria-label="평가 모델"
          value={modelId}
          onChange={(event) => setModelId(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="">평가 모델 선택</option>
          {EVALUATION_MODELS.map((model) => (
            <option key={model.id} value={model.id}>{model.label}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!modelId || unevaluated.length === 0 || evaluatingIds.size > 0}
          onClick={() => runEvaluation(unevaluated)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
        >
          {evaluatingIds.size > 0 && <Loader2 size={14} className="animate-spin" />}
          이 페이지 미평가 {unevaluated.length}개 평가
        </button>
      </div>

      {summary && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600" aria-label="등급 분포">
          <span className="font-semibold text-slate-900">평가 {summary.evaluated}</span>
          <span>미평가 {summary.unevaluated}</span>
          {LISTING_THUMBNAIL_GRADES.map((grade) => (
            <span key={grade} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5">
              <span className={cn('h-2 w-2 rounded-full', LISTING_THUMBNAIL_GRADE_BG[grade])} aria-hidden />
              {grade} {summary.byGrade[grade] ?? 0}
            </span>
          ))}
        </div>
      )}

      {listings.isLoading ? (
        <div className="flex justify-center py-12 text-slate-400"><Loader2 size={18} className="animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">리스팅이 없습니다</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {items.map((item) => (
            <ListingEvaluationRow
              key={item.id}
              item={item}
              evaluation={evaluationByListing.get(item.id) ?? null}
              evaluating={evaluatingIds.has(item.id)}
              canEvaluate={Boolean(modelId && item.imageUrl)}
              editPending={editJobs.isPending}
              onEvaluate={() => runEvaluation([item])}
              onEdit={() => startEdit(item)}
            />
          ))}
        </ul>
      )}

      {listings.data && listings.data.total > PAGE_SIZE && (
        <Pagination page={page} limit={PAGE_SIZE} total={listings.data.total} onPageChange={setPage} />
      )}
    </div>
  );
}

function ListingEvaluationRow({
  item,
  evaluation,
  evaluating,
  canEvaluate,
  editPending,
  onEvaluate,
  onEdit,
}: {
  item: RegisteredChannelListing;
  evaluation: ListingThumbnailEvaluation | null;
  evaluating: boolean;
  canEvaluate: boolean;
  editPending: boolean;
  onEvaluate: () => void;
  onEdit: () => void;
}) {
  const image = resolveImageUrl(item.imageUrl);
  const suggestions = Array.isArray(evaluation?.details.suggestions) ? (evaluation.details.suggestions as unknown[]) : [];
  return (
    <li data-testid={`listing-evaluation-${item.id}`} className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon size={18} className="text-slate-300" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{item.listingName}</p>
        <p className="truncate text-xs text-slate-500">
          {[item.channelAccountName, item.externalId].filter(Boolean).join(' · ')}
        </p>
        {typeof suggestions[0] === 'string' && (
          <p className="mt-0.5 truncate text-xs text-slate-600">{suggestions[0]}</p>
        )}
      </div>
      <div className="flex w-24 shrink-0 items-center justify-end gap-1.5">
        {evaluation ? (
          <>
            <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold text-white', LISTING_THUMBNAIL_GRADE_BG[evaluation.grade])}>
              {evaluation.grade}
            </span>
            <span className="text-xs font-semibold tabular-nums text-slate-700">{evaluation.score}점</span>
          </>
        ) : (
          <span className="text-xs text-slate-400">{item.imageUrl ? '미평가' : '몰 대표이미지 없음'}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          disabled={!canEvaluate || evaluating || Boolean(evaluation)}
          onClick={onEvaluate}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {evaluating && <Loader2 size={12} className="animate-spin" />}
          평가
        </button>
        <button
          type="button"
          disabled={!item.contentWorkspaceId || editPending}
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <Wand2 size={12} aria-hidden />
          AI 편집
        </button>
      </div>
    </li>
  );
}
