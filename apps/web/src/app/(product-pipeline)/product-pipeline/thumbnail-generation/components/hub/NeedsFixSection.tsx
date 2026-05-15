'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Scissors, Sparkles, Wrench } from 'lucide-react';

import { useAnalysisList } from '@/app/(product-pipeline)/product-pipeline/thumbnail-ai/hooks/useThumbnailAnalysis';
import { Pagination } from '@/components/ui/Pagination';
import { useGenerationList } from '../../../_shared/hooks/useThumbnailGenerations';
import { thumbnailGenerationEditHref } from '../../../_shared/lib/product-pipeline-routes';
import { needsThumbnailFix } from '../../../_shared/lib/thumbnail-classification';
import { resolveImageUrl } from '@/lib/resolve-url';
import { cn } from '@/lib/utils';
import type { ThumbnailAnalysisResult } from '@kiditem/shared/ai';

import { FeatureSelectionModal, type FeatureSelection } from './FeatureSelectionModal';
import { ImgWithSkeleton } from '../shared/ImgWithSkeleton';

const PAGE_SIZE = 24;

type SortKey = 'latest' | 'severity';

type Tokens = {
  badgeBg: string;
  badgeText: string;
  categoryText: string;
  category: string;
  description: string;
  ctaLabel: string;
  ctaIcon: typeof Scissors;
  ctaClass: string;
  action: FeatureSelection;
};

function tokensOf(r: ThumbnailAnalysisResult): Tokens {
  if (r.complianceGrade === 'FAIL') {
    return {
      badgeBg: 'bg-red-600',
      badgeText: 'text-white',
      categoryText: 'text-red-600',
      category: 'Violation',
      description: '쿠팡 정책 위반 감지 — 즉시 수정 필요',
      ctaLabel: '즉시 수정하기',
      ctaIcon: Scissors,
      ctaClass: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-600 hover:text-white',
      action: { mode: 'edit', editCase: 'single' },
    };
  }
  if (r.complianceGrade === 'WARN') {
    return {
      badgeBg: 'bg-amber-500',
      badgeText: 'text-white',
      categoryText: 'text-amber-600',
      category: 'Warning',
      description: '정책 경계 — 가이드라인 검토 권장',
      ctaLabel: '가이드라인 수정',
      ctaIcon: Scissors,
      ctaClass: 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-500 hover:text-white',
      action: { mode: 'edit', editCase: 'single' },
    };
  }
  const qualityMap: Record<string, string> = {
    F: '해상도/노이즈 기준 미달',
    C: '품질 개선 필요 — 배경/조명 약함',
    B: '품질 보통 — 연출 개선 여지 있음',
  };
  return {
    badgeBg: 'bg-fuchsia-600',
    badgeText: 'text-white',
    categoryText: 'text-fuchsia-700',
    category: 'Quality',
    description: qualityMap[r.grade] ?? '품질 개선 필요',
    ctaLabel: 'AI 연출 개선',
    ctaIcon: Sparkles,
    ctaClass: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200 hover:bg-fuchsia-600 hover:text-white',
    action: { mode: 'creative' },
  };
}

function severityScore(r: ThumbnailAnalysisResult): number {
  if (r.complianceGrade === 'FAIL') return 40;
  if (r.complianceGrade === 'WARN') return 30;
  if (r.grade === 'F') return 20;
  if (r.grade === 'C') return 15;
  if (r.grade === 'B') return 10;
  return 0;
}

export function NeedsFixSection({ returnTo = null }: { returnTo?: string | null }) {
  const router = useRouter();
  const { data, isLoading } = useAnalysisList();
  const { data: generations = [] } = useGenerationList();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortKey>('latest');
  const [picked, setPicked] = useState<ThumbnailAnalysisResult | null>(null);

  // thumbnails 페이지 "개선 필요" 탭과 single source of truth.
  // 필터: analyzed + needsThumbnailFix (FAIL[evidence 있음] || grade C/F) + 편집 파이프라인에 없는 것.
  // generation 이 하나라도 있으면 (pending/running/ready/applied/failed 무관) 제외 — AI 편집 탭에서 추적됨.
  const generatedProductIds = useMemo(
    () => new Set(generations.map((g) => g.productId).filter((id): id is string => Boolean(id))),
    [generations],
  );

  const allNeedsFix: ThumbnailAnalysisResult[] = useMemo(
    () =>
      (data?.allResults ?? []).filter(
        (r) => r.analyzed && needsThumbnailFix(r) && !generatedProductIds.has(r.productId),
      ),
    [data, generatedProductIds],
  );

  const needsFix = useMemo(() => {
    const sorted = [...allNeedsFix];
    if (sort === 'severity') {
      sorted.sort((a, b) => severityScore(b) - severityScore(a));
    } else {
      sorted.sort((a, b) => {
        const at = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
        return bt - at;
      });
    }
    return sorted;
  }, [allNeedsFix, sort]);

  const total = needsFix.length;
  const paged = needsFix.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isEmpty = !isLoading && allNeedsFix.length === 0;

  const gotoEdit = (r: ThumbnailAnalysisResult, selection: FeatureSelection) => {
    router.push(thumbnailGenerationEditHref({
      editCase: selection.mode === 'edit' ? selection.editCase : null,
      extraParams: {
        scene: selection.mode === 'creative' ? selection.scene : null,
        customPrompt: selection.mode === 'creative' && selection.customPrompt ? '1' : null,
      },
      imageUrl: r.imageUrl,
      mode: selection.mode,
      returnTo,
      subjectParams: { productId: r.productId },
    }));
  };

  const handleModalSelect = (selection: FeatureSelection) => {
    if (!picked) return;
    const target = picked;
    setPicked(null);
    gotoEdit(target, selection);
  };

  return (
    <section className="rounded-3xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(99,102,241,0.06)] px-6 py-7">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-red-100/60 backdrop-blur-sm border border-white/60 flex items-center justify-center">
            <Wrench size={16} className="text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">수정 추천</h3>
          <span className="text-xs font-bold text-gray-500 ml-1">전체 {total}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="text-xs font-bold bg-white/60 backdrop-blur-sm border border-white/70 rounded-lg px-3 py-1.5 text-gray-700 outline-none focus:border-violet-400 cursor-pointer"
          >
            <option value="latest">최신순</option>
            <option value="severity">심각도순</option>
          </select>
        </div>
      </div>

      {isLoading && allNeedsFix.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3">
            <CheckCircle2 size={22} className="text-emerald-500" />
          </div>
          <p className="text-sm font-bold text-gray-700">수정 추천 항목 없음</p>
          <p className="text-xs text-gray-500 mt-1 max-w-xs leading-relaxed">
            현재 정책 위반 · 품질 미달 상품이 없어요. 분석이 진행되면 여기 자동으로 표시됩니다.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-x-1 gap-y-6">
            {paged.map((r) => (
              <NeedsFixCard key={r.id} item={r} onPick={() => setPicked(r)} />
            ))}
          </div>

          <div className="mt-8">
            <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
          </div>
        </>
      )}

      <FeatureSelectionModal
        open={!!picked}
        productName={picked?.productName}
        onClose={() => setPicked(null)}
        onSelect={handleModalSelect}
      />
    </section>
  );
}

function NeedsFixCard({
  item,
  onPick,
}: {
  item: ThumbnailAnalysisResult;
  onPick: () => void;
}) {
  const t = tokensOf(item);
  const resolved = resolveImageUrl(item.imageUrl);
  const complianceLabel =
    item.complianceGrade === 'FAIL' ? 'FAIL' : item.complianceGrade === 'WARN' ? 'WARN' : null;

  return (
    <div className="flex flex-col group">
      <button
        type="button"
        onClick={onPick}
        className="relative w-full aspect-square overflow-hidden block text-left bg-white"
      >
        {resolved ? (
          <ImgWithSkeleton src={resolved} alt={item.productName} fit="cover" />
        ) : (
          <div className="w-full h-full bg-gray-100" />
        )}
        {complianceLabel && (
          <div className="absolute top-1 left-1">
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 shadow-sm', t.badgeBg, t.badgeText)}>
              {complianceLabel}
            </span>
          </div>
        )}
      </button>
      <div className="mt-1.5 flex items-center justify-between gap-1.5 px-0.5">
        <h5 className="text-[11px] font-medium text-gray-700 line-clamp-1 min-w-0">
          {item.productName}
        </h5>
        <span className="shrink-0 text-[10px] font-bold text-gray-500 tabular-nums">
          {item.grade}
        </span>
      </div>
    </div>
  );
}
